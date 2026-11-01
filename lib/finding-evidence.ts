import type { PythonReport } from './python-types';
import { testFile } from './runtime';

// Join saved evidence only. Never assign a nearby test or an earlier diagnosis to a failure.
export function findingEvidence(report: PythonReport) {
  const phase = report.measurements.length > 1 ? 'remeasurement' : 'execution';
  // A replacement may be saved before re-execution finishes. Its code did not produce the first measurement.
  const artifacts = report.measurements.length === 1 ? report.improvements[0]?.before || report.tests : report.tests;
  return (report.measurements.at(-1)?.outcomes || []).filter(outcome => ['failed', 'error'].includes(outcome.status)).map(outcome => {
    const tests = artifacts.filter(test => test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName);
    const test = tests.length === 1 ? tests[0] : undefined;
    const behaviors = (report.analysis?.behaviors || []).filter(behavior => test ? behavior.id === test.behaviorId : report.states.some(state => state.id === behavior.id && state.nodes.includes(outcome.node)));
    const behavior = behaviors.length === 1 ? behaviors[0] : undefined;
    const rule = behavior && report.rules.find(rule => rule.id === behavior.ruleId);
    const diagnoses = test && !report.replay ? report.diagnoses.filter(diagnosis => diagnosis.testId === test.id && (diagnosis.phase || 'execution') === phase) : [];
    const diagnosis = diagnoses && diagnoses.length === 1 ? diagnoses[0] : undefined;
    return { outcome, test, behavior, rule, diagnosis };
  });
}
type FindingEvidence = ReturnType<typeof findingEvidence>[number];

export function findingNextStep(finding: FindingEvidence) {
  switch (finding.diagnosis?.category) {
    case 'potential_implementation_defect': return 'Inspect the implementation against the original requirement. Preserve the failing assertion while investigating; the Agent assessment is not a confirmed defect.';
    case 'generated_test_error': return 'Check the generated test inputs, imports and expected result against the requirement. Accept a correction only when that contract supports it.';
    case 'environment_failure': return 'Inspect dependencies, runtime and temporary services. Correct the environment, then re-run saved tests to check execution without regenerating assertions.';
    case 'requirement_ambiguity': return 'Clarify the expected behavior, then regenerate with the updated requirements. Re-running saved tests cannot resolve an ambiguous contract.';
    default: return 'Compare the original requirement, test and execution output before assigning a cause. No supported repair decision is available for this finding.';
  }
}

export const diagnosisLabels = {
  potential_implementation_defect: 'Potential implementation defect',
  generated_test_error: 'Potential test error',
  environment_failure: 'Potential environment issue',
  requirement_ambiguity: 'Requirement needs clarification',
  uncertain: 'Uncertain cause',
} as const;
