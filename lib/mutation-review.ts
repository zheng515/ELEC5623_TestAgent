import type { Mutation, PythonReport } from './python-types';

type Mutant = Mutation['mutants'][number];
type Decision = PythonReport['relevance'][number];
export type MutationReviewPair = Mutant & { behaviorId: string };

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

export function mutationBehaviorReviews(report: PythonReport, mutant: Mutant) {
  return (report.analysis?.behaviors || []).filter(behavior => behavior.files.includes(mutant.file)).map(behavior => {
    const decisions = report.relevance.filter(decision => decision.behaviorId === behavior.id && groundedMutationDecision(report, mutant, decision));
    const decision = decisions.length === 1 ? decisions[0] : undefined;
    const category: keyof typeof survivorLabels = !decision ? 'unreviewed' : behavior.issue !== 'none' ? 'clarification' : decision.relevant ? 'test_gap' : 'outside_behavior';
    return { behavior, decision, category };
  });
}

export function survivorReviews(report: PythonReport) {
  return (report.mutations.at(-1)?.mutants || []).filter(mutant => mutant.status === 'survived').map(mutant => {
    const reviews = mutationBehaviorReviews(report, mutant);
    const category = (['unreviewed', 'test_gap', 'clarification', 'outside_behavior'] as const).find(category => reviews.some(review => review.category === category)) || 'unreviewed';
    return { mutant, reviews, decision: reviews.length === 1 ? reviews[0].decision : undefined, category };
  });
}
