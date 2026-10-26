import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEvaluation } from '../lib/run-evaluation';
import type { PythonReport } from '../lib/python-types';

function fixture(): PythonReport {
  return {
    id: 'run', title: 'Evaluation fixture', createdAt: '2026-10-22', model: 'fixture', source: 'fixture', fingerprint: 'snapshot', status: 'completed', stage: 'done',
    rules: [{ id: 'R1', text: 'A fee is returned.' }, { id: 'R2', text: 'Negative values are rejected.' }, { id: 'R3', text: 'An unmapped requirement.' }],
    analysis: { behaviors: ['R1', 'R1', 'R2'].map((ruleId, index) => ({ id: `B${index + 1}`, ruleId, quote: 'A fee is returned.', text: 'Fixture behavior', category: 'rule', issue: 'none', reason: '', files: [], existingTests: [], evidence: [], gaps: [] })), inconsistencies: [] },
    tests: [], measurements: [{ outcomes: ['passed', 'skipped', 'failed'].map((status, index) => ({ node: `test_${index + 1}`, file: 'tests.py', name: `test_${index + 1}`, status: status as 'passed' | 'skipped' | 'failed', message: '' })), exitCode: 1, integrity: true, timedOut: false, log: '' }],
    states: [{ id: 'B1', status: 'Verified', reason: 'Passed.', nodes: ['test_1'] }, { id: 'B2', status: 'Partially Verified', reason: 'Skipped.', nodes: ['test_2'] }, { id: 'B3', status: 'Uncertain', reason: 'Failed.', nodes: ['test_3'] }],
    mutations: [], diagnoses: [], relevance: [], improvements: [], limitations: [],
  };
}
test('requirements aggregate behaviors without counting behaviors as requirements', () => {
  const result = runEvaluation(fixture());
  assert.equal(result.requirements.length, 3);
  assert.deepEqual(result.requirements.map(item => item.status), ['Partially Verified', 'Uncertain', 'Unverified']);
  assert.equal(result.distribution.reduce((sum, item) => sum + item.value, 0), 3);
  assert.deepEqual(result.outcomes.map(item => item.value), [1, 1, 0, 1]);
});
test('all mapped behaviors must pass before a requirement is verified; unrelated failures stay visible', () => {
  const report = fixture(); report.measurements[0].outcomes[1].status = 'passed'; report.states[1].status = 'Verified';
  const result = runEvaluation(report);
  assert.equal(result.requirements[0].status, 'Verified');
  assert.equal(result.failed.length, 1);
  assert.equal(result.requirements[1].status, 'Uncertain');
});
test('pytest no-existing-tests exit is not a collection failure and does not hide generated evidence', () => {
  const report = fixture(); report.collection = { exitCode: 5, log: 'no tests collected' };
  const result = runEvaluation(report);
  assert.equal(result.requirements[0].behaviors[0].status, 'Verified');
  assert.equal(result.requirements[1].status, 'Uncertain');
});
test('unfinished runs never expose stale verified requirement totals', () => {
  for (const status of ['running', 'failed', 'cancelled'] as const) {
    const report = fixture(); report.status = status;
    const result = runEvaluation(report);
    assert.equal(result.distribution[0].value, 0);
    assert.ok(result.requirements.every(item => item.status === (status === 'running' ? 'Pending' : 'Uncertain')));
  }
});
test('missing execution, missing mapped nodes, changed artifacts and timeouts cannot validate a behavior', () => {
  for (const change of [
    (report: PythonReport) => { report.measurements = []; },
    (report: PythonReport) => { report.states[0].nodes = []; },
    (report: PythonReport) => { report.states[0].nodes = ['invented']; },
    (report: PythonReport) => { report.measurements[0].integrity = false; },
    (report: PythonReport) => { report.measurements[0].timedOut = true; },
    (report: PythonReport) => { report.collection = { exitCode: 2, log: 'collection failed' }; },
  ]) {
    const report = fixture(); change(report);
    assert.equal(runEvaluation(report).requirements[0].behaviors[0].status, 'Uncertain');
  }
});
test('ambiguous requirements and failing or skipped mapped checks override stale positive states', () => {
  const report = fixture(); report.analysis!.behaviors[0].issue = 'ambiguous';
  assert.equal(runEvaluation(report).requirements[0].behaviors[0].status, 'Uncertain');
  report.analysis!.behaviors[0].issue = 'none'; report.measurements[0].outcomes[0].status = 'failed';
  assert.equal(runEvaluation(report).requirements[0].behaviors[0].status, 'Uncertain');
  report.measurements[0].outcomes[0].status = 'skipped';
  assert.equal(runEvaluation(report).requirements[0].behaviors[0].status, 'Partially Verified');
});
test('no execution stays unavailable and pasted requirements need no document citations', () => {
  const report = fixture(); report.measurements = []; report.states = [];
  const result = runEvaluation(report);
  assert.equal(result.latest, undefined);
  assert.equal(result.cited, 0);
  assert.equal(result.outcomes.reduce((sum, item) => sum + item.value, 0), 0);
  assert.ok(result.requirements.every(item => item.status === 'Unverified'));
});
test('document provenance counts only citations matching the saved document and hash', () => {
  const report = fixture();
  report.requirementDocument = { id: 'document', sha256: 'hash', fileName: 'srs.pdf', selectedBlocks: 3, totalBlocks: 12, warnings: [] };
  report.rules[0].source = { documentId: 'document', sha256: 'hash', fileName: 'srs.pdf', segmentId: '1', location: 'page 1', page: 1 };
  report.rules[1].source = { ...report.rules[0].source, sha256: 'changed' };
  assert.equal(runEvaluation(report).cited, 1);
});
