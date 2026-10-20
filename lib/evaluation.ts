import { testFile } from "./runtime";
import { z } from 'zod';
import type { Measurement, PythonReport } from './python-types';

const finding = z.object({ id: z.string(), ruleId: z.string(), description: z.string() });
export const goldSchema = z.object({
  reviewed: z.boolean(), reviewer: z.string(),
  issues: z.array(finding), inconsistencies: z.array(finding),
  behaviors: z.array(finding.extend({ initialGap: z.boolean() })).min(1),
  fault: z.object({ id: z.string(), file: z.string(), before: z.string().min(1), after: z.string().min(1) }).optional(),
}).refine((gold) => [gold.issues, gold.inconsistencies, gold.behaviors].every((items) => new Set(items.map((item) => item.id)).size === items.length), 'Reference IDs must be unique within each category.');
const reviewedFinding = z.object({ id: z.string(), match: z.string().nullable(), evidenceSupported: z.boolean().nullable() });
const category = z.enum(['generated_test_error', 'requirement_ambiguity', 'potential_implementation_defect', 'environment_failure', 'uncertain']);
export const reviewSchema = z.object({
  reviewed: z.boolean(), reviewer: z.string(),
  reportId: z.string().optional(), sourceFingerprint: z.string().optional(), requirementTexts: z.array(z.string()).optional(),
  validOutcome: z.boolean().nullable(),
  issues: z.array(reviewedFinding), gaps: z.array(reviewedFinding), inconsistencies: z.array(reviewedFinding),
  coverage: z.array(z.object({ id: z.string(), beforeNodes: z.array(z.string()), afterNodes: z.array(z.string()) })),
  diagnoses: z.array(z.object({ testId: z.string(), phase: z.enum(['collection', 'baseline', 'execution']).optional(), expected: category.nullable(), evidenceSupported: z.boolean().nullable() })),
  mutants: z.array(z.object({ attempt: z.number().int().min(0), id: z.string(), relevant: z.boolean().nullable(), equivalent: z.boolean().nullable() })),
});
export type Gold = z.infer<typeof goldSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type FaultProbe = { id: string; beforeDetected: boolean | null; afterDetected: boolean | null; corrected: Measurement[] };
export const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const metrics = (tp: number, fp: number, fn: number) => ({ tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) });
const covered = (nodes: string[], measurement?: Measurement) => !!nodes.length && !!measurement?.integrity && !measurement.timedOut && nodes.every((node) => measurement.outcomes.some((outcome) => outcome.node === node && outcome.status === 'passed'));

export function reviewTemplate(report: PythonReport, gold: Gold): Review {
  const empty = (id: string) => ({ id, match: null, evidenceSupported: null });
  const first = report.measurements[0];
  const originalTests = report.improvements[0]?.before || report.tests;
  const failures = first?.outcomes.filter((outcome) => ['failed', 'error'].includes(outcome.status)).map((outcome) => originalTests.find((test) => outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName)?.id || outcome.node) || [];
  if (first && !failures.length && (first.timedOut || !first.integrity || [1, 2, 3, 4].includes(first.exitCode))) failures.push('environment');
  const diagnoses: Review['diagnoses'] = [];
  if (report.collection && (report.collection.timedOut || [1, 2, 3, 4].includes(report.collection.exitCode))) diagnoses.push({ testId: 'environment', phase: 'collection', expected: null, evidenceSupported: null });
  const baselineFailures = report.baseline?.outcomes.filter((outcome) => ['failed', 'error'].includes(outcome.status)).map((outcome) => outcome.node) || [];
  if (report.baseline && !baselineFailures.length && (report.baseline.timedOut || !report.baseline.integrity || [1, 2, 3, 4].includes(report.baseline.exitCode))) baselineFailures.push('environment');
  diagnoses.push(...[...new Set(baselineFailures)].map((testId) => ({ testId, phase: 'baseline' as const, expected: null, evidenceSupported: null })));
  diagnoses.push(...[...new Set(failures)].map((testId) => ({ testId, phase: 'execution' as const, expected: null, evidenceSupported: null })));
  const analysis = ['B0', 'B1'].includes(report.variant || '') ? undefined : report.analysis;
  return {
    reviewed: false, reviewer: '', reportId: report.id, sourceFingerprint: report.fingerprint, requirementTexts: report.rules.map(rule => rule.text), validOutcome: null,
    issues: (analysis?.behaviors || []).filter((behavior) => behavior.issue !== 'none').map((behavior) => empty(behavior.id)),
    gaps: (analysis?.behaviors || []).flatMap((behavior) => behavior.gaps.map((_, index) => empty(`${behavior.id}:${index}`))),
    inconsistencies: (analysis?.inconsistencies || []).map((_, index) => empty(`C${index + 1}`)),
    coverage: gold.behaviors.map((behavior) => ({ id: behavior.id, beforeNodes: [], afterNodes: [] })),
    diagnoses,
    mutants: report.mutations.flatMap((attempt, index) => attempt.mutants.map((mutant) => ({ attempt: index, id: mutant.id, relevant: null, equivalent: null }))),
  };
}

export const faultProbeSchema = z.object({
  id: z.string(), beforeDetected: z.boolean().nullable(), afterDetected: z.boolean().nullable(),
  corrected: z.array(z.object({ outcomes: z.array(z.object({ node: z.string(), file: z.string(), name: z.string(), status: z.enum(['passed', 'failed', 'error', 'skipped']), message: z.string() })), exitCode: z.number(), log: z.string(), timedOut: z.boolean(), integrity: z.boolean() })),
});

function exact(actual: string[], expected: string[]) {
  return new Set(actual).size === actual.length && actual.length === expected.length && actual.every((id) => expected.includes(id));
}
const diagnosisKey = (item: { testId: string; phase?: string }) => `${item.phase || 'execution'}:${item.testId}`;
export function validateReview(report: PythonReport, gold: Gold, review: Review) {
  const template = reviewTemplate(report, gold);
  if (review.reportId !== undefined && review.reportId !== report.id || review.sourceFingerprint !== undefined && review.sourceFingerprint !== report.fingerprint || review.requirementTexts !== undefined && JSON.stringify(review.requirementTexts) !== JSON.stringify(report.rules.map(rule => rule.text))) throw new Error('This review belongs to a different run, source snapshot or requirement set.');
  if (!review.reviewer.trim() || !gold.reviewer.trim() || review.validOutcome === null) throw new Error('Reviewed results require named reviewers and an independently assessed outcome.');
  for (const key of ['issues', 'gaps', 'inconsistencies'] as const) {
    const expected = key === 'gaps' ? gold.behaviors.filter((item) => item.initialGap) : gold[key];
    if (!exact(review[key].map((item) => item.id), template[key].map((item) => item.id)) || review[key].some((item) => item.evidenceSupported === null || item.match !== null && !expected.some((label) => label.id === item.match))) throw new Error(`Review must account for every real ${key} finding and use valid reference IDs.`);
  }
  if (!exact(review.coverage.map((item) => item.id), gold.behaviors.map((item) => item.id))) throw new Error('Coverage must include every reference behavior, including omitted behaviors.');
  if (!exact(review.diagnoses.map(diagnosisKey), template.diagnoses.map(diagnosisKey)) || review.diagnoses.some((item) => item.expected === null || item.evidenceSupported === null)) throw new Error('Every collection, baseline and initial execution failure needs an independent diagnosis annotation.');
  const mutantKey = (item: { attempt: number; id: string }) => `${item.attempt}:${item.id}`;
  if (!exact(review.mutants.map(mutantKey), template.mutants.map(mutantKey))) throw new Error('Every measured mutant must remain in the review, including unresolved mutants.');
  for (const item of review.coverage) for (const [nodes, measurement] of [[item.beforeNodes, report.measurements[0]], [item.afterNodes, report.measurements.at(-1)]] as const) {
    if (new Set(nodes).size !== nodes.length || nodes.some((node) => !measurement?.outcomes.some((outcome) => outcome.node === node))) throw new Error('Coverage annotations reference a missing executed test node.');
  }
}

export function scoreReports(items: { report: PythonReport; gold: Gold; review: Review; fault?: FaultProbe }[]) {
  return (['B0', 'B1', 'B2', 'B3'] as const).flatMap((variant) => {
    const runs = items.filter((item) => item.report.variant === variant);
    if (!runs.length) return [];
    const reviewed = runs.filter((item) => item.gold.reviewed && item.review.reviewed);
    const counts = { issues: [0, 0, 0], gaps: [0, 0, 0], inconsistencies: [0, 0, 0] };
    let behaviors = 0, beforeCovered = 0, afterCovered = 0, supported = 0, findings = 0, nonTestFailures = 0, incorrectRepairs = 0;
    const diagnosis = new Map<string, number[]>();
    const mutation = { before: [0, 0, 0], after: [0, 0, 0] };
    for (const { report, gold, review } of reviewed) {
      validateReview(report, gold, review);
      for (const key of ['issues', 'gaps', 'inconsistencies'] as const) {
        const expected = key === 'gaps' ? gold.behaviors.filter((item) => item.initialGap) : gold[key];
        const matched = new Set(review[key].flatMap((item) => item.match === null ? [] : [item.match]));
        counts[key][0] += matched.size; counts[key][1] += review[key].length - matched.size; counts[key][2] += expected.length - matched.size;
      }
      behaviors += gold.behaviors.length;
      beforeCovered += review.coverage.filter((item) => covered(item.beforeNodes, report.measurements[0])).length;
      afterCovered += report.status === 'completed' ? review.coverage.filter((item) => covered(item.afterNodes, report.measurements.at(-1))).length : 0;
      const evidence = [...review.issues, ...review.gaps, ...review.inconsistencies, ...review.diagnoses];
      findings += evidence.length; supported += evidence.filter((item) => item.evidenceSupported).length;
      for (const label of review.diagnoses) {
        const predicted = report.diagnoses.find((item) => diagnosisKey(item) === diagnosisKey(label))?.category || 'unresolved';
        for (const name of new Set([predicted, label.expected!])) {
          const c = diagnosis.get(name) || [0, 0, 0];
          if (name === predicted && name === label.expected) c[0]++; else if (name === predicted) c[1]++; else c[2]++;
          diagnosis.set(name, c);
        }
        if ((!label.phase || label.phase === 'execution') && label.expected !== 'generated_test_error') {
          nonTestFailures++;
          if (report.improvements.some((change) => change.before.some((test) => test.id === label.testId && change.after.find((after) => after.id === test.id)?.code !== test.code))) incorrectRepairs++;
        }
      }
      for (const [phase, index] of [['before', 0], ['after', report.mutations.length - 1]] as const) {
        const measured = report.mutations[index];
        if (!measured) continue;
        const relevant = review.mutants.filter((item) => item.attempt === index && item.relevant && !item.equivalent).map((item) => measured.mutants.find((mutant) => mutant.id === item.id)!);
        mutation[phase][0] += relevant.filter((item) => item.status === 'killed').length;
        mutation[phase][1] += relevant.length;
        if (measured.incomplete || measured.mutants.some((mutant) => !mutant.diff.trim()) || review.mutants.some((item) => item.attempt === index && (item.relevant === null || item.equivalent === null)) || relevant.some((item) => !['killed', 'survived'].includes(item.status))) mutation[phase][2]++;
      }
    }
    const diagnosticScores = [...diagnosis.values()].map((c) => metrics(c[0], c[1], c[2]).f1).filter((value): value is number => value !== null);
    const before = ratio(beforeCovered, behaviors), after = ratio(afterCovered, behaviors);
    const mutationBefore = mutation.before[2] ? null : ratio(mutation.before[0], mutation.before[1]);
    const mutationAfter = mutation.after[2] ? null : ratio(mutation.after[0], mutation.after[1]);
    const faults = runs.filter((item) => item.gold.fault);
    const faultRate = (phase: 'beforeDetected' | 'afterDetected') => !faults.length || faults.some((item) => item.fault?.[phase] == null) ? null : ratio(faults.filter((item) => item.fault?.[phase]).length, faults.length);
    const detection = (key: keyof typeof counts) => reviewed.length ? metrics(counts[key][0], counts[key][1], counts[key][2]) : null;
    return [{
      variant, runs: runs.length, reviewedRuns: reviewed.length, pendingReviewRuns: runs.length - reviewed.length,
      completionRate: ratio(runs.filter((item) => item.report.status === 'completed').length, runs.length),
      validOutcomeRate: reviewed.length ? ratio(reviewed.filter((item) => item.report.status === 'completed' && item.review.validOutcome).length, reviewed.length) : null,
      completedRunsWithExecution: runs.filter((item) => item.report.status === 'completed' && item.report.measurements.at(-1)?.outcomes.some((outcome) => outcome.status !== 'skipped')).length,
      issues: detection('issues'), gaps: detection('gaps'), inconsistencies: detection('inconsistencies'),
      referenceBehaviors: behaviors, semanticCoverageBefore: before, semanticCoverageAfter: after, semanticCoverageChange: before === null || after === null ? null : after - before,
      diagnosisMacroF1: diagnosticScores.length ? diagnosticScores.reduce((a, b) => a + b, 0) / diagnosticScores.length : null,
      nonTestFailures, incorrectRepairs, incorrectRepairRate: ratio(incorrectRepairs, nonTestFailures),
      findingEvidenceSupportRate: ratio(supported, findings), unsupportedFindingRate: ratio(findings - supported, findings),
      mutationScoreBefore: mutationBefore, mutationScoreAfter: mutationAfter, mutationScoreChange: mutationBefore === null || mutationAfter === null ? null : mutationAfter - mutationBefore,
      faultCases: faults.length, faultCasesPendingReferenceReview: faults.filter((item) => !item.gold.reviewed).length, faultDetectionBefore: faultRate('beforeDetected'), faultDetectionAfter: faultRate('afterDetected'),
      unresolvedRunRate: reviewed.length ? ratio(reviewed.filter(({ report, review }) => report.status !== 'completed' || review.issues.length || review.inconsistencies.length || review.coverage.some((item) => !covered(item.afterNodes, report.measurements.at(-1))) || report.states.some((state) => state.status === 'Uncertain')).length, reviewed.length) : null,
    }];
  });
}
