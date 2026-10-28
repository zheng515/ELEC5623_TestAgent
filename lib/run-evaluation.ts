import type { Measurement, PythonReport } from './python-types';
import { ruleSources } from './requirement-input';
import { testFile } from './runtime';
import { requirementCoverage } from './requirement-coverage';
import { mutationAssessmentMissing } from './verification-policy';

export const requirementStates = ['Verified', 'Partially Verified', 'Unverified', 'Uncertain', 'Pending'] as const;
export type RequirementState = typeof requirementStates[number];
export function agentStopReason(report: PythonReport) {
  if (report.status === 'running') return 'In progress: ' + report.stage;
  if (report.status !== 'completed') return report.error || report.testAttempts?.at(-1)?.error || 'The run ended before completion. Inspect the saved execution records.';
  return report.stopReason || 'No stopping decision was recorded for this older run. Inspect the saved tests and execution evidence.';
}
export function verificationGate(report: PythonReport, requireVerified = true) {
  const measured = report.measurements.at(-1), requirements = runEvaluation(report).requirements;
  return report.status === 'completed' && !report.resources?.exhausted && measured?.integrity === true && !measured.timedOut && measured.exitCode === 0 &&
    measured.outcomes.length > 0 && measured.outcomes.every(outcome => outcome.status === 'passed') && requirements.length > 0 &&
    requirements.every(rule => requireVerified ? rule.status === 'Verified' : !['Uncertain', 'Unverified', 'Pending'].includes(rule.status));
}
export function outcomeCounts(measurement?: Measurement) {
  return (['passed', 'failed', 'error', 'skipped'] as const).map(status => ({
    name: status === 'error' ? 'Errors' : status[0].toUpperCase() + status.slice(1),
    value: measurement?.outcomes.filter(outcome => outcome.status === status).length || 0,
  }));
}

export function verificationSummary(report: PythonReport) {
  const evaluation = runEvaluation(report), latest = evaluation.latest;
  const [passed, failed, errors, skipped] = evaluation.outcomes.map(item => item.value);
  const unmapped = evaluation.requirements.filter(rule => !rule.behaviors.length || rule.behaviors.every(behavior =>
    behavior.issue === 'not_testable' && behavior.gaps.includes('Behavior extraction incomplete.')));
  const unresolved = evaluation.requirements.filter(rule => rule.status !== 'Verified');
  const phase = report.measurements.length > 1 ? 'remeasurement' : 'execution';
  const initialFailure = report.collection && (report.collection.timedOut || ![0, 5].includes(report.collection.exitCode)) ||
    report.baseline && (report.baseline.timedOut || report.baseline.integrity !== true || ![0, 5].includes(report.baseline.exitCode) || report.baseline.outcomes.some(outcome => ['failed', 'error'].includes(outcome.status)));
  const preserved = (report.status === 'completed' && latest?.integrity && !latest.timedOut ? latest.outcomes : []).filter(outcome => outcome.status === 'failed' && report.tests.some(test =>
    test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName && report.diagnoses.some(diagnosis =>
      (diagnosis.phase || 'execution') === phase && diagnosis.category === 'potential_implementation_defect' && diagnosis.testId === test.id) &&
    report.improvements.every(action => !action.before.some(before => before.id === test.id && before.code !== test.code))));
  let title = '', next = '';
  if (report.resources?.exhausted) { title = 'Model request budget reached'; next = 'Inspect the retained tests, reviews and execution evidence. This run is incomplete; a new run with an appropriate scope or budget is needed for unresolved checks.'; }
  else if (report.status === 'running') { title = 'Verification in progress'; next = 'Wait for the saved run to finish. Recorded results are provisional.'; }
  else if (report.status !== 'completed') { title = 'Run incomplete'; next = 'Inspect the saved error and execution records, correct the input or setup, then re-run.'; }
  else if (!latest?.outcomes.length) { title = 'No tests executed'; next = 'Inspect blocked tests and collection/setup errors. No passing result is available.'; }
  else if (latest.timedOut || latest.integrity !== true || ![0, 1].includes(latest.exitCode)) { title = 'Execution evidence incomplete'; next = 'Inspect time limits, integrity and execution errors before relying on the recorded outcomes.'; }
  else if (failed || errors) { title = `${failed + errors} ${failed + errors === 1 ? 'check needs' : 'checks need'} investigation`; next = 'Compare failing assertions and Agent diagnoses with the original requirements. A failure is not automatically a software defect.'; }
  else if (initialFailure) { title = 'Existing-test checks need attention'; next = 'Inspect collection and baseline diagnoses and logs. Later passing checks do not resolve earlier setup or existing-test failures.'; }
  else { title = `${passed} ${passed === 1 ? 'test' : 'tests'} passed${skipped ? `; ${skipped} skipped` : ''}`; next = 'Review unresolved behavior states and blocked tests. Passing cases do not establish complete specification coverage.'; }
  if (report.status === 'completed' && evaluation.blocked) next = `${evaluation.blocked} blocked test proposals need attention. Inspect their review reasons and uncovered requirements before regenerating. ` + next;
  if (report.replay) next += ' Saved-test execution does not regenerate analysis or diagnoses.';
  return { ...evaluation, passed, failedCount: failed, errors, skipped, unmapped, unresolved, preserved, title, next };
}

// Summarize saved assessments conservatively; this does not independently grade the agent.
export function runEvaluation(report: PythonReport) {
  const latest = report.measurements.at(-1);
  const requirements = report.rules.map(rule => {
    const behaviors = (report.analysis?.behaviors || []).filter(behavior => behavior.ruleId === rule.id).map(behavior => {
      const saved = report.states.find(state => state.id === behavior.id);
      const nodes = saved?.nodes || [];
      const outcomes = nodes.flatMap(node => latest?.outcomes.filter(outcome => outcome.node === node) || []);
      let status: RequirementState = saved?.status || 'Unverified';
      let reason = saved?.reason || 'No saved behavior assessment.';
      if (report.status === 'running') { status = 'Pending'; reason = 'This run has not finished.'; }
      else if (report.status !== 'completed' || report.resources?.exhausted || latest?.integrity === false || latest?.timedOut || report.collection?.timedOut || report.collection && ![0, 5].includes(report.collection.exitCode)) {
        status = 'Uncertain'; reason = 'The run or execution evidence is incomplete or interrupted.';
      } else if (behavior.issue !== 'none' || report.analysis?.inconsistencies.some(item => item.behaviorIds ? item.behaviorIds.includes(behavior.id) : item.ruleId === rule.id) || outcomes.some(outcome => ['failed', 'error'].includes(outcome.status))) {
        status = 'Uncertain'; reason = behavior.issue !== 'none' ? behavior.reason : 'Conflicting requirements or failing checks require investigation.';
      } else if (['Verified', 'Partially Verified'].includes(status) && (!latest || latest.integrity !== true || !nodes.length || nodes.some(node => !outcomes.some(outcome => outcome.node === node)))) {
        status = 'Uncertain'; reason = 'Mapped execution evidence is missing or integrity is not recorded.';
      } else if (status === 'Verified' && outcomes.some(outcome => outcome.status !== 'passed')) {
        status = 'Partially Verified'; reason = 'Some mapped checks did not pass.';
      } else if (status === 'Verified' && mutationAssessmentMissing(report)) {
        status = 'Partially Verified'; reason = 'Recorded checks passed; optional mutation adequacy was not assessed.';
      } else if (status === 'Verified' && !requirementCoverage(report, rule.id).complete) {
        status = 'Partially Verified'; reason = requirementCoverage(report, rule.id).reason;
      }
      return { ...behavior, status, reason, nodes, outcomes };
    });
    const status: RequirementState = report.status === 'running' ? 'Pending' : report.status !== 'completed' || behaviors.some(item => item.status === 'Uncertain') ? 'Uncertain'
      : !behaviors.length ? 'Unverified' : behaviors.every(item => item.status === 'Verified') ? 'Verified'
      : behaviors.some(item => ['Verified', 'Partially Verified'].includes(item.status)) ? 'Partially Verified' : 'Unverified';
    return { ...rule, status, behaviors };
  });
  return {
    requirements, latest,
    distribution: requirementStates.map(name => ({ name, value: requirements.filter(rule => rule.status === name).length })),
    outcomes: outcomeCounts(latest),
    approved: report.tests.filter(test => test.approved).length,
    blocked: report.tests.filter(test => !test.approved).length,
    cited: report.rules.filter(rule => ruleSources(rule).some(source => source.documentId === report.requirementDocument?.id && source.sha256 === report.requirementDocument.sha256)).length,
    failed: latest?.outcomes.filter(outcome => ['failed', 'error'].includes(outcome.status)) || [],
  };
}
