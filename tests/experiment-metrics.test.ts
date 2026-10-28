import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pairedMutationCounts, summarizeExperiment, experimentRow, compareSharedInitialSuites, summarizeRecovery, type ExperimentItem } from '../lib/experiment-metrics';
import { executableSuiteHash } from '../lib/test-suite';
import type { PythonReport, Mutation } from '../lib/python-types';

function fixture(): ExperimentItem {
  const fault = { id: 'boundary', file: 'fee.py', before: '> 10', after: '>= 10' };
  const report: PythonReport = { id: 'run', title: 'case', variant: 'B3', model: 'fixture', source: 'fixture', fingerprint: 'source', createdAt: '2026-10-26', status: 'completed', stage: 'Complete', rules: [{ id: 'R1', text: 'At 10 the fee is zero.' }], tests: [{ id: 'T1', behaviorId: 'B1', functionName: 'test_fee', gapIndexes: [], code: '', quote: 'At 10 the fee is zero.', purpose: 'Threshold', approved: true }], measurements: [{ outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_fee', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_fee', status: 'failed', message: 'boundary' }], exitCode: 1, integrity: true, timedOut: false, log: '' }], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: [] };
  const corrected = structuredClone(report.measurements[0]); corrected.outcomes[0].status = 'passed'; corrected.exitCode = 0;
  return { entry: { caseId: 'case', variant: 'B3', repeat: 1, report: 'report.json', gold: 'gold.json', review: 'review.json', elapsedMs: 2000, fault: { id: 'boundary', beforeDetected: true, afterDetected: true, corrected: [corrected, corrected] } }, report, gold: { reviewed: false, reviewer: '', issues: [], inconsistencies: [], behaviors: [{ id: 'threshold', ruleId: 'R1', description: 'Threshold', initialGap: true }], fault }, reference: { valid: true, sourceFingerprint: 'source', oracleHash: 'oracle', faultHash: createHash('sha256').update(JSON.stringify(fault)).digest('hex') }, requests: [{ elapsedMs: 100, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }] };
}
test('a failing contract check can be a successful detection without claiming semantic accuracy', () => {
  const result = summarizeExperiment([fixture()]);
  assert.equal(result.summary[0].completedWithExecutionRate, 1);
  assert.equal(result.summary[0].correctedCopyDetectionRate, 1);
  assert.equal(result.summary[0].independentSemanticAccuracy, null);
  assert.equal(result.rows[0].failed, 1);
});
test('every missing planned run remains in denominators and prevents complete detection and token totals', () => {
  const item = fixture(), missing = fixture(); missing.entry.repeat = 2; delete missing.report; delete missing.requests;
  const result = summarizeExperiment([item, missing]).summary[0];
  assert.equal(result.plannedRuns, 2); assert.equal(result.completionRate, .5);
  assert.equal(result.missing, 1); assert.equal(result.unresolvedFaultRuns, 1);
  assert.equal(result.correctedCopyDetectionRate, null); assert.equal(result.totalTokens, null);
});
test('changed references or source cannot earn automated fault-detection credit', () => {
  for (const field of ['sourceFingerprint', 'faultHash'] as const) {
    const item = fixture(); item.reference![field] = 'changed';
    assert.equal(experimentRow(item).faultAfter, null);
  }
  const item = fixture(); item.report!.status = 'failed';
  assert.equal(experimentRow(item).faultAfter, null);
});
test('a saved detection flag without the matching corrected execution is not evidence', () => {
  const item = fixture(); item.entry.fault!.corrected = [];
  assert.equal(experimentRow(item).faultAfter, null);
  item.entry.fault!.corrected = [structuredClone(item.report!.measurements[0]), structuredClone(item.report!.measurements[0])];
  assert.equal(experimentRow(item).faultAfter, false);
});
test('preservation excludes cases that never initially detected a fault', () => {
  const item = fixture(); item.entry.fault!.beforeDetected = false; item.report!.measurements[0].outcomes[0].status = 'passed';
  const result = summarizeExperiment([item]).summary[0];
  assert.equal(result.initialDetections, 0); assert.equal(result.preservedDetectionRate, null);
});
test('unknown request usage stays unavailable rather than being billed as zero tokens', () => {
  const item = fixture(); item.requests!.push({ elapsedMs: 200, error: 'Request failed.' });
  const result = experimentRow(item);
  assert.equal(result.modelRequests, 2); assert.equal(result.requestErrors, 1); assert.equal(result.totalTokens, null);
});
test('zero paid requests cost zero tokens; missing usage remains unavailable', () => {
  const item = fixture(); item.requests = [];
  assert.equal(experimentRow(item).totalTokens, 0);
  delete item.requests; assert.equal(experimentRow(item).totalTokens, null);
});
test('paired continuation charges its prefix and verifies unchanged initial executable artifacts', () => {
  const prefix = fixture(), after = fixture(); prefix.entry.variant = 'B1'; prefix.entry.report = 'initial.json'; prefix.report!.variant = 'B1'; prefix.report!.id = 'prefix';
  after.entry.initialReport = prefix.entry.report;
  after.report!.initialSuite = { reportId: 'prefix', executableHash: executableSuiteHash(prefix.report!.tests) };
  after.report!.testAttempts = [{ phase: 'generation', reason: 'Shared prefix audit.', status: 'applied', tests: structuredClone(prefix.report!.tests) }];
  const row = compareSharedInitialSuites([prefix, after])[0];
  assert.equal(row.sharedInitialVerified, true);
  assert.equal(row.endToEndRequests, 2); assert.equal(row.additionalRequests, 1);
  assert.equal(row.endToEndTokens, 60); assert.equal(row.endToEndSeconds, 4);
  assert.equal(row.additionalFaultDetected, false); assert.equal(row.lostFaultDetection, false);
  after.report!.testAttempts[0].tests[0].code = 'Replacement initial suite';
  assert.throws(() => compareSharedInitialSuites([prefix, after]), /preserve/);
  after.report!.status = 'failed'; after.report!.error = 'Follow-up model request budget exhausted. Saved evidence is retained.';
  const stopped = compareSharedInitialSuites([prefix, after])[0];
  assert.equal(stopped.budgetExhausted, true); assert.equal(stopped.finalFaultDetected, null);
});
test('reference disagreements require actual usable replay and never become semantic accuracy', () => {
  const item = fixture();
  assert.equal(experimentRow(item).referenceFailureObserved, null);
  item.referenceExecution = { ...structuredClone(item.report!.measurements[0]), sourceFingerprint: item.report!.fingerprint, suiteHash: experimentRow(item).suiteHash! };
  assert.equal(experimentRow(item).referenceFailureObserved, true);
  assert.equal(summarizeExperiment([item]).summary[0].referenceFailureRate, 1);
  item.referenceExecution.outcomes[0].status = 'passed'; item.referenceExecution.exitCode = 0;
  assert.equal(experimentRow(item).referenceFailureObserved, false);
  item.referenceExecution.outcomes[0].status = 'error'; item.referenceExecution.exitCode = 2;
  assert.equal(experimentRow(item).referenceFailureObserved, null);
  item.referenceExecution.outcomes = []; item.referenceExecution.exitCode = 5;
  assert.equal(experimentRow(item).referenceFailureObserved, null);
  assert.equal(summarizeExperiment([item]).summary[0].independentSemanticAccuracy, null);
  item.referenceExecution.outcomes = structuredClone(item.report!.measurements[0].outcomes);
  item.referenceExecution.exitCode = 1; item.referenceExecution.suiteHash = 'changed';
  assert.equal(experimentRow(item).referenceFailureObserved, null);
});
test('a single pilot observation cannot establish repeatability', () => {
  const item = fixture();
  assert.equal(summarizeExperiment([item]).cases[0].stabilityAssessed, false);
  const next = fixture(); next.entry.repeat = 2; next.report!.tests[0].code = 'different';
  const result = summarizeExperiment([item, next]).cases[0];
  assert.equal(result.stabilityAssessed, true); assert.equal(result.distinctApprovedSuites, 2);
});
test('duplicate runs, mixed source and mixed requirements are rejected', () => {
  assert.throws(() => summarizeExperiment([fixture(), fixture()]), /Duplicate/);
  for (const change of [(report: PythonReport) => { report.fingerprint = 'other'; }, (report: PythonReport) => { report.rules[0].text = 'Other requirement'; }, (report: PythonReport) => { report.requirementInput = { context: 'Changed context' } as PythonReport['requirementInput']; }, (report: PythonReport) => { report.configuration = { sandboxImage: 'other', improvementLimit: 1, mutationSeconds: 1 }; }]) {
    const a = fixture(), b = fixture(); b.entry.repeat = 2; change(b.report!);
    assert.throws(() => summarizeExperiment([a, b]), /identical source/);
  }
});
test('mutation deltas require two actual complete measurements with identical scope and diffs', () => {
  const before: Mutation = { incomplete: false, timedOut: false, log: '', mutants: [{ id: 'Mutant #1', file: 'fee.py', line: 1, diff: 'threshold', status: 'survived' }] };
  const after = structuredClone(before); after.mutants[0].status = 'killed';
  assert.deepEqual(pairedMutationCounts(before, after), { total: 1, beforeKilled: 0, afterKilled: 1 });
  const item = fixture(); item.report!.mutations = [before];
  assert.equal(experimentRow(item).mutationTotal, null);
  item.report!.mutations.push(after); assert.equal(experimentRow(item).mutationAfterKilled, 1);
  after.mutants[0].diff = 'changed'; assert.equal(pairedMutationCounts(before, after), null);
  after.mutants[0].diff = 'threshold'; after.incomplete = true;
  assert.equal(pairedMutationCounts(before, after), null);
});

test('ablation costs include shared preparation and reject changed shared analysis', () => {
  const prefix = fixture(), arm = fixture(); prefix.entry.variant = 'B1'; prefix.report!.variant = 'B1'; prefix.report!.id = 'initial'; prefix.entry.report = 'initial.json';
  const prepared = structuredClone(prefix.report!); prepared.id = 'prepared'; prepared.analysis = { behaviors: [], inconsistencies: [] };
  arm.entry.variant = 'B2'; arm.report!.variant = 'B2'; arm.entry.initialReport = 'initial.json'; arm.entry.preparationReport = 'prepared.json';
  arm.preparation = { report: prepared, requests: [{ elapsedMs: 1, usage: { totalTokens: 7 } }], elapsedMs: 1000, path: 'prepared.json' };
  arm.report!.initialSuite = { reportId: 'initial', executableHash: executableSuiteHash(prefix.report!.tests) };
  arm.report!.preparationSuite = { reportId: 'prepared', executableHash: executableSuiteHash(prepared.tests) };
  arm.report!.analysis = structuredClone(prepared.analysis);
  arm.report!.testAttempts = [{ phase: 'generation', reason: 'Shared audit', status: 'applied', tests: structuredClone(prepared.tests) }];
  const row = compareSharedInitialSuites([prefix, arm])[0];
  assert.equal(row.sharedPreparationVerified, true); assert.equal(row.endToEndTokens, 67);
  assert.equal(row.endToEndRequests, 3); assert.equal(row.endToEndSeconds, 5);
  arm.report!.analysis!.inconsistencies.push({ ruleId: 'R1', behaviorIds: ['B1'], quote: '', description: 'Changed analysis', evidence: [] });
  assert.throws(() => compareSharedInitialSuites([prefix, arm]), /shared analysis/);
});
test('recovery distinguishes unchanged valid failures, changed artifacts and incomplete planned observations', () => {
  const prefix = fixture(), arm = fixture(); prefix.entry.variant = 'B1'; prefix.report!.variant = 'B1';
  for (const item of [prefix, arm]) item.referenceExecution = { ...structuredClone(item.entry.fault!.corrected[0]), sourceFingerprint: item.report!.fingerprint, suiteHash: experimentRow(item).suiteHash! };
  const result = summarizeRecovery([prefix, arm], { case: 'valid-failure' });
  assert.equal(result.rows[1].success, true);
  arm.report!.tests[0].code = 'changed';
  assert.equal(summarizeRecovery([prefix, arm], { case: 'valid-failure' }).rows[1].success, false);
  arm.report!.status = 'failed';
  assert.equal(summarizeRecovery([prefix, arm], { case: 'valid-failure' }).summary.find(row => row.variant === 'B3')!.successRate, null);
});

test('diagnosis comparison does not credit an admission rejection as runtime diagnosis', async () => {
  const { summarizeDiagnosisExposure } = await import('../lib/experiment-metrics');
  const prefix = fixture(); prefix.entry.variant = 'B1'; prefix.report!.variant = 'B1';
  const item = fixture(), prepared = structuredClone(item.report!);
  item.preparation = { report: prepared, requests: [], elapsedMs: 1, path: 'prep.json' };
  item.report!.diagnoses = [{ testId: 'T1', phase: 'execution', category: 'potential_implementation_defect', quote: 'At 10 the fee is zero.', reason: 'Boundary failure.', executionQuote: 'boundary', evidence: [] }];
  let result = summarizeDiagnosisExposure([prefix, item], { case: 'potential_implementation_defect' });
  assert.equal(result.rows[0].runtimeFailureExposed, true); assert.equal(result.rows[0].agreesWithFixtureReference, true);
  prepared.tests[0].approved = false;
  result = summarizeDiagnosisExposure([prefix, item], { case: 'potential_implementation_defect' });
  assert.equal(result.rows[0].runtimeFailureExposed, false); assert.equal(result.rows[0].category, null);
  assert.equal(result.rows[0].agreesWithFixtureReference, null); assert.equal(result.summary[0].admissionBlocked, 1);
  delete item.preparation;
  result = summarizeDiagnosisExposure([prefix, item], { case: 'potential_implementation_defect' });
  assert.equal(result.rows[0].runtimeFailureExposed, null); assert.equal(result.summary[0].preparationUnavailable, 1);
});

test('a run failing before configuration stays in analysis without weakening completed identity checks', () => {
  const prefix = fixture(), stopped = fixture();
  prefix.entry.variant = 'B1'; prefix.report!.variant = 'B1';
  prefix.report!.configuration = { sandboxImage: 'frozen-image', improvementLimit: 1, mutationSeconds: 75, policyVersion: 'fixture' };
  stopped.report!.status = 'failed'; stopped.report!.error = 'Shared preparation did not complete.';
  const result = summarizeExperiment([prefix, stopped]);
  assert.equal(result.rows[1].status, 'failed'); assert.equal(result.summary[1].plannedRuns, 1); assert.equal(result.summary[1].completionRate, 0);
  stopped.report!.status = 'completed';
  assert.throws(() => summarizeExperiment([prefix, stopped]), /identical source/);
});
