import { testFile } from "./runtime";
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { importProject, measureProject, writeTests } from './python-tools';
import type { Gold, FaultProbe } from './evaluation';
import type { Measurement, PythonReport } from './python-types';

/** Independently execute fixed contract witnesses; never expose them to the agent. */
export async function validateReference(root: string, archive: Buffer, gold: Gold, oracle: string, signal: AbortSignal) {
  let sourceFingerprint = '';
  const check = async (name: string, corrected: boolean) => {
    const directory = join(root, name);
    const snapshot = await importProject(directory, archive);
    if (!corrected) sourceFingerprint = snapshot.fingerprint;
    if (corrected && gold.fault) {
      const { file, before, after } = gold.fault;
      if (snapshot.files[file]?.split(before).length !== 2) throw new Error('Reference patch must match exactly once.');
      await writeFile(join(directory, 'source', file), snapshot.files[file].replace(before, after));
    }
    await writeTests(directory, [{ id: 'T1', behaviorId: 'oracle', functionName: 'test_contract', gapIndexes: [], code: oracle, quote: 'External fixed contract witnesses.', purpose: 'Validate the reference fixture outside model context.', approved: true }]);
    return measureProject(directory, [], true, signal);
  };
  const original = await check('original', false);
  const corrected = gold.fault ? await check('corrected', true) : undefined;
  const usable = (measurement: Measurement) => measurement.integrity && !measurement.timedOut && measurement.outcomes.length > 0 && !measurement.outcomes.some(outcome => ['error', 'skipped'].includes(outcome.status));
  const valid = usable(original) && original.exitCode === (gold.fault ? 1 : 0) && (!corrected || usable(corrected) && corrected.exitCode === 0 && corrected.outcomes.every(outcome => outcome.status === 'passed'));
  return { valid: !!valid, sourceFingerprint, faultHash: createHash('sha256').update(JSON.stringify(gold.fault || null)).digest('hex'), oracleHash: createHash('sha256').update(oracle).digest('hex'), original, corrected, scope: 'Fixed executable contract witnesses only; not independent semantic review or complete specification coverage.' };
}

/** Replay the final approved suite on a separate reference copy, without model calls. */
export async function probeReferenceSuite(root: string, archive: Buffer, gold: Gold, report: PythonReport, signal: AbortSignal) {
  const snapshot = await importProject(root, archive, report.runtime || 'python');
  if (snapshot.fingerprint !== report.fingerprint) throw new Error('Reference replay source differs from the measured project.');
  if (gold.fault) {
    const { file, before, after } = gold.fault;
    if (snapshot.files[file]?.split(before).length !== 2) throw new Error('Reference patch must match exactly once.');
    await writeFile(join(root, 'source', file), snapshot.files[file].replace(before, after));
  }
  await writeTests(root, report.tests);
  const measured = await measureProject(root, [], true, signal);
  return { ...measured, sourceFingerprint: snapshot.fingerprint,
    suiteHash: createHash('sha256').update(JSON.stringify(report.tests.filter(test => test.approved).map(test => ({ id: test.id, code: test.code })))).digest('hex') };
}

/** Check generated failures on a separate corrected copy; never change agent inputs. */
export async function probeFault(root: string, archive: Buffer, gold: Gold, report: PythonReport, signal: AbortSignal, finalReference?: Measurement): Promise<FaultProbe | undefined> {
  if (!gold.fault) return;
  const fault = gold.fault, corrected: Measurement[] = [], results: (boolean | null)[] = [];
  const suites = [report.improvements[0]?.before || report.tests, report.tests];
  for (const [index, tests] of suites.entries()) {
    const measured = index ? report.measurements.at(-1) : report.measurements[0];
    if (!measured || !measured.integrity || measured.timedOut) { results.push(null); continue; }
    const failed = measured.outcomes.filter((outcome) => outcome.status === 'failed' && tests.some((test) => test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName));
    if (!failed.length) { results.push(false); continue; }
    const checked = index === 1 && finalReference || await probeReferenceSuite(join(root, `reference-${index}`), archive, gold, { ...report, tests }, signal);
    corrected.push(checked);
    results.push(!checked.integrity || checked.timedOut ? null : failed.some((before) => checked.outcomes.some((after) => after.node === before.node && after.status === 'passed')));
  }
  return { id: fault.id, beforeDetected: results[0], afterDetected: results[1], corrected };
}
