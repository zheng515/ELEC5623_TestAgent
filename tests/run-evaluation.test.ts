import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentStopReason, runEvaluation, verificationSummary } from '../lib/run-evaluation';
import type { PythonReport } from '../lib/python-types';
import { recordCoverage } from './fixtures/python-agent';

function fixture(): PythonReport {
  return {
    id: 'run', title: 'Evaluation fixture', createdAt: '2026-10-22', model: 'fixture', source: 'fixture', fingerprint: 'snapshot', status: 'completed', stage: 'done',
    rules: [{ id: 'R1', text: 'A fee is returned.' }, { id: 'R2', text: 'Negative values are rejected.' }, { id: 'R3', text: 'An unmapped requirement.' }],
    analysis: { behaviors: ['R1', 'R1', 'R2'].map((ruleId, index) => ({ id: `B${index + 1}`, ruleId, quote: 'A fee is returned.', text: 'Fixture behavior', category: 'rule', issue: 'none', reason: '', files: [], existingTests: [], evidence: [], gaps: [] })), inconsistencies: [] },
    tests: [{ id: 'T1', behaviorId: 'B1', code: 'def test_1():\n    assert fee() == 1', functionName: 'test_1', gapIndexes: [], quote: 'A fee is returned.', purpose: 'Controlled behavior fixture.', approved: true }], measurements: [{ outcomes: ['passed', 'skipped', 'failed'].map((status, index) => ({ node: `test_${index + 1}`, file: index ? 'tests.py' : 'reqtest_generated/test_reqtest_T1.py', name: `test_${index + 1}`, status: status as 'passed' | 'skipped' | 'failed', message: '' })), exitCode: 1, integrity: true, timedOut: false, log: '' }],
    states: [{ id: 'B1', status: 'Verified', reason: 'Passed.', nodes: ['test_1'] }, { id: 'B2', status: 'Partially Verified', reason: 'Skipped.', nodes: ['test_2'] }, { id: 'B3', status: 'Uncertain', reason: 'Failed.', nodes: ['test_3'] }],
    mutations: [], diagnoses: [], relevance: [], improvements: [], limitations: [],
  };
}
test('stopping explanations use recorded decisions without inventing history or verification credit', () => {
  const report = fixture(), originalStates = structuredClone(report.states);
  assert.match(agentStopReason(report), /No stopping decision was recorded/);
  report.stopReason = 'The improvement was not admitted. Earlier tests remain active.';
  assert.equal(agentStopReason(report), report.stopReason);
  report.status = 'running'; report.stage = 'Review tests';
  assert.equal(agentStopReason(report), 'In progress: Review tests');
  report.status = 'failed'; report.error = 'Execution timed out.';
  assert.equal(agentStopReason(report), report.error, 'An execution failure takes precedence over a saved completion reason.');
  report.error = undefined;
  report.testAttempts = [{ phase: 'generation', reason: '', status: 'failed', tests: [], error: 'Review unavailable.' }];
  assert.equal(agentStopReason(report), 'Review unavailable.');
  report.status = 'cancelled'; report.error = 'Stopped by owner.';
  assert.equal(agentStopReason(report), report.error);
  assert.deepEqual(report.states, originalStates, 'Explanations must never change verification states.');
});
test('requirements aggregate behaviors without counting behaviors as requirements', () => {
  const result = runEvaluation(fixture());
  assert.equal(result.requirements.length, 3);
  assert.deepEqual(result.requirements.map(item => item.status), ['Partially Verified', 'Uncertain', 'Unverified']);
  assert.equal(result.distribution.reduce((sum, item) => sum + item.value, 0), 3);
  assert.deepEqual(result.outcomes.map(item => item.value), [1, 1, 0, 1]);
});

test('default-depth progress counts checked requirements including a retained failure without granting verification', () => {
  const report = fixture(); report.policy = { mutationChecks: false, modelRequestLimit: 12 };
  report.rules = Array.from({ length: 4 }, (_, index) => ({ id: `R${index + 1}`, text: 'Recorded contract' }));
  report.analysis!.behaviors = Array.from({ length: 7 }, (_, index) => ({ ...fixture().analysis!.behaviors[0], id: `B${index + 1}`, ruleId: index < 3 ? `R${index + 1}` : 'R4' }));
  report.states = report.analysis!.behaviors.map((behavior, index) => ({ id: behavior.id, status: index === 1 ? 'Uncertain' : 'Partially Verified', reason: index === 1 ? 'Failure retained.' : 'Mutation not assessed.', nodes: [`test_${index + 1}`] }));
  report.measurements[0].outcomes = report.analysis!.behaviors.map((_, index) => ({ node: `test_${index + 1}`, file: 'tests.py', name: `test_${index + 1}`, status: index === 1 ? 'failed' : 'passed', message: '' }));
  const original = structuredClone(report);
  const result = verificationSummary(report);
  assert.equal(result.requirementChecks.checked, 4); assert.equal(result.requirementChecks.passed, 3);
  assert.equal(result.requirementChecks.investigate, 1); assert.equal(result.requirementChecks.remaining, 0);
  assert.deepEqual(result.requirementChecks.items.map(item => item.label), ['Recorded checks passed', 'Needs investigation', 'Recorded checks passed', 'Recorded checks passed']);
  assert.equal(result.distribution.find(item => item.name === 'Verified')!.value, 0);
  assert.equal(result.mutationAssessment, 'Not performed (not requested)');
  assert.deepEqual(report, original, 'Display summaries must not rewrite saved assurance or execution.');
});

test('progress excludes skipped, erroneous, absent and untrusted mapped checks', () => {
  for (const change of [
    (report: PythonReport) => { report.status = 'running'; },
    (report: PythonReport) => { report.status = 'failed'; },
    (report: PythonReport) => { report.status = 'cancelled'; },
    (report: PythonReport) => { report.measurements = []; },
    (report: PythonReport) => { report.measurements[0].integrity = false; },
    (report: PythonReport) => { report.measurements[0].timedOut = true; },
    (report: PythonReport) => { report.measurements[0].exitCode = 2; },
    (report: PythonReport) => { report.collection = { exitCode: 2, log: 'Failed' }; },
    (report: PythonReport) => { report.resources = { limit: 1, exhausted: true, requests: [] }; },
  ]) {
    const report = fixture(); change(report);
    assert.equal(verificationSummary(report).requirementChecks.checked, 0);
  }
  const report = fixture();
  assert.equal(verificationSummary(report).requirementChecks.checked, 1, 'Skipped R1 and unmapped R3 remain incomplete; failed R2 was checked.');
  report.measurements[0].outcomes[1].status = 'error';
  assert.equal(verificationSummary(report).requirementChecks.checked, 1);
  report.measurements[0].outcomes[1].status = 'passed';
  assert.equal(verificationSummary(report).requirementChecks.checked, 2);
  report.states[1].nodes = ['missing'];
  assert.equal(verificationSummary(report).requirementChecks.checked, 1);
});

test('mutation scope distinguishes unperformed, incomplete and recorded execution', () => {
  const report = fixture();
  assert.equal(verificationSummary(report).mutationAssessment, 'Not performed');
  report.mutations = [{ log: '', mutants: [], incomplete: true, timedOut: false }];
  assert.equal(verificationSummary(report).mutationAssessment, 'Incomplete');
  report.mutations[0].incomplete = false;
  assert.equal(verificationSummary(report).mutationAssessment, 'Execution recorded (0 mutants)');
});

test('workflow completion, passing checks and verification remain separate in user summaries', () => {
  const report = fixture();
  assert.equal(verificationSummary(report).failedCount, 1);
  assert.match(verificationSummary(report).title, /investigation/);
  report.measurements = [];
  assert.equal(verificationSummary(report).title, 'No tests executed');
  report.status = 'failed';
  assert.equal(verificationSummary(report).title, 'Run incomplete');
  report.status = 'running';
  assert.equal(verificationSummary(report).title, 'Verification in progress');
  report.status = 'completed'; report.measurements = fixture().measurements;
  report.measurements[0].outcomes.forEach(outcome => { outcome.status = 'passed'; });
  report.collection = { exitCode: 2, log: 'Import failed.' };
  assert.equal(verificationSummary(report).title, 'Existing-test checks need attention');
});

test('passing checks leave blocked proposals and unresolved requirements visible', () => {
  const report = fixture(); report.measurements[0].outcomes.forEach(outcome => { outcome.status = 'passed'; });
  report.tests = [{ id: 'T1', behaviorId: 'B1', code: '', functionName: 'test_missing', gapIndexes: [], quote: '', purpose: '', approved: false }];
  const result = verificationSummary(report);
  assert.equal(result.blocked, 1); assert.match(result.next, /1 blocked test/);
  assert.ok(result.unresolved.length > 0);
  report.replay = { suiteHash: 'saved', states: report.states };
  assert.match(verificationSummary(report).next, /does not regenerate/);
});

test('retained-failure summaries exclude changed assertions, stale phases and untrusted execution', () => {
  const report = fixture();
  const code = 'assert fee(10) == 0';
  report.tests = [{ id: 'T1', behaviorId: 'B3', functionName: 'test_fee', purpose: '', quote: '', gapIndexes: [], code, approved: true }];
  report.measurements[0].outcomes[2].file = 'reqtest_generated/test_reqtest_T1.py';
  report.measurements[0].outcomes[2].name = 'test_fee';
  report.diagnoses = [{ testId: 'T1', phase: 'execution', category: 'potential_implementation_defect', reason: '', quote: '', executionQuote: '', evidence: [] }];
  assert.equal(verificationSummary(report).preserved.length, 1);
  report.improvements = [{ reason: '', before: [{ ...report.tests[0], code: 'assert fee(10) == 1' }], after: report.tests }];
  assert.equal(verificationSummary(report).preserved.length, 0);
  report.improvements = []; report.measurements.push(structuredClone(report.measurements[0]));
  assert.equal(verificationSummary(report).preserved.length, 0);
  report.diagnoses[0].phase = 'remeasurement'; report.measurements[1].integrity = false;
  assert.equal(verificationSummary(report).preserved.length, 0);
});
test('all mapped behaviors must pass before a requirement is verified; unrelated failures stay visible', () => {
  const report = fixture(); report.measurements[0].outcomes[1].status = 'passed'; report.states[1].status = 'Verified';
  recordCoverage(report);
  const result = runEvaluation(report);
  assert.equal(result.requirements[0].status, 'Verified');
  assert.equal(result.failed.length, 1);
  assert.equal(result.requirements[1].status, 'Uncertain');
});
test('pytest no-existing-tests exit is not a collection failure and does not hide generated evidence', () => {
  const report = fixture(); report.collection = { exitCode: 5, log: 'no tests collected' };
  recordCoverage(report);
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
