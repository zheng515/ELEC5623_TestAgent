/** Repeated component evaluation; reference labels are never sent to a model. */
import { loadEnvConfig } from '@next/env';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decisionCases, type DecisionCase } from '../examples/benchmark/decision-cases';
import { decisionHash, decisionReferenceSchema, scoreDecisions, type DecisionAttempt } from '../lib/decision-evaluation';
import { reason, testReviewTask, diagnosisTask } from '../lib/python-agent';
import { diagnosisSchema, reviewTestsSchema } from '../lib/python-types';

async function summarize(root: string) {
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
  const cases: DecisionCase[] = JSON.parse(await readFile(join(root, 'cases.json'), 'utf8'));
  const reference = decisionReferenceSchema.parse(JSON.parse(await readFile(join(root, 'reference.json'), 'utf8')));
  const attempts: DecisionAttempt[] = JSON.parse(await readFile(join(root, 'attempts.json'), 'utf8'));
  if (decisionHash(cases) !== index.datasetHash) throw new Error('Frozen input cases changed. Start a new evaluation.');
  const metrics = scoreDecisions(cases, reference, attempts, index.repeat, index.agentFingerprint);
  await writeFile(join(root, 'metrics.json'), JSON.stringify(metrics, null, 2));
  await writeFile(join(root, 'summary.md'), [
    '# Repeated decision evaluation', '', 'Model: ' + index.model, 'Dataset purpose: development challenge cases; not held out.',
    'This evaluates raw model classification, not whole-agent test admission or diagnosis grounding. Fixture trace summaries are synthetic. Classifications use the production tasks and reason function.', '',
    `Valid decisions: ${metrics.validDecisions}/${metrics.expectedDecisions}. Unanimous cases: ${metrics.rows.filter(row => row.unanimous).length}/${metrics.cases}. Missing/invalid: ${metrics.missingOrInvalid}.`,
    'Consistency is agreement on identical inputs, not correctness. Errors and missing repeats remain in the denominator.',
    'Reference status: ' + metrics.referenceStatus + '. Accuracy and false-support metrics remain unavailable until every label is independently reviewed and every attempt is valid.', '',
    `Classification accuracy: ${metrics.classificationAccuracy ?? 'unavailable'}; diagnosis accuracy: ${metrics.diagnosisAccuracy ?? 'unavailable'}; false-support rate: ${metrics.falseSupportRate ?? 'unavailable'}.`, '',
    '| Case | Component | Repeated labels | Draft allowed labels |', '| --- | --- | --- | --- |',
    ...metrics.rows.map(row => `| ${row.id} | ${row.kind} | ${row.predictions.map(label => label || 'missing/invalid').join(', ')} | ${row.draftAllowed.join(', ')} |`), '',
    'Inspect cases.json and attempts.json. Independently check reference.json against original requirements, source, test and trace, then set reviewed=true and enter the reviewer name. Do not copy predictions into reference labels.',
    'Re-score without model calls: npm run evaluate:decisions -- score ' + root, '',
  ].join('\n'));
  return metrics;
}
async function main() {
  if (process.argv[2] === 'score') {
    if (!process.argv[3]) throw new Error('Supply an evaluation directory.');
    const root = resolve(process.argv[3]); await summarize(root); console.log('Scored: ' + join(root, 'summary.md')); return;
  }
  loadEnvConfig(process.cwd(), true);
  if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY. This command makes paid model requests.');
  const repeat = Number(process.argv[2] || 3);
  if (!Number.isInteger(repeat) || repeat < 2 || repeat > 5) throw new Error('Use 2–5 repetitions.');
  const reference = decisionReferenceSchema.parse(JSON.parse(await readFile('examples/benchmark/decision-reference.json', 'utf8')));
  const agentFiles = ['lib/python-agent.ts', 'lib/python-types.ts', 'lib/model.ts', 'package-lock.json'];
  const agentFingerprint = decisionHash(await Promise.all(agentFiles.map(async file => [file, await readFile(file, 'utf8')])));
  scoreDecisions(decisionCases, reference, [], repeat, agentFingerprint);
  const root = resolve('.evidence/decision-evaluation', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  const index = { createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || 'gpt-6-luna', repeat, datasetHash: decisionHash(decisionCases), agentFingerprint, status: 'running' };
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'index.json'), JSON.stringify(index, null, 2));
  await writeFile(join(root, 'cases.json'), JSON.stringify(decisionCases, null, 2));
  await writeFile(join(root, 'reference.json'), JSON.stringify(reference, null, 2));
  await writeFile(join(root, 'tasks.json'), JSON.stringify({ testReviewTask, diagnosisTask }, null, 2));
  const attempts: DecisionAttempt[] = [], cancelled = new AbortController();
  process.once('SIGINT', () => cancelled.abort());
  console.log(`${decisionCases.length} cases × ${repeat} repetitions; up to ${decisionCases.length * repeat} paid model calls. No automatic retries.`);
  for (let repetition = 1; repetition <= repeat; repetition++) for (const item of decisionCases) {
    if (cancelled.signal.aborted) break;
    const started = Date.now();
    const attempt: DecisionAttempt = { caseId: item.id, repeat: repetition, inputHash: decisionHash(item.context), agentFingerprint, elapsedMs: 0 };
    try {
      attempt.output = item.kind === 'test_review'
        ? await reason(reviewTestsSchema, testReviewTask, item.context, index.model, cancelled.signal)
        : await reason(diagnosisSchema, diagnosisTask, item.context, index.model, cancelled.signal);
    } catch (error) { attempt.error = (error instanceof Error ? error.message : 'Model request failed.').replaceAll(process.env.OPENAI_API_KEY, '[redacted]').slice(0, 2000); }
    attempt.elapsedMs = Date.now() - started; attempts.push(attempt);
    await writeFile(join(root, 'attempts.json'), JSON.stringify(attempts, null, 2));
    await summarize(root);
    console.log(`${item.id} repeat ${repetition}: ${attempt.error ? 'request failed; retained as unresolved' : 'recorded'}`);
  }
  index.status = cancelled.signal.aborted ? 'cancelled' : 'completed';
  await writeFile(join(root, 'index.json'), JSON.stringify(index, null, 2));
  await writeFile(join(root, 'attempts.json'), JSON.stringify(attempts, null, 2));
  const metrics = await summarize(root);
  console.log(`Saved: ${join(root, 'summary.md')}. Valid ${metrics.validDecisions}/${metrics.expectedDecisions}; accuracy=${metrics.classificationAccuracy ?? 'unavailable'}.`);
  process.exitCode = cancelled.signal.aborted ? 130 : metrics.missingOrInvalid ? 1 : 0;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Decision evaluation failed.'); process.exitCode = 1; });
