import type { Measurement, PythonReport } from './python-types';
import { ruleSources } from './requirement-input';
import { testFile } from './runtime';
import { requirementCoverage } from './requirement-coverage';
import { mutationAssessmentMissing } from './verification-policy';
import { hasUninspectedContext } from './project-context';
import { findingEvidence } from './finding-evidence';

export const requirementStates = ['Verified', 'Partially Verified', 'Unverified', 'Uncertain', 'Pending'] as const;
type RequirementState = typeof requirementStates[number];
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
  // Execution progress is separate from the stricter verification policy.
  const trustedChecks = report.status === 'completed' && !report.resources?.exhausted && latest?.integrity === true && !latest.timedOut && [0, 1].includes(latest.exitCode) &&
    !report.collection?.timedOut && (!report.collection || [0, 5].includes(report.collection.exitCode));
  const checkItems = evaluation.requirements.map(rule => {
    const checked = !!trustedChecks && rule.behaviors.length > 0 && rule.behaviors.every(behavior => behavior.nodes.length > 0 && behavior.outcomes.every(outcome => ['passed', 'failed'].includes(outcome.status)) && behavior.nodes.every(node =>
      latest!.outcomes.some(outcome => outcome.node === node && ['passed', 'failed'].includes(outcome.status))));
    const investigate = checked && (rule.status === 'Uncertain' || rule.behaviors.some(behavior => behavior.outcomes.some(outcome => outcome.status === 'failed')));
    const label = report.status === 'running' ? 'In progress' : investigate ? 'Needs investigation' : checked ? 'Recorded checks passed' : rule.behaviors.some(behavior => behavior.outcomes.length) ? 'Checks incomplete' : 'Not checked';
    return { id: rule.id, checked, investigate, label };
  });
  const requirementChecks = { items: checkItems, checked: checkItems.filter(item => item.checked).length,
    passed: checkItems.filter(item => item.checked && !item.investigate).length,
    investigate: checkItems.filter(item => item.investigate).length,
    remaining: checkItems.filter(item => !item.checked).length };
  const needsAttention = evaluation.requirements.filter(rule => checkItems.some(item => item.id === rule.id && (!item.checked || item.investigate)) || !requirementCoverage(report, rule.id).complete);
  const checksPassedAwaitingAssurance = evaluation.requirements.filter(rule => rule.status !== 'Verified' && !needsAttention.some(item => item.id === rule.id) && checkItems.some(item => item.id === rule.id && item.checked && !item.investigate));
  const mutation = report.mutations.at(-1);
  const mutationAssessment = !mutation ? report.policy?.mutationChecks === false ? 'Not performed (not requested)' : 'Not performed'
    : mutation.incomplete || mutation.timedOut || mutation.mutants.some(item => item.status === 'unknown') ? 'Incomplete' : `Execution recorded (${mutation.mutants.length} mutants)`;
  const initialFailure = report.collection && (report.collection.timedOut || ![0, 5].includes(report.collection.exitCode)) ||
    report.baseline && (report.baseline.timedOut || report.baseline.integrity !== true || ![0, 5].includes(report.baseline.exitCode) || report.baseline.outcomes.some(outcome => ['failed', 'error'].includes(outcome.status)));
  const preserved = trustedChecks ? findingEvidence(report).filter(({ outcome, test, diagnosis }) => test && outcome.status === 'failed' &&
    report.tests.filter(active => active.id === test.id).length === 1 &&
    report.tests.some(active => active.id === test.id && active.approved && active.code === test.code) &&
    diagnosis?.category === 'potential_implementation_defect' && report.improvements.every(action =>
      !action.before.some(before => before.id === test.id && before.code !== test.code))).map(finding => finding.outcome) : [];
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
  return { ...evaluation, passed, failedCount: failed, errors, skipped, unmapped, unresolved, preserved, requirementChecks, needsAttention, checksPassedAwaitingAssurance, mutationAssessment, title, next };
}

// Compare only changed artifacts against their own recorded executions, never a baseline suite.
export function improvementOutcomes(report: PythonReport) {
  if (report.replay || report.improvements.length !== 1) return [];
  const improvement = report.improvements[0];
  const status = (test: PythonReport['tests'][number] | undefined, measurement?: Measurement) => {
    if (!test?.approved) return 'Not executed';
    if (!measurement) return 'Awaiting execution';
    if (!measurement.integrity || measurement.timedOut || ![0, 1].includes(measurement.exitCode)) return 'Incomplete evidence';
    const outcomes = measurement.outcomes.filter(outcome => outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName);
    if (!outcomes.length) return 'Not executed';
    if (new Set(outcomes.map(outcome => outcome.node)).size !== outcomes.length) return 'Incomplete evidence';
    if (outcomes.some(outcome => outcome.status === 'error')) return 'Error';
    if (outcomes.some(outcome => outcome.status === 'failed')) return 'Failed';
    if (outcomes.some(outcome => outcome.status === 'skipped')) return 'Skipped';
    return 'Passed';
  };
  return improvement.after.filter(test => improvement.after.filter(item => item.id === test.id).length === 1 &&
    improvement.before.filter(item => item.id === test.id).length <= 1 && !improvement.before.some(before => before.id === test.id &&
      before.code === test.code && before.approved === test.approved && before.functionName === test.functionName && before.behaviorId === test.behaviorId)).map(test => {
    const previous = improvement.before.find(before => before.id === test.id);
    const before = previous ? status(previous, report.measurements[0]) : 'Not proposed';
    const after = status(test, report.measurements.length === 2 ? report.measurements[1] : undefined);
    return { id: test.id, purpose: test.purpose, before, after, previous, test,
      recovered: ['Failed', 'Error'].includes(before) && after === 'Passed' };
  });
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
      } else if (status === 'Verified' && mutationAssessmentMissing(report, behavior.files)) {
        status = 'Partially Verified'; reason = 'Recorded checks passed; mutation adequacy was not assessed for every mapped source file.';
      } else if (status === 'Verified' && hasUninspectedContext(report.contextSelections, behavior.files)) {
        status = 'Partially Verified'; reason = 'A mapped source file or recorded local dependency remains uninspected.';
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
