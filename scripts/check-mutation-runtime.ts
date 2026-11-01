/** Replay an archived suite through real tools only; never call a model or replace evidence. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { importProject, inspectProject, measureProject, writeTests, dockerTool, sandboxImage } from '../lib/python-tools';
import { mutationExecutionReady, verificationPolicyVersion } from '../lib/verification-policy';
import { projectTestFile } from '../lib/runtime';
import type { Mutation, PythonReport } from '../lib/python-types';

async function main() {
  const [archivePath, reportPath, destination, budget = '75'] = process.argv.slice(2);
  const seconds = Number(budget);
  if (!archivePath || !reportPath || !destination || !Number.isInteger(seconds) || seconds < 1 || seconds > 75) throw new Error('Usage: tsx scripts/check-mutation-runtime.ts evidence.zip report.json new-output-directory [seconds:1-75]');
  const output = resolve(destination);
  await mkdir(dirname(output), { recursive: true }); await mkdir(output);
  const archiveBytes = await readFile(archivePath), archive = await JSZip.loadAsync(archiveBytes);
  const bytes = async (name: string) => { const file = archive.file(name); if (!file) throw new Error('Missing archived input: ' + name); return file.async('nodebuffer'); };
  const index = JSON.parse((await bytes('index.json')).toString());
  const report: PythonReport = JSON.parse((await bytes(reportPath)).toString());
  const entry = index.runs.find((entry: { report: string }) => entry.report === reportPath);
  if (!entry || report.status !== 'completed') throw new Error('Select a completed report in the frozen index.');
  const project = await bytes(entry.caseId + '.zip');
  if (createHash('sha256').update(project).digest('hex') !== index.inputs[entry.caseId].archiveHash) throw new Error('Archived source checksum differs.');
  const original: [string, string][] = JSON.parse((await bytes('agent-snapshot.json')).toString());
  const paths = [...new Set([...original.map(([file]) => file), 'scripts/check-mutation-runtime.ts'])];
  const snapshot = await Promise.all(paths.map(async file => [file, await readFile(file, 'utf8')]));
  const image = await sandboxImage(), root = await mkdtemp(join(tmpdir(), 'reqtest-mutation-runtime-'));
  const checks: Record<string, unknown> = { scope: 'Tool-only replay of unchanged saved assertions on unchanged source; no model calls or semantic review.', status: 'running', policyVersion: verificationPolicyVersion, sourceArchive: archivePath, archiveSha256: createHash('sha256').update(archiveBytes).digest('hex'), sourceReport: reportPath, sourceFingerprint: report.fingerprint, agentFingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), sandboxImage: image, mutationSeconds: seconds, modelRequests: 0, suiteHashes: report.tests.filter(test => test.approved).map(test => ({ id: test.id, sha256: createHash('sha256').update(test.code).digest('hex') })) };
  const save = () => writeFile(join(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  await writeFile(join(output, 'agent-snapshot.json'), JSON.stringify(snapshot)); await save();
  const signal = AbortSignal.timeout(240000), started = Date.now();
  try {
    if ((await importProject(root, project)).fingerprint !== report.fingerprint) throw new Error('Imported source fingerprint differs.');
    await mkdir(join(root, 'generated'), { recursive: true });
    const inspected = await inspectProject(root, signal, image);
    await writeTests(root, report.tests);
    const nodes = inspected.testFiles || inspected.nodes;
    const baseline = await measureProject(root, nodes, false, signal, image);
    const measured = await measureProject(root, nodes, true, signal, image);
    await writeFile(join(output, 'execution.json'), JSON.stringify({ baseline, measured }, null, 2));
    checks.baselineSkipped = baseline.outcomes.filter(outcome => outcome.status === 'skipped').length;
    checks.generatedPassed = measured.outcomes.filter(outcome => outcome.file.startsWith('reqtest_generated/') && outcome.status === 'passed').length;
    checks.ready = mutationExecutionReady({ ...report, baseline }, measured); await save();
    if (!checks.ready) throw new Error('Saved suite is not eligible for mutation.');
    const files = [...new Set(report.tests.filter(test => test.approved).flatMap(test => report.analysis?.behaviors.find(behavior => behavior.id === test.behaviorId)?.files || []))].filter(file => file.endsWith('.py') && !projectTestFile(file, inspected.nodes));
    if (!files.length) throw new Error('No mapped Python source is eligible.');
    const mutationStarted = Date.now();
    const mutation = await dockerTool<Mutation>(root, { action: 'mutate', files, file: files[0], nodes: inspected.nodes, seconds }, signal, image);
    await writeFile(join(output, 'mutation.json'), JSON.stringify(mutation, null, 2));
    const mutationElapsedMs = Date.now() - mutationStarted;
    Object.assign(checks, { status: 'completed', mutationElapsedMs, withinProductionBackstop: mutationElapsedMs < 110000, totalMutants: mutation.totalMutants, returnedMutants: mutation.mutants.length, availableDiffs: mutation.mutants.filter(mutant => mutant.diff).length, incomplete: mutation.incomplete, timedOut: mutation.timedOut, mutationScope: mutation.scope });
  } catch (error) { Object.assign(checks, { status: 'failed', error: error instanceof Error ? error.message : 'Tool replay failed.' }); throw error; }
  finally { checks.elapsedMs = Date.now() - started; await save(); await rm(root, { recursive: true, force: true }); }
  console.log(JSON.stringify(checks));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
