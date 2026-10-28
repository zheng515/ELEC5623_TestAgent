import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decisionCases } from '../examples/benchmark/decision-cases';
import { decisionHash, decisionLabel, decisionReferenceSchema, decisionResources, scoreDecisions, type DecisionAttempt } from '../lib/decision-evaluation';
import { measureProject, writeTests } from '../lib/python-tools';

const reference = decisionReferenceSchema.parse(JSON.parse(readFileSync('examples/benchmark/decision-reference.json', 'utf8')));
function attempts(): DecisionAttempt[] {
  return decisionCases.flatMap(item => Array.from({ length: 3 }, (_, i) => {
    const label = reference.labels.find(label => label.id === item.id)!.allowed[0];
    const decision = { testId: 'T1', reason: 'Deterministic scoring fixture.', quote: item.context.rules[0].text, ...(item.kind === 'test_review' ? { supported: label === 'supported' } : { category: label, executionQuote: item.context.measurement!.log, evidence: [] }) };
    return { caseId: item.id, repeat: i + 1, inputHash: decisionHash(item.context), agentFingerprint: 'fixture-v1', elapsedMs: 1, output: { decisions: [decision] } };
  }));
}
test('stable raw classifications cannot manufacture accuracy from draft labels', () => {
  const result = scoreDecisions(decisionCases, reference, attempts(), 3, 'fixture-v1');
  assert.equal(reference.reviewed, false); assert.equal(result.unanimousCaseRate, 1);
  assert.equal(result.classificationAccuracy, null); assert.equal(result.falseSupportRate, null);
  assert.equal(result.referenceStatus, 'pending_independent_review');
  assert.equal(result.testAdmission, null); assert.equal(result.diagnosisMacroF1, null); assert.equal(result.diagnosisConfusion, null);
});
test('resource totals retain unknown usage, failures, zero usage and planned missing requests', () => {
  const data = attempts().slice(0, 3);
  data[0].usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  data[1].usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  data[2].error = 'Timeout without provider usage';
  data[0].elapsedMs = 10; data[1].elapsedMs = 30; data[2].elapsedMs = 20;
  const partial = decisionResources(data, 4);
  assert.equal(partial.totalTokens.knownSubtotal, 15);
  assert.equal(partial.totalTokens.reportedRequests, 2);
  assert.equal(partial.totalTokens.unavailableRequests, 1);
  assert.equal(partial.totalTokens.completeTotal, null);
  assert.equal(partial.missingRequests, 1); assert.equal(partial.failedRequests, 1);
  assert.deepEqual(partial.latencyMs, { measuredRequests: 3, total: 60, median: 20, p95: 30, maximum: 30 });
  assert.equal(decisionResources(data.slice(0, 2), 2).totalTokens.completeTotal, 15);
  assert.equal(decisionResources([], 48).totalTokens.knownSubtotal, null);
  assert.equal(decisionResources([], 48).latencyMs.median, null);
  data[0].usage = { totalTokens: -1, inputTokens: NaN };
  assert.equal(decisionResources(data, 3).totalTokens.reportedRequests, 1);
});
test('sealed CLI studies reject changed reference/tasks and retain separate justified revisions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-sealed-score-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ai = decisionReferenceSchema.parse(JSON.parse(readFileSync('experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json', 'utf8')));
  const tasks = { testReviewTask: 'Frozen fixture', diagnosisTask: 'Frozen fixture' }, snapshot = [['fixture.ts', 'fixture']];
  const fingerprint = decisionHash(snapshot), data = attempts().map(item => ({ ...item, agentFingerprint: fingerprint }));
  await writeFile(join(root, 'index.json'), JSON.stringify({ schemaVersion: 2, model: 'offline-fixture', datasetHash: decisionHash(decisionCases), referenceHash: decisionHash(ai), tasksHash: decisionHash(tasks), agentFingerprint: fingerprint, repeat: 3 }));
  for (const [file, value] of Object.entries({ 'cases.json': decisionCases, 'reference.json': ai, 'attempts.json': data, 'tasks.json': tasks, 'agent-snapshot.json': snapshot })) await writeFile(join(root, file), JSON.stringify(value));
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/evaluate-decisions.ts', 'score', root, ...args], { timeout: 10000 });
  await run();
  const baseline = readFileSync(join(root, 'metrics.json'), 'utf8');
  const updated = structuredClone(ai); updated.labels.find(item => item.id === 'C04')!.allowed = ['supported'];
  await writeFile(join(root, 'reference.json'), JSON.stringify(updated));
  await assert.rejects(run(), /Frozen reference changed/);
  assert.equal(readFileSync(join(root, 'metrics.json'), 'utf8'), baseline);
  await writeFile(join(root, 'reference.json'), JSON.stringify(ai));
  const candidate = join(root, 'candidate.json'); await writeFile(candidate, JSON.stringify(updated));
  await assert.rejects(run('--reference', candidate), /both --reference/);
  await run('--reference', candidate, '--reason', 'Offline fixture: demonstrate a disclosed label revision');
  const [revisionName] = await readdir(join(root, 'reference-revisions'));
  const revisionRoot = join(root, 'reference-revisions', revisionName);
  const record = JSON.parse(readFileSync(join(revisionRoot, 'revision.json'), 'utf8'));
  assert.equal(record.originalReferenceHash, decisionHash(ai));
  assert.equal(record.scoredReferenceHash, decisionHash(updated));
  assert.equal(record.attemptsHash, decisionHash(data));
  assert.equal(record.changedLabels[0].id, 'C04'); assert.ok(record.reason);
  assert.equal(JSON.parse(readFileSync(join(revisionRoot, 'metrics.json'), 'utf8')).referenceComparison.agreementRate, 45 / 48);
  assert.equal(JSON.parse(readFileSync(join(revisionRoot, 'disagreements.json'), 'utf8'))[0].id, 'C04');
  assert.equal(readFileSync(join(root, 'metrics.json'), 'utf8'), baseline);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'reference.json'), 'utf8')), ai);
  await writeFile(join(root, 'tasks.json'), '{}');
  await assert.rejects(run(), /Frozen task text changed/);
  await writeFile(join(root, 'tasks.json'), JSON.stringify(tasks));
  await rm(join(root, 'agent-snapshot.json'));
  await assert.rejects(run(), /snapshot is missing/);
});
test('accepted AI references produce scoped agreement without becoming independent human accuracy', () => {
  const raw = JSON.parse(readFileSync('experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json', 'utf8'));
  const ai = decisionReferenceSchema.parse(raw);
  assert.equal(ai.reviewed, false); assert.equal(ai.annotation?.source, 'ai_assisted');
  assert.deepEqual(ai.labels[0].evidence, raw.labels[0].evidence, 'Exact annotation provenance survives freezing.');
  const data = attempts();
  for (const item of data.filter(item => item.caseId === 'C04')) (item.output as { decisions: { supported: boolean }[] }).decisions[0].supported = true;
  const result = scoreDecisions(decisionCases, ai, data, 3, 'fixture-v1');
  assert.equal(result.referenceStatus, 'ai_assisted_reference');
  assert.equal(result.referenceComparison!.basis, 'ai_assisted');
  assert.equal(result.referenceComparison!.agreementRate, 45 / 48);
  assert.equal(result.referenceComparison!.testAdmission!.precision, 3 / 4);
  assert.equal(result.referenceComparison!.testAdmission!.recall, 1);
  assert.equal(result.referenceComparison!.diagnosisMacroF1, 1);
  assert.equal(result.classificationAccuracy, null); assert.equal(result.diagnosisAccuracy, null);
  assert.equal(result.testAdmission, null); assert.equal(result.diagnosisMacroF1, null);
  const renamed = scoreDecisions(decisionCases, { ...ai, reviewed: true, reviewer: 'A changed flag alone is not human review' }, data, 3, 'fixture-v1');
  assert.equal(renamed.referenceStatus, 'ai_assisted_reference'); assert.equal(renamed.classificationAccuracy, null);
  const incomplete = scoreDecisions(decisionCases, ai, data.slice(1), 3, 'fixture-v1');
  assert.equal(incomplete.missingOrInvalid, 1); assert.equal(incomplete.referenceComparison!.agreementRate, null);
  const unaccepted = structuredClone(ai); unaccepted.annotation!.acceptedAsDevelopmentReference = false;
  assert.equal(scoreDecisions(decisionCases, unaccepted, data, 3, 'fixture-v1').referenceComparison, null);
  const unfinished = structuredClone(ai); unfinished.annotation!.completed = false;
  assert.equal(scoreDecisions(decisionCases, unfinished, data, 3, 'fixture-v1').referenceComparison, null);
  assert.equal(decisionReferenceSchema.safeParse({ ...raw, annotation: { ...raw.annotation, source: 'human' } }).success, false, 'Known AI annotation metadata cannot silently change source type.');
});
test('offline CLI names AI-reference comparison and withholds scores when no model decisions exist', async t => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-ai-reference-score-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ai = JSON.parse(readFileSync('experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json', 'utf8'));
  await writeFile(join(root, 'index.json'), JSON.stringify({ model: 'no-model-calls-fixture', datasetHash: decisionHash(decisionCases), agentFingerprint: 'fixture-v1', repeat: 3 }));
  await writeFile(join(root, 'cases.json'), JSON.stringify(decisionCases));
  await writeFile(join(root, 'reference.json'), JSON.stringify(ai));
  await writeFile(join(root, 'attempts.json'), '[]');
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util');
  await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/evaluate-decisions.ts', 'score', root], { timeout: 10000 });
  const metrics = JSON.parse(readFileSync(join(root, 'metrics.json'), 'utf8'));
  const summary = readFileSync(join(root, 'summary.md'), 'utf8');
  assert.equal(metrics.referenceStatus, 'ai_assisted_reference'); assert.equal(metrics.validDecisions, 0);
  assert.equal(metrics.referenceComparison.agreementRate, null); assert.equal(metrics.classificationAccuracy, null);
  assert.match(summary, /Reference comparison basis: ai_assisted/);
  assert.match(summary, /Agreement with reference: unavailable/);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'reference.json'), 'utf8')), ai);
});
test('consistent false support is exposed separately from classification agreement', () => {
  const wrong = attempts();
  for (const attempt of wrong.filter(item => item.caseId === 'C04')) (attempt.output as { decisions: { supported: boolean }[] }).decisions[0].supported = true;
  const result = scoreDecisions(decisionCases, { ...reference, reviewed: true, reviewer: 'Independent scoring fixture reviewer' }, wrong, 3, 'fixture-v1');
  assert.equal(result.unanimousCaseRate, 1); assert.equal(result.falseSupportRate, 1 / 6);
  assert.equal(result.classificationAccuracy, 45 / 48);
  assert.equal(result.testAdmission!.precision, 3 / 4); assert.equal(result.testAdmission!.recall, 1);
  assert.equal(result.testAdmission!.f1, 6 / 7);
  assert.equal(result.diagnosisMacroF1, 1); assert.equal(result.diagnosisScoredClasses, 4);
});
test('diagnosis confusion exposes wrong causes; set-valued references cannot manufacture Macro-F1', () => {
  const data = attempts();
  for (const item of data.filter(item => item.caseId === 'C06')) (item.output as { decisions: { category: string }[] }).decisions[0].category = 'generated_test_error';
  const reviewed = { ...reference, reviewed: true, reviewer: 'Independent scoring fixture reviewer' };
  const result = scoreDecisions(decisionCases, reviewed, data, 3, 'fixture-v1');
  assert.equal(result.diagnosisConfusion!.find(row => row.expected === 'potential_implementation_defect')!.predicted.generated_test_error, 3);
  assert.ok(result.diagnosisMacroF1! < 1);
  const multiple = structuredClone(reviewed); multiple.labels.find(item => item.id === 'C06')!.allowed.push('uncertain');
  const setValued = scoreDecisions(decisionCases, multiple, attempts(), 3, 'fixture-v1');
  assert.equal(setValued.diagnosisAccuracy, 1); assert.equal(setValued.diagnosisConfusion, null); assert.equal(setValued.diagnosisMacroF1, null);
});
test('missing, failed and invalid repeats stay in the denominator and prevent accuracy scoring', () => {
  for (const mode of ['missing', 'error', 'invalid'] as const) {
    const data = attempts();
    if (mode === 'missing') data.pop();
    else if (mode === 'error') data[data.length - 1].error = 'Request timed out.';
    else data[data.length - 1].output = { decisions: [] };
    const result = scoreDecisions(decisionCases, { ...reference, reviewed: true, reviewer: 'Independent scoring fixture reviewer' }, data, 3, 'fixture-v1');
    assert.equal(result.expectedDecisions, 48); assert.equal(result.missingOrInvalid, 1);
    assert.equal(result.completionRate, 47 / 48); assert.equal(result.unanimousCaseRate, 15 / 16);
    assert.equal(result.classificationAccuracy, null);
  }
});
test('scores reject duplicate attempts, mismatched agent versions and changed inputs or reference IDs', () => {
  const duplicate = attempts(); duplicate.push(duplicate[0]);
  assert.throws(() => scoreDecisions(decisionCases, reference, duplicate, 3, 'fixture-v1'), /Attempt/);
  assert.throws(() => scoreDecisions(decisionCases, reference, attempts(), 3, 'other-agent'), /agent version/);
  const changed = structuredClone(decisionCases); changed[0].context.rules[0].text += ' Changed.';
  assert.throws(() => scoreDecisions(changed, reference, attempts(), 3, 'fixture-v1'), /exact frozen dataset/);
  const labels = structuredClone(reference); labels.labels[0].id = 'unknown';
  assert.throws(() => scoreDecisions(decisionCases, labels, attempts(), 3, 'fixture-v1'), /exact frozen dataset/);
  assert.throws(() => scoreDecisions(decisionCases, { ...reference, reviewed: true }, attempts(), 3, 'fixture-v1'), /named independent reviewer/);
  const contradictory = structuredClone(reference); contradictory.labels[0].allowed = ['supported', 'blocked'];
  assert.throws(() => scoreDecisions(decisionCases, contradictory, attempts(), 3, 'fixture-v1'), /test support needs one decision/);
});
test('wrong IDs, invented quotes and duplicate model decisions are invalid rather than blocked', () => {
  const attempt = attempts()[0];
  for (const output of [
    { decisions: [{ testId: 'T999', supported: false, quote: reference.labels[0].rationale, reason: 'Wrong ID' }] },
    { decisions: [{ testId: 'T1', supported: true, quote: 'Invented rule', reason: 'Invented quote' }] },
    { decisions: [{ testId: 'T1', supported: false, quote: '', reason: 'No original quote' }] },
  ]) assert.equal(decisionLabel(decisionCases[0], { ...attempt, output }), null);
  const duplicate = structuredClone(attempt.output) as { decisions: unknown[] }; duplicate.decisions.push(duplicate.decisions[0]);
  assert.equal(decisionLabel(decisionCases[0], { ...attempt, output: duplicate }), null);
  const other = structuredClone(decisionCases[0]); other.context.tests[0].id = 'T2';
  assert.equal(decisionLabel(other, { ...attempt, output: { decisions: [{ testId: 'T2', supported: true, quote: other.context.rules[0].text, reason: 'Exact contract.' }] } }), 'supported');
});

test('decision challenge snippets reproduce their stated execution scenarios in Docker', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 90000 }, async () => {
  for (const item of decisionCases) {
    const root = await mkdtemp(join(tmpdir(), 'reqtest-decision-case-'));
    try {
      await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
      for (const [file, code] of Object.entries(item.context.files)) if (!file.startsWith('reqtest_generated/')) await writeFile(join(root, 'source', file), code);
      await writeTests(root, item.context.tests.map(test => ({ ...test, approved: true })));
      const result = await measureProject(root, [], true, AbortSignal.timeout(15000));
      assert.ok(result.integrity);
      assert.ok(result.outcomes.some(outcome => outcome.status === (['C01', 'C03', 'C10', 'C11', 'C12', 'C16'].includes(item.id) ? 'passed' : ['C09', 'C14'].includes(item.id) ? 'error' : 'failed')), item.id + ': ' + result.log);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('explicit type predicates reject values that pass value-only equality', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-contract-type-'));
  const scenarios = [
    ...['0', '0.0', 'False'].map(value => ({ weak: decisionCases[0], strict: decisionCases[9], file: 'shipping.py', code: 'def fee(amount):\n    return ' + value + '\n', expected: value === '0' ? 'passed' : 'failed' })),
    { weak: decisionCases[2], strict: decisionCases[10], file: 'calendar_window.py', code: decisionCases[2].context.files['calendar_window.py'], expected: 'passed' },
    { weak: decisionCases[2], strict: decisionCases[10], file: 'calendar_window.py', code: 'class PretendDate:\n    def __eq__(self, other): return True\ndef window(start, end):\n    return PretendDate(), PretendDate()\n', expected: 'failed' },
  ];
  try {
    await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
    for (const scenario of scenarios) {
      await writeFile(join(root, 'source', scenario.file), scenario.code);
      for (const [item, expected] of [[scenario.weak, 'passed'], [scenario.strict, scenario.expected]] as const) {
        await writeTests(root, item.context.tests.map(test => ({ ...test, approved: true })));
        const result = await measureProject(root, [], true, AbortSignal.timeout(10000));
        assert.ok(result.integrity); assert.equal(result.outcomes.length, 1);
        assert.equal(result.outcomes[0].status, expected, scenario.code + ': ' + result.log);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
