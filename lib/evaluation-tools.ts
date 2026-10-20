import { testFile } from "./runtime";
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { importProject, measureProject, writeTests } from './python-tools';
import type { Gold, FaultProbe } from './evaluation';
import type { Measurement, PythonReport } from './python-types';

/** Check generated failures on a separate corrected copy; never change agent inputs. */
export async function probeFault(root: string, archive: Buffer, gold: Gold, report: PythonReport, signal: AbortSignal): Promise<FaultProbe | undefined> {
  if (!gold.fault) return;
  const fault = gold.fault, corrected: Measurement[] = [], results: (boolean | null)[] = [];
  const suites = [report.improvements[0]?.before || report.tests, report.tests];
  for (const [index, tests] of suites.entries()) {
    const measured = index ? report.measurements.at(-1) : report.measurements[0];
    if (!measured || !measured.integrity || measured.timedOut) { results.push(null); continue; }
    const failed = measured.outcomes.filter((outcome) => outcome.status === 'failed' && tests.some((test) => test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName));
    if (!failed.length) { results.push(false); continue; }
    const reference = join(root, `reference-${index}`);
    const snapshot = await importProject(reference, archive, report.runtime || "python");
    const source = snapshot.files[fault.file];
    if (!source || source.split(fault.before).length !== 2) throw new Error('Reference patch must match exactly once in a retained project file.');
    await writeFile(join(reference, 'source', fault.file), source.replace(fault.before, fault.after));
    await writeTests(reference, tests);
    const checked = await measureProject(reference, [], true, signal);
    corrected.push(checked);
    results.push(!checked.integrity || checked.timedOut ? null : failed.some((before) => checked.outcomes.some((after) => after.node === before.node && after.status === 'passed')));
  }
  return { id: fault.id, beforeDetected: results[0], afterDetected: results[1], corrected };
}
