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

/** Behaviors mapped to the mutated file. Each needs its own decision for a survivor. */
export function affectedBehaviors(report: PythonReport, mutant: Mutant) {
  return (report.analysis?.behaviors || []).filter(behavior => behavior.files.includes(mutant.file));
}

export function behaviorDecision(report: PythonReport, mutant: Mutant, behaviorId: string) {
  const decisions = report.relevance.filter(decision => decision.behaviorId === behaviorId && groundedMutationDecision(report, mutant, decision));
  return decisions.length === 1 ? decisions[0] : undefined;
}

export function survivorReviews(report: PythonReport) {
  return (report.mutations.at(-1)?.mutants || []).filter(mutant => mutant.status === 'survived').map(mutant => {
    const reviews = affectedBehaviors(report, mutant).map(behavior => ({ behavior, decision: behaviorDecision(report, mutant, behavior.id) }));
    const category: keyof typeof survivorLabels = reviews.some(({ behavior, decision }) => decision?.relevant && behavior.issue === 'none') ? 'test_gap'
      : reviews.some(({ behavior, decision }) => decision && behavior.issue !== 'none') ? 'clarification'
      : !reviews.length || reviews.some(({ decision }) => !decision) ? 'unreviewed' : 'outside_behavior';
    return { mutant, reviews, category };
  });
}
