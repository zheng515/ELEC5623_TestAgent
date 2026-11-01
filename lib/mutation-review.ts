import type { Mutation, PythonReport } from './python-types';
import { defaultMutationReviewRequests, defaultMutationReviewSeconds } from './verification-policy';

type Mutant = Mutation['mutants'][number];
type Decision = PythonReport['relevance'][number];
export type MutationReviewPair = Mutant & { behaviorId: string };

/** Diversify source locations before spending a bounded review budget. */
export function pendingMutationReviewPairs(report: PythonReport) {
  const mutants = report.mutations.at(-1)?.mutants || [];
  const locations = new Map<string, Mutant[]>();
  for (const mutant of mutants) {
    if (mutant.status !== 'survived' || !mutant.diff.trim() || mutants.filter(other => other.id === mutant.id).length !== 1) continue;
    const key = JSON.stringify([mutant.file, mutant.line]);
    if (!locations.has(key)) locations.set(key, []);
    locations.get(key)!.push(mutant);
  }
  const groups = [...locations.values()], ordered: Mutant[] = [];
  for (let i = 0; groups.some(group => i < group.length); i++) for (const group of groups) if (group[i]) ordered.push(group[i]);
  return ordered.flatMap(mutant => mutationBehaviorReviews(report, mutant).filter(review => !review.decision).map(({ behavior }) => ({ ...mutant, behaviorId: behavior.id })));
}

export function mutationReviewProgress(report: PythonReport, stopReason = report.mutationReview?.stopReason) {
  const requests = report.resources?.requests.filter(request => request.stage.includes('mutation relevance batch')) || [];
  const pairs = (report.mutations.at(-1)?.mutants || []).filter(mutant => mutant.status === 'survived').flatMap(mutant => mutationBehaviorReviews(report, mutant));
  const pendingPairs = pairs.filter(pair => !pair.decision).length;
  return report.mutationReview = {
    requestLimit: report.policy?.mutationReviewRequestLimit ?? defaultMutationReviewRequests,
    timeoutSeconds: report.policy?.mutationReviewTimeoutSeconds ?? defaultMutationReviewSeconds,
    requestsUsed: requests.length,
    elapsedMs: requests.reduce((sum, request) => sum + (request.elapsedMs ?? Math.max(0, Date.now() - Date.parse(request.startedAt))), 0),
    totalPairs: pairs.length, reviewedPairs: pairs.length - pendingPairs, pendingPairs,
    incomplete: pendingPairs > 0 || report.mutations.at(-1)?.incomplete === true || report.mutations.at(-1)?.timedOut === true,
    stopReason: pendingPairs || report.mutations.at(-1)?.incomplete || report.mutations.at(-1)?.timedOut ? stopReason : undefined,
  };
}

/** Checked inside an uncached stage so recovery can still restore completed reviews. */
export function mutationReviewBudget(report: PythonReport, reserveRequests = 0) {
  const progress = mutationReviewProgress(report), remainingMs = progress.timeoutSeconds * 1000 - progress.elapsedMs;
  const remaining = report.resources?.limit == null ? Infinity : report.resources.limit - report.resources.requests.length;
  const stopReason: NonNullable<PythonReport['mutationReview']>['stopReason'] = progress.stopReason === 'time_limit' ? 'time_limit' : progress.requestsUsed >= progress.requestLimit ? 'request_limit'
    : remainingMs <= 0 ? 'time_limit' : remaining <= 0 ? 'global_budget' : remaining <= reserveRequests ? 'improvement_reserve' : undefined;
  if (stopReason) mutationReviewProgress(report, stopReason);
  return { stopReason, remainingMs };
}

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
