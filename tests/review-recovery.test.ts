import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPython } from '../lib/python-agent';
import { relevanceSchema } from '../lib/python-types';
import { rule, code, artifact, report, analysis, project, approval, scripted } from './fixtures/python-agent';

const docker = { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 180000 };
for (const mode of ['supported', 'rejected', 'ambiguous', 'duplicate', 'unquoted']) test(`rejected-test recovery: ${mode}`, docker, async t => {
  const root = await project(t), r = report(), a = analysis();
  if (mode === 'ambiguous') a.behaviors[0].issue = 'ambiguous';
  const bad = { ...artifact, code: artifact.code.replace('== 0', '== 1') };
  const rejection = { testId: 'T1', supported: false, reason: 'Expected 1 contradicts the explicit return value 0.', quote: mode === 'unquoted' ? 'invented quote' : rule };
  const recoverable = ['supported', 'rejected'].includes(mode);
  const responses: unknown[] = [a, { tests: [bad] }, { decisions: mode === 'duplicate' ? [rejection, rejection] : [rejection] }];
  if (recoverable) responses.push({ tests: [artifact] }, mode === 'supported' ? approval('T1') : { decisions: [rejection] });
  const answer = scripted(...responses); let calls = 0;
  await runPython(r, root, new AbortController().signal, () => {}, async (...args) => {
    // Missing mutation judgments remain unresolved; a successful repair is not an adequacy claim.
    if (Object.is(args[0], relevanceSchema)) return args[0].parse({ decisions: [] });
    calls++; return answer(...args);
  });
  assert.equal(calls, recoverable ? 5 : 3, 'One proposal correction and one new review at most');
  assert.equal(r.status, 'completed');
  assert.equal(r.measurements[0].outcomes.length, 0, 'Unsupported expectations never execute');
  assert.equal(r.improvements.length, mode === 'supported' ? 1 : 0);
  assert.equal(r.improvementProposal?.length, recoverable ? 1 : undefined);
  if (recoverable) assert.equal(r.improvementProposal![0].approved, mode === 'supported');
  assert.equal(r.measurements.length, mode === 'supported' ? 2 : 1);
  assert.equal(r.tests[0].approved, mode === 'supported');
  assert.equal(r.tests[0].code, mode === 'supported' ? artifact.code : bad.code);
  assert.ok(r.measurements.every(measurement => measurement.integrity));
  assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
  if (mode === 'supported') {
    assert.equal(r.improvements[0].before[0].approved, false);
    assert.equal(r.improvements[0].before[0].code, bad.code);
    assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'passed');
    assert.equal(r.mutations.length, 1, 'A repaired passing suite must receive the main branch mutation checks.');
    const mutation = r.mutations[0];
    const unresolved = mutation.incomplete || mutation.mutants.some(mutant => ['survived', 'unknown'].includes(mutant.status));
    assert.equal(r.states[0].status, unresolved ? 'Partially Verified' : 'Verified');
  } else assert.notEqual(r.states[0].status, 'Verified');
});

test('a supported behavior without any proposal can use the same bounded budget for a new reviewed check', docker, async t => {
  const root = await project(t), r = report();
  const answer = scripted(analysis(), { tests: [] }, { tests: [artifact] }, approval('T1'));
  await runPython(r, root, new AbortController().signal, () => {}, async (...args) =>
    Object.is(args[0], relevanceSchema) ? args[0].parse({ decisions: [] }) : answer(...args));
  assert.equal(r.measurements[0].outcomes.length, 0);
  assert.equal(r.tests[0].approved, true);
  assert.equal(r.improvements.length, 1);
  assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'passed');
  assert.equal(r.testAttempts?.length, 2);
});

test('correcting a rejected proposal preserves an approved test exposing a real defect', docker, async t => {
  const source = code.replace('>= 10000', '> 10000');
  const root = await project(t, { 'source/shipping.py': source }), r = report();
  const bad = { ...artifact, id: 'T2', code: artifact.code.replace('fee(10000) == 0', 'fee(20000) == 1') };
  const replacement = { ...bad, code: bad.code.replace('== 1', '== 0') };
  const decision = { testId: 'T1', category: 'potential_implementation_defect', reason: 'The inclusive threshold returns 1000.', quote: rule, executionQuote: 'assert 1000 == 0', evidence: [{ file: 'shipping.py', quote: '> 10000' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: 'assert fee(10000) == 0' }] };
  const ask = scripted(analysis(), { tests: [artifact, bad] }, { decisions: [...approval('T1').decisions, { testId: 'T2', supported: false, reason: 'Expected 1 is unsupported.', quote: rule }] }, { decisions: [decision] }, { tests: [replacement] }, approval('T2'), { decisions: [decision] });
  await runPython(r, root, new AbortController().signal, () => {}, ask);
  assert.equal(r.improvements.length, 1);
  assert.equal(r.measurements.length, 2);
  assert.equal(r.tests.find(test => test.id === 'T1')!.code, artifact.code);
  assert.equal(r.tests.find(test => test.id === 'T2')!.code, replacement.code);
  assert.equal(r.measurements.at(-1)!.outcomes.find(outcome => outcome.file.endsWith('T1.py'))!.status, 'failed');
  assert.equal(r.measurements.at(-1)!.outcomes.find(outcome => outcome.file.endsWith('T2.py'))!.status, 'passed');
  assert.ok(r.diagnoses.every(item => item.category === 'potential_implementation_defect'));
  assert.equal(r.states[0].status, 'Uncertain');
  assert.ok(r.measurements.every(measurement => measurement.integrity));
  assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), source);
});
