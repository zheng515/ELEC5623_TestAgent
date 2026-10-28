import type { Mutation, PythonReport } from './python-types';

type Mutant = Mutation['mutants'][number];
type Decision = PythonReport['relevance'][number];
export type MutationReviewPair = Mutant & { behaviorId: string };

export function mutationReviewContext(report: PythonReport, files: Record<string, string>, pairs: MutationReviewPair[]) {
  const behaviors = (report.analysis?.behaviors || []).filter(behavior => pairs.some(pair => pair.behaviorId === behavior.id));
  const inconsistencies = (report.analysis?.inconsistencies || []).filter(item => item.behaviorIds.some(id => behaviors.some(behavior => behavior.id === id)));
  const names = new Set([...pairs.map(pair => pair.file), ...behaviors.flatMap(behavior => [...behavior.files, ...behavior.existingTests.map(node => node.split('::')[0]), ...behavior.evidence.map(item => item.file)]), ...inconsistencies.flatMap(item => item.evidence.map(evidence => evidence.file))]);
  return {
    rules: report.rules,
    requirementContext: report.requirementInput?.context || '',
    analysis: { behaviors: behaviors.map(({ id, ruleId, text, category, issue, reason, files }) => ({ id, ruleId, text, category, issue, reason, files })), inconsistencies },
    files: Object.fromEntries(Object.entries(files).filter(([file]) => names.has(file))),
    mutants: [...new Map(pairs.map(({ id, file, line, diff }) => [id, { id, file, line, diff }])).values()],
    pairs: pairs.map(({ id, behaviorId }) => ({ id, behaviorId })),
    contextScope: 'All original rules and supporting requirement context are retained for cross-cutting constraints. Only mapped files are supplied; unshown dependencies are not validated. Preserve uncertainty when the evidence is insufficient.',
  };
}

export function groundedMutationDecision(report: PythonReport, mutant: Mutant, decision: Decision) {
  const behavior = report.analysis?.behaviors.find(behavior => behavior.id === decision.behaviorId);
  return decision.grounded === true && decision.mutantId === mutant.id && decision.file === mutant.file &&
    Boolean(mutant.diff.trim()) && decision.diff === mutant.diff && Boolean(decision.reason.trim()) &&
    Boolean(behavior?.files.includes(mutant.file) && decision.quote.trim() && report.rules.find(rule => rule.id === behavior.ruleId)?.text === decision.quote);
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
