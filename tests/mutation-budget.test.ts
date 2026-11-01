import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPython, finalizeIncompleteRun, type Checkpoint, type Reason } from '../lib/python-agent';
import { pendingMutationReviewPairs, mutationReviewBudget, mutationReviewProgress } from '../lib/mutation-review';
import { referenceReplayEligible, verificationPolicySchema } from '../lib/verification-policy';
import { verificationSummary, verificationGate } from '../lib/run-evaluation';
import { experimentCompletion } from '../lib/experiment-metrics';
import { ModelTimeoutError } from '../lib/model';
import { analysisSchema, testsSchema, reviewTestsSchema, relevanceSchema, type Mutation } from '../lib/python-types';
import { report, project, analysis, artifact, approval, rule, recordCoverage } from './fixtures/python-agent';

function mutations(count = 100, incomplete = false): Mutation {
  return { incomplete, timedOut: incomplete, log: 'Controlled mutation tool responses; no model quality claim.',
    mutants: Array.from({ length: count }, (_, i) => ({ id: `Mutant #${i + 1}`, file: 'shipping.py', line: i < 50 ? 2 : 3, status: 'survived', diff: `- >= 10000\n+ >= ${10001 + i}` })) };
}

test('review scheduling spreads source locations and leaves missing diffs unresolved', () => {
  const r = report(); r.analysis = analysis(); r.mutations = [mutations()];
  assert.deepEqual(pendingMutationReviewPairs(r).slice(0, 2).map(pair => pair.id), ['Mutant #1', 'Mutant #51']);
  r.mutations[0].mutants[0].diff = '';
  assert.equal(pendingMutationReviewPairs(r).length, 99);
  assert.equal(mutationReviewProgress(r).pendingPairs, 100);
});

test('stage limits preserve the global cap, improvement reserve and unknown in-flight usage', () => {
  const r = report(); r.analysis = analysis(); r.mutations = [mutations()];
  r.resources = { limit: 32, requests: Array.from({ length: 28 }, () => ({ key: 'core', stage: 'Admission', status: 'completed', startedAt: new Date().toISOString(), elapsedMs: 1 })) };
  assert.equal(mutationReviewBudget(r, 4).stopReason, 'improvement_reserve');
  assert.equal(mutationReviewBudget(r, 0).stopReason, undefined);
  r.resources.requests.push({ key: 'review', stage: 'Review surviving mutation relevance batch 1', status: 'started', startedAt: new Date(Date.now() - 61000).toISOString() });
  assert.equal(mutationReviewBudget(r).stopReason, 'time_limit');
  assert.equal(r.resources.exhausted, undefined);
  r.resources.requests.at(-1)!.elapsedMs = 1;
  assert.equal(mutationReviewBudget(r).stopReason, 'time_limit', 'An optional request timeout cannot trigger a later retry.');
  const capped = structuredClone(r); delete capped.mutationReview;
  capped.policy = { mutationChecks: true, mutationReviewRequestLimit: 1 };
  assert.equal(mutationReviewBudget(capped).stopReason, 'request_limit');
  assert.equal(mutationReviewProgress(capped).requestsUsed, 1, 'An interrupted attempt still consumes a review slot.');
  for (const value of [-1, 0.5]) assert.equal(verificationPolicySchema.safeParse({ mutationReviewRequestLimit: value }).success, false);
  assert.equal(verificationPolicySchema.parse({ mutationReviewRequestLimit: 0 }).mutationReviewRequestLimit, 0);
});

test('experiment completion keeps failed and limited workflows distinct', () => {
  assert.equal(experimentCompletion(4, [{ status: 'completed', limited: false }, { status: 'failed', limited: false }]).status, 'completed_with_failures');
  assert.equal(experimentCompletion(1, [{ status: 'completed', limited: true }]).status, 'completed_with_limits');
  assert.equal(experimentCompletion(1, [{ status: 'completed', limited: false }]).status, 'completed');
});

test('failed assessment can replay its exact executed suite without changing failure or verification', () => {
  const r = report(); r.analysis = analysis(); r.tests = [artifact];
  r.status = 'failed'; r.stage = 'Review remaining mutation relevance batch 23';
  r.measurements = [{ integrity: true, timedOut: false, exitCode: 0, log: '', outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_threshold', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold', status: 'passed', message: '' }] }];
  r.states = [{ id: 'B1', status: 'Verified', reason: 'Stale state', nodes: [] }];
  finalizeIncompleteRun(r);
  assert.equal(r.states[0].status, 'Uncertain'); assert.equal(r.states[0].nodes.length, 1);
  assert.equal(referenceReplayEligible(r), true); assert.equal(r.status, 'failed');
  assert.equal(verificationGate(r), false);
  r.stage = 'Re-measure improved tests'; assert.equal(referenceReplayEligible(r), false, 'A failed execution can leave a stale measurement.');
  r.stage = 'Review remaining mutation relevance batch 23';
  r.tests.push({ ...artifact, id: 'T2' }); assert.equal(referenceReplayEligible(r), false);
});

test('saved positive states cannot hide unreviewed behavior pairs or incomplete mutation execution', () => {
  const r = report(); r.status = 'completed'; r.analysis = analysis(); r.tests = [artifact]; recordCoverage(r);
  r.states = [{ id: 'B1', status: 'Verified', reason: 'Saved positive', nodes: ['reqtest_generated/test_reqtest_T1.py::test_threshold'] }];
  r.measurements = [{ integrity: true, timedOut: false, exitCode: 0, log: '', outcomes: [{ node: r.states[0].nodes[0], file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold', status: 'passed', message: '' }] }];
  r.mutations = [mutations(1)];
  assert.equal(verificationGate(r), false);
  assert.equal(verificationSummary(r).requirements[0].status, 'Partially Verified');
  r.mutations[0].mutants = []; r.mutations[0].incomplete = true;
  assert.equal(verificationGate(r), false);
});

const docker = { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 60000 };

test('both arms bound reviews across improvement and restore completed cached reviews at the limit', docker, async t => {
  for (const variant of ['B2', 'B3'] as const) {
    const root = await project(t), r = report();
    r.policy = { mutationChecks: true, modelRequestLimit: 32, mutationReviewRequestLimit: 4, mutationReviewTimeoutSeconds: 60 };
    r.execution = { queueId: 'fixture', image: process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', attempt: 1, recovered: false };
    let calls = 0, generations = 0, reviewCalls = 0;
    const ask: Reason = async (schema, _task, raw, _model, _signal, usage, timeoutMs) => {
      calls++; usage?.({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });
      if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
      if (Object.is(schema, testsSchema)) return schema.parse({ tests: [{ ...artifact, id: generations++ ? 'T2' : 'T1' }] });
      if (Object.is(schema, reviewTestsSchema)) return schema.parse(approval(...(generations > 1 ? ['T1', 'T2'] : ['T1'])));
      if (Object.is(schema, relevanceSchema)) {
        reviewCalls++; assert.ok(timeoutMs! > 0 && timeoutMs! <= 60000);
        const pairs = (raw as { pairs: { id: string; behaviorId: string }[] }).pairs;
        return schema.parse({ decisions: pairs.map(pair => ({ mutantId: pair.id, behaviorId: pair.behaviorId, relevant: true, quote: rule, reason: 'Controlled relevant survivor.' })) });
      }
      throw new Error('Unexpected model stage.');
    };
    const cache = new Map<string, unknown>();
    const checkpoint: Checkpoint = async (key, task) => {
      if (!cache.has(key)) cache.set(key, key.startsWith('stage:') && key.includes('selected mutations') ? mutations() : await task());
      return structuredClone(cache.get(key)) as Awaited<ReturnType<typeof task>>;
    };
    await runPython(r, root, AbortSignal.timeout(25000), () => {}, ask, variant, checkpoint);
    assert.equal(r.status, 'completed'); assert.equal(r.improvements.length, 1);
    assert.equal(reviewCalls, 4); assert.equal(r.mutationReview?.requestsUsed, 4);
    assert.equal(r.mutationReview?.pendingPairs, 36); assert.equal(r.mutationReview?.stopReason, 'request_limit');
    assert.equal(r.resources?.exhausted, undefined); assert.equal(verificationGate(r), false);
    assert.equal(verificationSummary(r).title, 'Checks recorded; mutation review limited');
    const billed = calls, recovered = report(); recovered.policy = r.policy; recovered.resources = structuredClone(r.resources); recovered.execution = r.execution;
    await runPython(recovered, root, AbortSignal.timeout(25000), () => {}, ask, variant, checkpoint);
    assert.equal(calls, billed, 'Recovery restores reviews even when their dispatch budget has been consumed.');
    assert.equal(recovered.relevance.length, 64); assert.equal(recovered.mutationReview?.pendingPairs, 36);
    assert.equal(recovered.mutationReview?.stopReason, 'request_limit');
  }
});

test('both arms skip terminal model review after admission repair and incomplete mutation execution', docker, async t => {
  for (const variant of ['B2', 'B3'] as const) {
    const root = await project(t), r = report();
    r.policy = { mutationChecks: true, modelRequestLimit: 32 };
    r.execution = { queueId: 'fixture', image: process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', attempt: 1, recovered: false };
    let generations = 0, reviews = 0;
    const ask: Reason = async (schema) => {
      if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
      if (Object.is(schema, testsSchema)) return schema.parse({ tests: generations++ ? [{ ...artifact, id: 'T2', code: artifact.code + '\n# Reviewed replacement\n' }] : [artifact, { ...artifact, id: 'T2' }] });
      if (Object.is(schema, reviewTestsSchema)) return schema.parse(reviews++ ? approval('T1', 'T2') : {
        decisions: [{ testId: 'T1', supported: true, quote: rule, reason: 'Supported witness.' }, { testId: 'T2', supported: false, quote: rule, reason: 'Controlled admission rejection.' }], coverage: [] });
      throw new Error(`Unexpected controlled stage: ${variant}, ${r.stage}, improvements=${r.improvements.length}.`);
    };
    const checkpoint: Checkpoint = async (key, task) => key.startsWith('stage:') && key.includes('selected mutations') ? mutations(100, true) as Awaited<ReturnType<typeof task>> : task();
    await runPython(r, root, AbortSignal.timeout(25000), () => {}, ask, variant, checkpoint);
    assert.equal(r.status, 'completed'); assert.equal(r.improvements.length, 1);
    assert.equal(r.mutationReview?.requestsUsed, 0); assert.equal(r.mutationReview?.pendingPairs, 100);
    assert.equal(r.mutationReview?.stopReason, 'incomplete_execution');
    assert.equal(r.states.some(state => state.status === 'Verified'), false);
    assert.equal(referenceReplayEligible(r), true); assert.equal(r.resources?.exhausted, undefined);
  }
});

test('optional review timeout is retained without retry; provider errors still fail the run', docker, async t => {
  for (const timeout of [true, false]) {
    const root = await project(t), r = report();
    r.policy = { mutationChecks: true, modelRequestLimit: 32 };
    r.execution = { queueId: 'fixture', image: process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', attempt: 1, recovered: false };
    let calls = 0;
    const ask: Reason = async schema => {
      if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
      if (Object.is(schema, testsSchema)) return schema.parse({ tests: [artifact] });
      if (Object.is(schema, reviewTestsSchema)) return schema.parse(approval('T1'));
      if (Object.is(schema, relevanceSchema)) { calls++; throw timeout ? new ModelTimeoutError(60) : new Error('Controlled provider outage.'); }
      throw new Error('Unexpected reasoning stage.');
    };
    const checkpoint: Checkpoint = async (key, task) => key.startsWith('stage:') && key.includes('selected mutations') ? mutations() as Awaited<ReturnType<typeof task>> : task();
    const run = runPython(r, root, AbortSignal.timeout(15000), () => {}, ask, 'B3', checkpoint);
    if (timeout) {
      await run;
      assert.equal(r.status, 'completed'); assert.equal(r.mutationReview?.stopReason, 'time_limit');
      assert.equal(r.mutationReview?.pendingPairs, 100); assert.equal(verificationGate(r), false);
    } else await assert.rejects(run, /Controlled provider outage/);
    assert.equal(calls, 1); assert.equal(r.resources?.requests.at(-1)?.status, 'failed');
    assert.equal(r.mutationReview?.requestsUsed, 1); assert.equal(r.resources?.exhausted, undefined);
  }
});
