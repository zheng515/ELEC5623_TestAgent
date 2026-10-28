import type { PythonReport } from './python-types';
import { testFile } from './runtime';

// A separate-call model assessment, bound to the reviewed suite; not semantic proof.
export function requirementCoverage(report: PythonReport, ruleId: string) {
  const unavailable = { complete: false, reviewed: false, missingExamples: [] as string[], reason: 'Original requirement coverage has no current, grounded suite review. Passing planned witnesses alone is insufficient.' };
  const attempts = report.testAttempts || [];
  const index = attempts.findLastIndex(attempt => attempt.coverage?.some(review => review.ruleId === ruleId));
  if (index < 0) return unavailable;
  if (!attempts[index].coverageRuleIds?.includes(ruleId)) return unavailable;
  const candidates = attempts[index].coverage!.filter(review => review.ruleId === ruleId);
  const rule = report.rules.find(rule => rule.id === ruleId), review = candidates[0];
  if (candidates.length !== 1 || !rule || review.quote !== rule.text || review.missingExamples.some(example => !example.trim() || !rule.text.includes(example)) || review.complete && review.missingExamples.length) return unavailable;
  const tests = report.tests.filter(test => test.approved && report.analysis?.behaviors.some(behavior => behavior.id === test.behaviorId && behavior.ruleId === ruleId));
  if (new Set(review.testIds).size !== review.testIds.length || tests.length !== review.testIds.length || tests.some(test => !review.testIds.includes(test.id))) return unavailable;
  const history = attempts.slice(0, index + 1).flatMap(attempt => attempt.tests);
  if (tests.some(test => {
    const saved = history.findLast(candidate => candidate.id === test.id && candidate.approved);
    return !saved || saved.code !== test.code || saved.functionName !== test.functionName || saved.behaviorId !== test.behaviorId || saved.quote !== test.quote || JSON.stringify(saved.gapIndexes) !== JSON.stringify(test.gapIndexes);
  })) return unavailable;
  const latest = report.measurements.at(-1);
  if (review.complete && (!latest?.integrity || latest.timedOut || tests.some(test => !latest.outcomes.some(outcome => outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName && outcome.status === 'passed')))) return { ...unavailable, reason: 'The reviewed requirement suite has missing or non-passing execution evidence.' };
  return { complete: review.complete && tests.length > 0, reviewed: true, missingExamples: review.missingExamples, reason: review.reason || 'Explicit requirement examples or boundaries remain unchecked.' };
}
