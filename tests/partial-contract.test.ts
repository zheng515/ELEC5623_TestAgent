import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPython, type Reason } from '../lib/python-agent';
import { analysisSchema, testsSchema, reviewTestsSchema } from '../lib/python-types';
import { verificationGate } from '../lib/run-evaluation';
import { project, report, analysis, artifact, rule, code } from './fixtures/python-agent';

test('defined incomplete cases execute only with an explicit original-contract scope review', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 60000 }, async t => {
  for (const scenario of ['defined', 'no_scope', 'invented_scope', 'unsupported', 'ambiguous'] as const) await t.test(scenario, async t => {
    const root = await project(t), saved = report(); saved.policy = { mutationChecks: false };
    const scope = scenario === 'no_scope' ? null : { contractExcerpt: scenario === 'invented_scope' ? 'Orders below 10000 are free.' : rule, inputs: 'Exactly 10000 integer cents.', reason: 'The explicitly stated inclusive boundary determines this expectation without defining other input domains.' };
    const ask: Reason = async schema => {
      if (Object.is(schema, analysisSchema)) {
        const result = analysis(); result.behaviors[0].issue = scenario === 'ambiguous' ? 'ambiguous' : 'incomplete';
        result.behaviors[0].reason = 'Other input domains are unspecified.';
        return schema.parse(result);
      }
      if (Object.is(schema, testsSchema)) return schema.parse({ tests: [artifact] });
      if (Object.is(schema, reviewTestsSchema)) return schema.parse({ decisions: [{ testId: 'T1', supported: scenario !== 'unsupported', quote: rule, reason: 'Review of the assigned boundary.', definedScope: scope }] });
      throw Error('A passing scoped test must not request diagnosis, mutation or repair.');
    };
    await runPython(saved, root, AbortSignal.timeout(10000), () => {}, ask);
    assert.equal(saved.tests[0].approved, scenario === 'defined');
    assert.equal(saved.measurements.at(-1)!.outcomes.length, scenario === 'defined' ? 1 : 0);
    assert.equal(saved.analysis!.behaviors[0].issue, scenario === 'ambiguous' ? 'ambiguous' : 'incomplete');
    assert.equal(saved.states[0].status, 'Uncertain'); assert.equal(verificationGate(saved, true), false);
    if (scenario === 'defined') {
      assert.equal(saved.measurements.at(-1)!.outcomes[0].status, 'passed');
      assert.deepEqual(saved.tests[0].reviewDecision!.definedScope, scope);
      assert.match(saved.tests[0].review!, /Scoped execution only/);
    }
    const { readFile } = await import('node:fs/promises');
    assert.equal(await readFile(root + '/source/shipping.py', 'utf8'), code);
  });
});
