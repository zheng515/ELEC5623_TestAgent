import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runPython, type Reason } from '../lib/python-agent';
import { projectTestFile } from '../lib/runtime';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema } from '../lib/python-types';
import { report, project, analysis, artifact, approval, code, rule } from './fixtures/python-agent';

test('the four-configuration protocol rejects omitted baselines, disabled mutation and seeded/shared substitutes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-variants-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile('examples/experiments-baselines.json', 'utf8'));
  for (const change of [ { variants: ['B1', 'B3'] }, { policy: { mutationChecks: false } }, { sharedInitialSuite: true }, { cases: [{ ...manifest.cases[0], initialTests: 'outside-project.json' }] } ]) {
    const path = join(root, 'manifest.json'); await writeFile(path, JSON.stringify({ ...manifest, ...change }));
    await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/evaluate.ts', path, '--validate-only']), /requires independent B0-B3 workflows/);
  }
});

test('test context filtering recognizes collected custom files and common Python/Node layouts', () => {
  for (const file of ['tests/unit/check.py', 'test_fee.py', 'fee_test.py', 'conftest.py', '__tests__/fee.ts', 'fee.spec.ts', 'fee.test.mjs']) assert.equal(projectTestFile(file), true, file);
  assert.equal(projectTestFile('custom_checks.py', ['custom_checks.py::test_fee']), true);
  assert.equal(projectTestFile('app/shipping.py'), false);
  assert.equal(projectTestFile('werkzeug/test.py'), false, 'A production test-client module is implementation code.');
  assert.equal(projectTestFile('app/testing.py'), false);
});

test('B0/B1 generate directly without analysis or execution feedback; only B1 receives repository evidence', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 35000 }, async t => {
  const root = await project(t, { 'source/shipping.py': code.replace('>=', '>'), 'source/README.md': 'shipping fee evidence DOCUMENT_SENTINEL', 'source/tests/test_shipping.py': 'from shipping import fee\ndef test_nominal():\n    assert fee(20000) == 0  # TEST_ORACLE_SENTINEL\n' });
  for (const variant of ['B0', 'B1'] as const) {
    const r = report(); let calls = 0;
    const ask: Reason = async (schema, _task, raw) => {
      calls++; assert.ok(Object.is(schema, testsSchema));
      const context = raw as { files: Record<string, string>; functions: { file: string }[]; existingTests: string[]; ruleLinks: unknown[]; analysis?: unknown; baseline?: unknown; collection?: unknown; assets: unknown[] };
      assert.equal(context.analysis, undefined); assert.equal(context.baseline, undefined); assert.equal(context.collection, undefined);
      assert.deepEqual(context.ruleLinks, [{ ruleId: 'R1', behaviorId: 'B1' }]);
      if (variant === 'B0') {
        assert.deepEqual(Object.keys(context.files), ['shipping.py']);
        assert.deepEqual(context.existingTests, []); assert.deepEqual(context.assets, []);
        assert.ok(context.functions.every(item => item.file === 'shipping.py'));
        assert.ok(!JSON.stringify(context).includes('DOCUMENT_SENTINEL'));
        assert.ok(!JSON.stringify(context).includes('TEST_ORACLE_SENTINEL'));
      } else {
        assert.ok(context.files['README.md'].includes('DOCUMENT_SENTINEL'));
        assert.ok(context.files['tests/test_shipping.py'].includes('TEST_ORACLE_SENTINEL'));
        assert.ok(context.existingTests.includes('tests/test_shipping.py::test_nominal'));
      }
      return schema.parse({ tests: [{ ...artifact, gapIndexes: [] }] });
    };
    await runPython(r, root, AbortSignal.timeout(15000), () => {}, ask, variant);
    assert.equal(calls, 1); assert.equal(r.baseline!.outcomes.length, 1);
    assert.equal(r.measurements.length, 1); assert.ok(r.measurements[0].outcomes.some(outcome => outcome.status === 'failed'));
    assert.deepEqual(r.diagnoses, []); assert.deepEqual(r.improvements, []); assert.deepEqual(r.mutations, []);
    assert.equal(r.configuration!.improvementLimit, 0);
    assert.equal(r.configuration!.configuredFeatures!.failureDiagnosis, false);
    assert.equal(r.configuration!.configuredFeatures!.mutationGuidance, false);
    assert.ok(r.states.every(state => state.status !== 'Verified'));
    if (variant === 'B0') assert.deepEqual(r.retrieval!.documents, []);
    else assert.ok(r.retrieval!.documents.some(item => item.file === 'README.md'));
  }
});

test('B2 attempts repair from failure without a diagnosis; B3 retains a diagnosed implementation defect', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 40000 }, async t => {
  const implementation = code.replace('>=', '>');
  for (const variant of ['B2', 'B3'] as const) {
    const root = await project(t, { 'source/shipping.py': implementation }), r = report();
    let generations = 0, reviews = 0, diagnoses = 0;
    const ask: Reason = async (schema, task) => {
      if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
      if (Object.is(schema, testsSchema)) {
        if (generations++) {
          assert.equal(variant, 'B2'); assert.match(task, /without classifying the failure cause/);
          return schema.parse({ tests: [{ ...artifact, code: artifact.code.replace('== 0', '== 1000') }] });
        }
        return schema.parse({ tests: [artifact] });
      }
      if (Object.is(schema, reviewTestsSchema)) return schema.parse(reviews++ ? { decisions: [{ testId: 'T1', supported: false, quote: rule, reason: 'The replacement weakens a requirement-grounded assertion.' }], coverage: [] } : approval('T1'));
      if (Object.is(schema, diagnosisSchema)) {
        diagnoses++; assert.equal(variant, 'B3');
        return schema.parse({ decisions: [{ testId: 'T1', category: 'potential_implementation_defect', quote: rule, reason: 'The code excludes the inclusive boundary.', executionQuote: 'assert 1000 == 0', evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: 'assert fee(10000) == 0' }] }] });
      }
      throw new Error('Unexpected model stage.');
    };
    await runPython(r, root, AbortSignal.timeout(18000), () => {}, ask, variant);
    assert.equal(generations, variant === 'B2' ? 2 : 1); assert.equal(diagnoses, variant === 'B3' ? 1 : 0);
    assert.equal(r.diagnoses.length, variant === 'B3' ? 1 : 0);
    assert.equal(r.tests[0].code, artifact.code); assert.equal(r.improvements.length, 0);
    assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'failed');
    assert.equal(r.configuration!.configuredFeatures!.mutationGuidance, true);
    assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), implementation);
    if (variant === 'B2') assert.equal(r.testAttempts!.at(-1)!.status, 'rejected');
  }
});
