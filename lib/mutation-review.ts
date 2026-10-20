import type { Mutation, PythonReport } from './python-types';

type Mutant = Mutation['mutants'][number];
type Decision = PythonReport['relevance'][number];

export function groundedMutationDecision(report: PythonReport, mutant: Mutant, decision: Decision) {
  const behavior = report.analysis?.behaviors.find(behavior => behavior.id === decision.behaviorId);
  return decision.grounded === true && decision.mutantId === mutant.id && decision.file === mutant.file &&
    Boolean(mutant.diff.trim()) && decision.diff === mutant.diff && Boolean(decision.reason.trim()) &&
    Boolean(behavior?.files.includes(mutant.file) && decision.quote.trim() && report.rules.find(rule => rule.id === behavior.ruleId)?.text.includes(decision.quote));
}

export const survivorLabels = {
  test_gap: 'Test gap', clarification: 'Requirement clarification',
  outside_behavior: 'Outside cited behavior', unreviewed: 'Unreviewed / unsupported',
};

export function survivorReviews(report: PythonReport) {
  return (report.mutations.at(-1)?.mutants || []).filter(mutant => mutant.status === 'survived').map(mutant => {
    const decisions = report.relevance.filter(decision => groundedMutationDecision(report, mutant, decision));
    const decision = decisions.length === 1 ? decisions[0] : undefined;
    const behavior = report.analysis?.behaviors.find(behavior => behavior.id === decision?.behaviorId);
    const category: keyof typeof survivorLabels = !decision ? 'unreviewed' : behavior?.issue !== 'none' ? 'clarification' : !decision.relevant ? 'outside_behavior' : 'test_gap';
    return { mutant, decision, category };
  });
}
