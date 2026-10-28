/** Repeated component evaluation; reference labels are never sent to a model. */
import { loadEnvConfig } from '@next/env';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decisionCases, type DecisionCase } from '../examples/benchmark/decision-cases';
import { decisionHash, decisionReferenceSchema, scoreDecisions, type DecisionAttempt } from '../lib/decision-evaluation';
import { reason, testReviewTask, diagnosisTask } from '../lib/python-agent';
import { diagnosisSchema, reviewTestsSchema } from '../lib/python-types';
import { prepareDecisionReview } from '../lib/decision-review';

async function summarize(root: string) {
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
  const cases: DecisionCase[] = JSON.parse(await readFile(join(root, 'cases.json'), 'utf8'));
  const reference = decisionReferenceSchema.parse(JSON.parse(await readFile(join(root, 'reference.json'), 'utf8')));
  const attempts: DecisionAttempt[] = JSON.parse(await readFile(join(root, 'attempts.json'), 'utf8'));
  if (decisionHash(cases) !== index.datasetHash) throw new Error('Frozen input cases changed. Start a new evaluation.');
  const snapshot = await readFile(join(root, 'agent-snapshot.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (snapshot !== null && decisionHash(JSON.parse(snapshot)) !== index.agentFingerprint) throw new Error('Frozen Agent snapshot changed.');
  const metrics = scoreDecisions(cases, reference, attempts, index.repeat, index.agentFingerprint);
  await writeFile(join(root, 'metrics.json'), JSON.stringify(metrics, null, 2));
  await writeFile(join(root, 'summary.md'), [
    '# Repeated decision evaluation', '', 'Model: ' + index.model, 'Dataset purpose: development challenge cases; not held out.',
    'This evaluates raw model classification, not whole-agent test admission or diagnosis grounding. Fixture trace summaries are synthetic. Classifications use the production tasks and reason function.', '',
    `Valid decisions: ${metrics.validDecisions}/${metrics.expectedDecisions}. Unanimous cases: ${metrics.rows.filter(row => row.unanimous).length}/${metrics.cases}. Missing/invalid: ${metrics.missingOrInvalid}.`,
    'Consistency is agreement on identical inputs, not correctness. Errors and missing repeats remain in the denominator.',
    'Reference status: ' + metrics.referenceStatus + '. Independent accuracy fields require human review and all planned valid decisions. AI-assisted reference comparisons are explicitly labelled development agreement.', '',
    `Classification accuracy: ${metrics.classificationAccuracy ?? 'unavailable'}; diagnosis accuracy: ${metrics.diagnosisAccuracy ?? 'unavailable'}; false-support rate: ${metrics.falseSupportRate ?? 'unavailable'}.`, '',
    `Test-admission precision / recall / F1: ${metrics.testAdmission?.precision ?? 'unavailable'} / ${metrics.testAdmission?.recall ?? 'unavailable'} / ${metrics.testAdmission?.f1 ?? 'unavailable'}.`,
    `Diagnosis Macro-F1: ${metrics.diagnosisMacroF1 ?? 'unavailable'} across ${metrics.diagnosisScoredClasses} represented classes. Inspect diagnosisConfusion in metrics.json.`, metrics.metricScope, '',
    ...(metrics.referenceComparison ? [
      'Reference comparison basis: ' + metrics.referenceComparison.basis + '.',
      `Agreement with reference: ${metrics.referenceComparison.agreementRate ?? 'unavailable'}; diagnosis agreement: ${metrics.referenceComparison.diagnosisAgreementRate ?? 'unavailable'}.`,
      `Admission precision / recall / F1 against reference: ${metrics.referenceComparison.testAdmission?.precision ?? 'unavailable'} / ${metrics.referenceComparison.testAdmission?.recall ?? 'unavailable'} / ${metrics.referenceComparison.testAdmission?.f1 ?? 'unavailable'}.`,
      `Diagnosis Macro-F1 against reference: ${metrics.referenceComparison.diagnosisMacroF1 ?? 'unavailable'}. Inspect referenceComparison.diagnosisConfusion in metrics.json.`,
      'AI-reference agreement is not independent human accuracy, external validation or a held-out result.', '',
    ] : []),
    '| Case | Component | Repeated labels | Reference labels |', '| --- | --- | --- | --- |',
    ...metrics.rows.map(row => `| ${row.id} | ${row.kind} | ${row.predictions.map(label => label || 'missing/invalid').join(', ')} | ${row.draftAllowed.join(', ')} |`), '',
    'Inspect cases.json and attempts.json. Independently check reference.json against original requirements, source, test and trace, then set reviewed=true and enter the reviewer name. Do not copy predictions into reference labels.',
    'Re-score without model calls: npm run evaluate:decisions -- score ' + root, '',
  ].join('\n'));
  return metrics;
}
async function main() {
  if (process.argv[2] === 'prepare') {
    if (!process.argv[3]) throw new Error('Supply a new reviewer-pack directory; existing directories are never overwritten.');
    const controller = new AbortController(); process.once('SIGINT', () => controller.abort());
    await prepareDecisionReview(resolve(process.argv[3]), decisionCases, controller.signal);
    console.log('Prepared independent review pack with actual Docker evidence; no model calls: ' + resolve(process.argv[3])); return;
  }
  if (process.argv[2] === 'score') {
    if (!process.argv[3]) throw new Error('Supply an evaluation directory.');
    const root = resolve(process.argv[3]); await summarize(root); console.log('Scored: ' + join(root, 'summary.md')); return;
  }
  loadEnvConfig(process.cwd(), true);
  if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY. This command makes paid model requests.');
  const repeat = Number(process.argv[2] || 3);
  if (!Number.isInteger(repeat) || repeat < 2 || repeat > 5) throw new Error('Use 2–5 repetitions.');
  const referenceFlag = process.argv.indexOf('--reference');
  if (referenceFlag >= 0 && !process.argv[referenceFlag + 1]) throw new Error('Supply a reference JSON path after --reference.');
  const reference = decisionReferenceSchema.parse(JSON.parse(await readFile(referenceFlag >= 0 ? process.argv[referenceFlag + 1] : 'examples/benchmark/decision-reference.json', 'utf8')));
  const agentFiles = ['lib/python-agent.ts', 'lib/python-types.ts', 'lib/model.ts', 'lib/decision-evaluation.ts', 'scripts/evaluate-decisions.ts', 'package-lock.json'];
  const agentSnapshot = await Promise.all(agentFiles.map(async file => [file, await readFile(file, 'utf8')]));
  const agentFingerprint = decisionHash(agentSnapshot);
  scoreDecisions(decisionCases, reference, [], repeat, agentFingerprint);
  const root = resolve('.evidence/decision-evaluation', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  const index = { createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || 'gpt-6-luna', repeat, datasetHash: decisionHash(decisionCases), agentFingerprint, status: 'running' };
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'index.json'), JSON.stringify(index, null, 2));
  await writeFile(join(root, 'cases.json'), JSON.stringify(decisionCases, null, 2));
  await writeFile(join(root, 'reference.json'), JSON.stringify(reference, null, 2));
  await writeFile(join(root, 'tasks.json'), JSON.stringify({ testReviewTask, diagnosisTask }, null, 2));
  await writeFile(join(root, 'agent-snapshot.json'), JSON.stringify(agentSnapshot));
  const attempts: DecisionAttempt[] = [], cancelled = new AbortController();
  process.once('SIGINT', () => cancelled.abort());
  console.log(`${decisionCases.length} cases × ${repeat} repetitions; up to ${decisionCases.length * repeat} paid model calls. No automatic retries.`);
  for (let repetition = 1; repetition <= repeat; repetition++) for (const item of [...decisionCases.slice(repetition - 1), ...decisionCases.slice(0, repetition - 1)]) {
    if (cancelled.signal.aborted) break;
    const currentSnapshot = await Promise.all(agentFiles.map(async file => [file, await readFile(file, 'utf8')]));
    if (decisionHash(currentSnapshot) !== agentFingerprint) throw new Error('Agent source changed during evaluation. Retain partial results and start a new frozen evaluation.');
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
  console.log(`Saved: ${join(root, 'summary.md')}. Valid ${metrics.validDecisions}/${metrics.expectedDecisions}; reference=${metrics.referenceStatus}; reference agreement=${metrics.referenceComparison?.agreementRate ?? 'unavailable'}; independent accuracy=${metrics.classificationAccuracy ?? 'unavailable'}.`);
  process.exitCode = cancelled.signal.aborted ? 130 : metrics.missingOrInvalid ? 1 : 0;
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Decision evaluation failed.'); process.exitCode = 1; });
