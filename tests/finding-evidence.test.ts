import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingEvidence } from '../lib/finding-evidence';
import type { PythonReport } from '../lib/python-types';
import { testFile } from '../lib/runtime';

function fixture(): PythonReport {
  const file = testFile('T1');
  return {
    id: 'fixture', title: 'Evidence links', createdAt: '2026-10-28', source: 'fixture', fingerprint: 'frozen', model: 'fixture', status: 'completed', stage: 'Complete',
    rules: [{ id: 'R1', text: 'At the threshold the fee is zero.' }],
    analysis: { behaviors: [{ id: 'B1', ruleId: 'R1', quote: 'At the threshold the fee is zero.', text: 'Threshold', category: 'boundary', issue: 'none', reason: '', files: ['fee.py'], existingTests: [], evidence: [], gaps: [] }], inconsistencies: [] },
    tests: [{ id: 'T1', behaviorId: 'B1', functionName: 'test_threshold', code: 'def test_threshold():\n    assert fee(10000) == 0', quote: 'At the threshold the fee is zero.', purpose: 'Check threshold', gapIndexes: [], approved: true }],
    measurements: [{ outcomes: [{ file, node: file + '::test_threshold[10000]', name: 'test_threshold[10000]', status: 'failed', message: 'assert 1000 == 0' }], exitCode: 1, integrity: true, timedOut: false, log: '' }],
    diagnoses: [{ testId: 'T1', phase: 'execution', category: 'potential_implementation_defect', quote: 'At the threshold the fee is zero.', reason: 'The boundary differs from the contract.', executionQuote: 'assert 1000 == 0', evidence: [{ file: 'fee.py', line: 2, quote: 'return 1000' }] }],
    states: [{ id: 'B1', status: 'Uncertain', reason: 'Failed check', nodes: [file + '::test_threshold[10000]'] }], mutations: [], improvements: [], relevance: [], limitations: [],
  };
}

test('finding evidence joins exact artifacts and parameterized outcomes without rewriting saved records', () => {
  const report = fixture(), original = structuredClone(report);
  const [finding] = findingEvidence(report);
  assert.equal(finding.test?.id, 'T1');
  assert.equal(finding.rule?.id, 'R1');
  assert.equal(finding.diagnosis?.phase, 'execution');
  assert.equal(finding.outcome.message, 'assert 1000 == 0');
  assert.deepEqual(report, original);
  report.measurements[0].outcomes[0].status = 'passed';
  assert.deepEqual(findingEvidence(report), []);
});

test('remeasurement never shows an initial diagnosis as a current assessment', () => {
  const report = fixture(); report.measurements.push(structuredClone(report.measurements[0]));
  assert.equal(findingEvidence(report)[0].diagnosis, undefined);
  report.diagnoses.push({ ...report.diagnoses[0], phase: 'remeasurement', reason: 'Current assessment' });
  assert.equal(findingEvidence(report)[0].diagnosis?.reason, 'Current assessment');
});

test('saved-suite replay exposes execution without refreshing historical diagnoses', () => {
  const report = fixture(); report.replay = { suiteHash: 'saved', states: report.states };
  const [finding] = findingEvidence(report);
  assert.equal(finding.test?.id, 'T1');
  assert.equal(finding.diagnosis, undefined);
});

test('a replacement awaiting remeasurement cannot be presented as the artifact that failed', () => {
  const report = fixture(), before = structuredClone(report.tests);
  report.tests[0].code = 'def test_threshold():\n    assert repaired_test()';
  report.improvements = [{ reason: 'Repair a test', before, after: structuredClone(report.tests) }];
  report.status = 'cancelled';
  assert.equal(findingEvidence(report)[0].test?.code, before[0].code);
  report.measurements.push(structuredClone(report.measurements[0]));
  assert.equal(findingEvidence(report)[0].test?.code, report.tests[0].code);
});

test('duplicate or unapproved artifacts cannot supply a generated-test diagnosis', () => {
  for (const change of [
    (report: PythonReport) => { report.tests.push(structuredClone(report.tests[0])); },
    (report: PythonReport) => { report.tests[0].approved = false; },
    (report: PythonReport) => { report.measurements[0].outcomes[0].file = 'existing_tests.py'; },
  ]) {
    const report = fixture(); change(report);
    assert.equal(findingEvidence(report)[0].test, undefined);
    assert.equal(findingEvidence(report)[0].diagnosis, undefined);
  }
});

test('existing checks link through a unique saved node and ambiguous links stay absent', () => {
  const report = fixture(); report.tests = [];
  assert.equal(findingEvidence(report)[0].rule?.id, 'R1');
  report.analysis!.behaviors.push({ ...report.analysis!.behaviors[0], id: 'B2' });
  report.states.push({ ...report.states[0], id: 'B2' });
  assert.equal(findingEvidence(report)[0].rule, undefined);
});

test('duplicate assessments stay unresolved and errors retain their original evidence', () => {
  const report = fixture(); report.diagnoses.push(structuredClone(report.diagnoses[0]));
  report.measurements[0].outcomes[0].status = 'error';
  const [finding] = findingEvidence(report);
  assert.equal(finding.diagnosis, undefined);
  assert.equal(finding.outcome.status, 'error');
  assert.equal(finding.outcome.message, report.measurements[0].outcomes[0].message);
});

test('node runtime artifacts use the recorded runtime path', () => {
  const report = fixture(); report.runtime = 'node';
  const outcome = report.measurements[0].outcomes[0];
  outcome.file = testFile('T1', 'node');
  assert.equal(findingEvidence(report)[0].test?.id, 'T1');
  outcome.file = testFile('T1', 'python');
  assert.equal(findingEvidence(report)[0].test, undefined);
});
