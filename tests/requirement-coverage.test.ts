import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPython, updateStates, type Reason } from '../lib/python-agent';
import { requirementCoverage } from '../lib/requirement-coverage';
import { runEvaluation, verificationGate } from '../lib/run-evaluation';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema, type PythonReport } from '../lib/python-types';
import { report, analysis, artifact, recordCoverage, project } from './fixtures/python-agent';

test('an interior witness cannot certify an explicit equality example without a suite review', () => {
  // Minimal regression fixture; no archived experiment result is required.
  const saved = report(); saved.status = 'completed'; saved.analysis = analysis();
  const requirement = 'ceil(x, options) returns the smallest option greater than or equal to x; ceil(4, options=[1.5, 2.5, 4, 6]) returns 4.';
  saved.rules = [{ id: 'R1', text: requirement }];
  Object.assign(saved.analysis.behaviors[0], { quote: requirement, text: requirement, files: ['mathutils.py'], evidence: [], gaps: [] });
  saved.tests = [{ ...artifact, quote: requirement, functionName: 'test_interior', code: 'from mathutils import ceil\ndef test_interior():\n    assert ceil(3.5, options=[1.5, 2.5, 4, 6]) == 4\n' }];
  const node = 'reqtest_generated/test_reqtest_T1.py::test_interior';
  saved.measurements = [{ integrity: true, timedOut: false, exitCode: 0, log: '', outcomes: [{ node, file: node.split('::')[0], name: 'test_interior', status: 'passed', message: '' }] }];
  saved.states = [{ id: 'B1', status: 'Verified', reason: 'Stale positive fixture.', nodes: [node] }];
  const before = JSON.stringify(saved);
  assert.equal(runEvaluation(saved).requirements[0].status, 'Partially Verified');
  assert.equal(verificationGate(saved, true), false);
  assert.equal(JSON.stringify(saved), before, 'Read-time protection must not rewrite saved evidence.');
  updateStates(saved);
  assert.equal(saved.states[0].status, 'Partially Verified');
});

test('coverage requires a unique original quote, the same reviewed suite and passing execution', () => {
  const r = report(); r.status = 'completed'; r.analysis = analysis(); r.tests = [structuredClone(artifact)];
  r.measurements = [{ outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_threshold', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold', status: 'passed', message: '' }], exitCode: 0, integrity: true, timedOut: false, log: '' }];
  recordCoverage(r);
  assert.equal(requirementCoverage(r, 'R1').complete, true);
  updateStates(r); assert.equal(verificationGate(r, true), true);
  for (const change of [
    (copy: PythonReport) => { copy.tests[0].code = copy.tests[0].code.replace('10000', '20000'); },
    (copy: PythonReport) => { copy.tests.push({ ...copy.tests[0], id: 'T2' }); },
    (copy: PythonReport) => { copy.testAttempts![0].coverage![0].quote = 'Invented requirement'; },
    (copy: PythonReport) => { copy.testAttempts![0].coverage!.push(copy.testAttempts![0].coverage![0]); },
    (copy: PythonReport) => { copy.testAttempts![0].coverage![0].missingExamples = ['Invented acceptance example']; },
    (copy: PythonReport) => { copy.testAttempts![0].coverage![0].testIds = ['T999']; },
    (copy: PythonReport) => { copy.testAttempts![0].coverageRuleIds = []; },
    (copy: PythonReport) => { copy.measurements[0].outcomes = []; },
    (copy: PythonReport) => { copy.measurements[0].outcomes[0].status = 'skipped'; },
  ]) {
    const copy = structuredClone(r); change(copy);
    assert.equal(requirementCoverage(copy, 'R1').complete, false);
    updateStates(copy); assert.equal(verificationGate(copy, true), false);
  }
  const incomplete = structuredClone(r);
  Object.assign(incomplete.testAttempts![0].coverage![0], { complete: false, missingExamples: [r.rules[0].text], reason: 'The exact boundary example is missing.' });
  updateStates(incomplete);
  assert.equal(incomplete.tests[0].approved, true, 'A valid focused test is retained.');
  assert.equal(incomplete.states[0].status, 'Partially Verified');
  assert.match(incomplete.states[0].reason, /boundary example/);
});

test('one bounded addition restores a missing explicit example and exposes the real boundary defect', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async t => {
  const source = await readFile('examples/public-benchmark/boltons/project/mathutils.py', 'utf8');
  const root = await project(t, { 'source/mathutils.py': source }), r = report();
  const requirement = 'ceil(x, options) returns the smallest option greater than or equal to x; ceil(4, options=[1.5, 2.5, 4, 6]) returns 4.';
  const example = 'ceil(4, options=[1.5, 2.5, 4, 6]) returns 4.';
  r.rules = [{ id: 'R1', text: requirement }];
  const interior = { ...artifact, quote: requirement, functionName: 'test_interior', code: 'from mathutils import ceil\ndef test_interior():\n    assert ceil(3.5, options=[1.5, 2.5, 4, 6]) == 4\n' };
  const boundary = { ...interior, id: 'T2', gapIndexes: [], functionName: 'test_equality', code: 'from mathutils import ceil\ndef test_equality():\n    assert ceil(4, options=[1.5, 2.5, 4, 6]) == 4\n' };
  let generations = 0, reviews = 0;
  const ask: Reason = async (schema, _task, raw) => {
    if (Object.is(schema, analysisSchema)) {
      const a = analysis(); Object.assign(a.behaviors[0], { quote: requirement, text: requirement, files: ['mathutils.py'], evidence: [{ file: 'mathutils.py', quote: 'def ceil(x, options=None):' }], gaps: ['Check a value between options.'] });
      return schema.parse(a);
    }
    if (Object.is(schema, testsSchema)) {
      if (generations++) {
        assert.deepEqual((raw as { uncoveredExamples: unknown }).uncoveredExamples, [{ ruleId: 'R1', examples: [example] }]);
        return schema.parse({ tests: [boundary] });
      }
      return schema.parse({ tests: [interior] });
    }
    if (Object.is(schema, reviewTestsSchema)) {
      const second = reviews++ > 0;
      const context = raw as { retainedTests: typeof interior[]; coverageRuleIds: string[] };
      assert.deepEqual(context.coverageRuleIds, ['R1']);
      assert.deepEqual(context.retainedTests.map(test => test.id), second ? ['T1'] : []);
      return schema.parse({ decisions: [{ testId: second ? 'T2' : 'T1', supported: true, reason: 'Supported focused witness.', quote: requirement }], coverage: [{ ruleId: 'R1', quote: requirement, complete: second, reason: second ? 'The combined suite checks the explicit equality example.' : 'The exact equality example is missing.', testIds: second ? ['T1', 'T2'] : ['T1'], missingExamples: second ? [] : [example] }] });
    }
    if (Object.is(schema, diagnosisSchema)) return schema.parse({ decisions: [{ testId: 'T2', category: 'potential_implementation_defect', quote: requirement, reason: 'The stated equality example returns 6 rather than 4.', executionQuote: 'assert 6 == 4', evidence: [{ file: 'mathutils.py', quote: 'bisect.bisect_right(options, x)' }, { file: 'reqtest_generated/test_reqtest_T2.py', quote: 'assert ceil(4, options=[1.5, 2.5, 4, 6]) == 4' }] }] });
    throw new Error('Unexpected model stage.');
  };
  await runPython(r, root, AbortSignal.timeout(40000), () => {}, ask);
  assert.equal(generations, 2); assert.equal(reviews, 2);
  assert.equal(r.improvements.length, 1); assert.equal(r.measurements.length, 2);
  assert.equal(r.initialStates![0].status, 'Partially Verified');
  assert.equal(r.measurements[0].outcomes[0].status, 'passed');
  assert.equal(r.measurements[1].outcomes.find(outcome => outcome.file.endsWith('T2.py'))?.status, 'failed');
  assert.equal(r.tests[0].code, interior.code);
  assert.equal(r.tests[1].code, boundary.code);
  assert.equal(r.states[0].status, 'Uncertain');
  assert.equal(r.diagnoses[0].category, 'potential_implementation_defect');
  assert.equal(verificationGate(r, true), false);
  assert.equal(await readFile(join(root, 'source/mathutils.py'), 'utf8'), source);
});
