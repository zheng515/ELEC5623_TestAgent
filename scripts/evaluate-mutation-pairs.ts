/** Review-only replay: reuse frozen execution evidence, never rerun or patch target code. */
import { loadEnvConfig } from '@next/env';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { reason, mutationReviewTask, reviewSurvivingMutations, updateStates } from '../lib/python-agent';
import { relevanceSchema, type PythonReport } from '../lib/python-types';
import { verificationGate } from '../lib/run-evaluation';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  loadEnvConfig(process.cwd(), true);
  if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY. This command makes paid model requests.');
  const [reportPath, archivePath, outputPath] = process.argv.slice(2);
  if (!reportPath || !archivePath || !outputPath) throw new Error('Supply a frozen report, project ZIP and new output directory.');
  const before: PythonReport = JSON.parse(await readFile(reportPath, 'utf8'));
  if (before.status !== 'completed' || !before.mutations.at(-1)?.mutants.some(mutant => mutant.status === 'survived')) throw new Error('Use completed execution evidence with surviving mutants.');
  const archive = await JSZip.loadAsync(await readFile(archivePath));
  const files = Object.fromEntries(await Promise.all(Object.values(archive.files).filter(file => !file.dir).map(async file => [file.name, await file.async('string')])));
  if (hash(Object.entries(files).sort()) !== before.fingerprint) throw new Error('Source archive differs from the frozen execution.');
  const paths = ['lib/python-agent.ts', 'lib/python-types.ts', 'lib/mutation-review.ts', 'lib/run-evaluation.ts', 'lib/model.ts', 'scripts/evaluate-mutation-pairs.ts', 'package-lock.json'];
  const snapshot = await Promise.all(paths.map(async path => [path, await readFile(path, 'utf8')]));
  const fingerprint = hash(snapshot), output = resolve(outputPath);
  await mkdir(output, { recursive: false });
  await writeFile(join(output, 'before.json'), JSON.stringify(before, null, 2));
  await writeFile(join(output, 'source.zip'), await readFile(archivePath));
  await writeFile(join(output, 'agent-snapshot.json'), JSON.stringify(snapshot));
  const attempts = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
    if (hash(await Promise.all(paths.map(async path => [path, await readFile(path, 'utf8')]))) !== fingerprint) throw new Error('Agent changed during replay.');
    const report = structuredClone(before), requests: object[] = [];
    let error: string | undefined;
    try {
      await reviewSurvivingMutations(report, async pairs => {
        const started = Date.now();
        try { return await reason(relevanceSchema, mutationReviewTask, { rules: report.rules, analysis: report.analysis, files, pairs }, report.model, AbortSignal.timeout(180000), usage => requests.push({ pairs: pairs.map(pair => [pair.id, pair.behaviorId]), elapsedMs: Date.now() - started, usage })); }
        catch (failure) { requests.push({ pairs: pairs.map(pair => [pair.id, pair.behaviorId]), elapsedMs: Date.now() - started, failed: true }); throw failure; }
      });
      updateStates(report);
    } catch (failure) { error = (failure instanceof Error ? failure.message : 'Review failed.').replaceAll(process.env.OPENAI_API_KEY!, '[redacted]'); }
    if (hash(report.tests) !== hash(before.tests) || hash(report.measurements) !== hash(before.measurements)) throw new Error('Replay changed frozen tests or execution.');
    await writeFile(join(output, `after-${repeat}.json`), JSON.stringify(report, null, 2));
    attempts.push({ repeat, error, requests, states: report.states, strictGateAfter: error ? null : verificationGate(report, true), testsUnchanged: true, measurementsUnchanged: true });
    await writeFile(join(output, 'metrics.json'), JSON.stringify({ scope: 'Review-only development replay with existing negative pair judgments retained. Minimal source/analysis context and production review task. No fresh execution or independent semantic accuracy.', agentFingerprint: fingerprint, originalModel: before.model, strictGateBefore: verificationGate(before, true), plannedRepeats: 3, attempts }, null, 2));
    console.log(`Repeat ${repeat}: ${error ? 'request failed; retained' : verificationGate(report, true) ? 'strict gate passed' : 'strict gate blocked'}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
