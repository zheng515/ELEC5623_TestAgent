import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decisionCases } from '../examples/benchmark/decision-cases';
import { decisionHash, decisionLabel, decisionReferenceSchema, scoreDecisions, type DecisionAttempt } from '../lib/decision-evaluation';
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
});
test('consistent false support is exposed separately from classification agreement', () => {
  const wrong = attempts();
  for (const attempt of wrong.filter(item => item.caseId === 'C04')) (attempt.output as { decisions: { supported: boolean }[] }).decisions[0].supported = true;
  const result = scoreDecisions(decisionCases, { ...reference, reviewed: true, reviewer: 'Independent scoring fixture reviewer' }, wrong, 3, 'fixture-v1');
  assert.equal(result.unanimousCaseRate, 1); assert.equal(result.falseSupportRate, 1 / 4);
  assert.equal(result.classificationAccuracy, 30 / 33);
});
test('missing, failed and invalid repeats stay in the denominator and prevent accuracy scoring', () => {
  for (const mode of ['missing', 'error', 'invalid'] as const) {
    const data = attempts();
    if (mode === 'missing') data.pop();
    else if (mode === 'error') data[data.length - 1].error = 'Request timed out.';
    else data[data.length - 1].output = { decisions: [] };
    const result = scoreDecisions(decisionCases, { ...reference, reviewed: true, reviewer: 'Independent scoring fixture reviewer' }, data, 3, 'fixture-v1');
    assert.equal(result.expectedDecisions, 33); assert.equal(result.missingOrInvalid, 1);
    assert.equal(result.completionRate, 32 / 33); assert.equal(result.unanimousCaseRate, 10 / 11);
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

test('decision challenge snippets reproduce their stated execution scenarios in Docker', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  for (const item of decisionCases) {
    const root = await mkdtemp(join(tmpdir(), 'reqtest-decision-case-'));
    try {
      await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
      for (const [file, code] of Object.entries(item.context.files)) if (!file.startsWith('reqtest_generated/')) await writeFile(join(root, 'source', file), code);
      await writeTests(root, item.context.tests.map(test => ({ ...test, approved: true })));
      const result = await measureProject(root, [], true, AbortSignal.timeout(15000));
      assert.ok(result.integrity);
      assert.ok(result.outcomes.some(outcome => outcome.status === (['C01', 'C03', 'C10', 'C11'].includes(item.id) ? 'passed' : item.id === 'C09' ? 'error' : 'failed')), item.id + ': ' + result.log);
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
