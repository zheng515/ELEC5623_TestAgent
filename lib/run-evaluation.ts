import type { Measurement, PythonReport } from './python-types';
import { ruleSources } from './requirement-input';

export const requirementStates = ['Verified', 'Partially Verified', 'Unverified', 'Uncertain', 'Pending'] as const;
export type RequirementState = typeof requirementStates[number];
export function outcomeCounts(measurement?: Measurement) {
  return (['passed', 'failed', 'error', 'skipped'] as const).map(status => ({
    name: status === 'error' ? 'Errors' : status[0].toUpperCase() + status.slice(1),
    value: measurement?.outcomes.filter(outcome => outcome.status === status).length || 0,
  }));
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
      else if (report.status !== 'completed' || latest?.integrity === false || latest?.timedOut || report.collection?.timedOut || report.collection && ![0, 5].includes(report.collection.exitCode)) {
        status = 'Uncertain'; reason = 'The run or execution evidence is incomplete or interrupted.';
      } else if (behavior.issue !== 'none' || report.analysis?.inconsistencies.some(item => item.behaviorIds ? item.behaviorIds.includes(behavior.id) : item.ruleId === rule.id) || outcomes.some(outcome => ['failed', 'error'].includes(outcome.status))) {
        status = 'Uncertain'; reason = behavior.issue !== 'none' ? behavior.reason : 'Conflicting requirements or failing checks require investigation.';
      } else if (['Verified', 'Partially Verified'].includes(status) && (!latest || latest.integrity !== true || !nodes.length || nodes.some(node => !outcomes.some(outcome => outcome.node === node)))) {
        status = 'Uncertain'; reason = 'Mapped execution evidence is missing or integrity is not recorded.';
      } else if (status === 'Verified' && outcomes.some(outcome => outcome.status !== 'passed')) {
        status = 'Partially Verified'; reason = 'Some mapped checks did not pass.';
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
