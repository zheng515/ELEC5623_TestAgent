import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetedRequest, ModelBudgetError, requestUsage, verificationPolicySchema } from '../lib/verification-policy';
import { runPython, type Reason } from '../lib/python-agent';
import { verificationGate, runEvaluation } from '../lib/run-evaluation';
import { analysisSchema, testsSchema, reviewTestsSchema } from '../lib/python-types';
import { report, project, analysis, artifact, approval, recordCoverage } from './fixtures/python-agent';

test('budget reserves durably before dispatch, counts failures and unknown interrupted usage', async () => {
  const r = report(); r.resources = { limit: 2, requests: [] };
  const persisted: string[] = []; const save = () => { persisted.push(JSON.stringify(r.resources)); };
  let calls = 0;
  await budgetedRequest(r, 'first', save, async request => {
    calls++;
    assert.equal(JSON.parse(persisted.at(-1)!).requests[0].status, 'started');
    Object.assign(request, { inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  });
  await assert.rejects(budgetedRequest(r, 'second', save, async () => { calls++; throw new Error('Provider failed.'); }), /Provider failed/);
  await assert.rejects(budgetedRequest(r, 'third', save, async () => { calls++; }), ModelBudgetError);
  assert.equal(calls, 2); assert.equal(r.resources.exhausted, true);
  assert.deepEqual(requestUsage(r), { used: 2, remaining: 0, reportedTokens: 5, unknownUsage: 1 });
  const recovered = structuredClone(r); recovered.resources!.requests[1].status = 'started';
  await assert.rejects(budgetedRequest(recovered, 'retry', save, async () => { calls++; }), ModelBudgetError);
  assert.equal(calls, 2, 'Worker recovery cannot reset the consumed budget.');
  const unsaved = report(); unsaved.resources = { limit: 1, requests: [] };
  await assert.rejects(budgetedRequest(unsaved, 'not-dispatched', () => { throw new Error('Database offline.'); }, async () => { calls++; }), /Database offline/);
  assert.equal(calls, 2, 'A failed reservation must prevent dispatch.');
  for (const limit of [0, 1.5, NaN]) assert.equal(verificationPolicySchema.safeParse({ modelRequestLimit: limit }).success, false);
  assert.equal(verificationPolicySchema.parse({ modelRequestLimit: 60 }).modelRequestLimit, 60, 'Large specifications may set any positive limit');
});

test('without a request limit every request is dispatched and still recorded', async () => {
  assert.equal(verificationPolicySchema.parse({}).modelRequestLimit, undefined);
  const r = report(); r.resources = { limit: null, requests: [] };
  let calls = 0;
  for (let index = 0; index < 60; index++) await budgetedRequest(r, 'request-' + index, () => {}, async request => { calls++; Object.assign(request, { totalTokens: 1 }); });
  assert.equal(calls, 60); assert.equal(r.resources.exhausted, undefined);
  assert.deepEqual(requestUsage(r), { used: 60, remaining: null, reportedTokens: 60, unknownUsage: 0 });
});

test('requesting less assurance or exhausting a budget cannot upgrade a saved positive state', () => {
  const r = report(); r.status = 'completed'; r.analysis = analysis(); r.tests = [structuredClone(artifact)];
  const node = 'reqtest_generated/test_reqtest_T1.py::test_threshold';
  r.measurements = [{ integrity: true, timedOut: false, exitCode: 0, log: '', outcomes: [{ node, file: node.split('::')[0], name: 'test_threshold', status: 'passed', message: '' }] }];
  r.states = [{ id: 'B1', status: 'Verified', reason: 'Saved positive fixture.', nodes: [node] }]; recordCoverage(r);
  r.policy = { mutationChecks: false, modelRequestLimit: 3 };
  assert.equal(runEvaluation(r).requirements[0].status, 'Partially Verified');
  assert.equal(verificationGate(r, true), false);
  assert.equal(verificationGate(r, false), true, 'Explicit non-strict gates can accept supported partial checks.');
  r.resources = { limit: 3, requests: [], exhausted: true };
  assert.equal(runEvaluation(r).requirements[0].status, 'Uncertain');
  assert.equal(verificationGate(r, false), false);
});

test('requirement checks retain admission while skipping mutation; cached responses consume no new requests', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async t => {
  const root = await project(t), r = report(); r.policy = { mutationChecks: false, modelRequestLimit: 3 };
  let calls = 0; const cache = new Map<string, unknown>();
  const ask: Reason = async (schema, _task, _context, _model, _signal, usage) => {
    calls++; usage?.({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });
    if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
    if (Object.is(schema, testsSchema)) return schema.parse({ tests: [artifact] });
    if (Object.is(schema, reviewTestsSchema)) return schema.parse(approval('T1'));
    throw new Error('No extra model stage is permitted.');
  };
  const cached = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, await task());
    return structuredClone(cache.get(key)) as T;
  };
  await runPython(r, root, AbortSignal.timeout(20000), () => {}, ask, 'B3', cached);
  assert.equal(calls, 3); assert.equal(r.resources!.requests.length, 3);
  assert.equal(r.mutations.length, 0); assert.equal(r.tests[0].approved, true);
  assert.equal(r.states[0].status, 'Partially Verified'); assert.equal(r.measurements[0].outcomes[0].status, 'passed');
  assert.deepEqual(requestUsage(r), { used: 3, remaining: 0, reportedTokens: 6, unknownUsage: 0 });
  const resumed = report(); resumed.policy = r.policy; resumed.resources = structuredClone(r.resources);
  await runPython(resumed, root, AbortSignal.timeout(20000), () => {}, ask, 'B3', cached);
  assert.equal(calls, 3); assert.equal(resumed.resources!.requests.length, 3);
  assert.equal(resumed.resources!.exhausted, undefined, 'Reusing completed cached requests is allowed at the limit.');
  const limited = report(); limited.policy = { mutationChecks: false, modelRequestLimit: 2 }; calls = 0;
  await assert.rejects(runPython(limited, root, AbortSignal.timeout(20000), () => {}, ask), ModelBudgetError);
  assert.equal(calls, 2); assert.equal(limited.resources!.requests.length, 2);
  assert.equal(limited.measurements.length, 0, 'No unreviewed candidate executes when admission cannot be requested.');
  assert.equal(verificationGate(limited, false), false);
});
