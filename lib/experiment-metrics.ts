import { createHash } from 'node:crypto';
import { testFile } from './runtime';
import type { Gold, FaultProbe } from './evaluation';
import type { PythonReport, Mutation, Measurement } from './python-types';
import { executableSuiteHash } from './test-suite';

export type ExperimentEntry = { caseId: string; variant: string; repeat: number; report: string; gold: string; review: string; requests?: string; reference?: string; referenceExecution?: string; elapsedMs?: number; fault?: FaultProbe; initialReport?: string };
export type RequestRecord = { elapsedMs: number; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; error?: string };
export type ReferenceCheck = { valid: boolean; sourceFingerprint: string; faultHash: string; oracleHash: string };
export type ReferenceExecution = Measurement & { sourceFingerprint: string; suiteHash: string };
export type ExperimentItem = { entry: ExperimentEntry; report?: PythonReport; gold?: Gold; reference?: ReferenceCheck; referenceExecution?: ReferenceExecution; requests?: RequestRecord[] };
const ratio = (a: number, b: number) => b ? a / b : null;
export function compareSharedInitialSuites(items: ExperimentItem[]) {
  return items.filter(item => item.entry.variant === 'B3').map(item => {
    const prefix = items.find(candidate => candidate.entry.caseId === item.entry.caseId && candidate.entry.repeat === item.entry.repeat && candidate.entry.variant === 'B1');
    const before = prefix && experimentRow(prefix), after = experimentRow(item);
    const initial = item.report?.testAttempts?.find(attempt => attempt.phase === 'generation');
    const hash = prefix?.report && executableSuiteHash(prefix.report.tests);
    const shared = !!hash && prefix?.report?.status === 'completed' && item.entry.initialReport === prefix.entry.report && item.report?.initialSuite?.reportId === prefix.report.id && item.report.initialSuite.executableHash === hash;
    const unchanged = shared && !!initial && executableSuiteHash(initial.tests) === hash;
    if (item.report?.status === 'completed' && !unchanged) throw new Error('A paired continuation must preserve its linked B1 initial executable suite.');
    if (shared && (prefix!.report!.fingerprint !== item.report!.fingerprint || prefix!.report!.model !== item.report!.model || JSON.stringify(prefix!.report!.rules) !== JSON.stringify(item.report!.rules) || JSON.stringify(prefix!.report!.requirementInput) !== JSON.stringify(item.report!.requirementInput) || prefix!.report!.configuration?.sandboxImage !== item.report!.configuration?.sandboxImage)) throw new Error('Paired inputs must match.');
    const sum = (a: number | null | undefined, b: number | null) => a == null || b === null ? null : a + b;
    return { caseId: item.entry.caseId, repeat: item.entry.repeat, status: after.status, sharedInitialVerified: unchanged,
      initialReport: prefix?.entry.report || null, followupReport: item.entry.report,
      initialFaultDetected: before?.faultAfter ?? null, finalFaultDetected: after.faultAfter,
      additionalFaultDetected: before?.faultAfter === false && after.faultAfter === true,
      lostFaultDetection: before?.faultAfter === true && after.faultAfter === false,
      initialReferenceFailure: before?.referenceFailureObserved ?? null, finalReferenceFailure: after.referenceFailureObserved,
      blockedInitialCandidates: initial?.tests.filter(test => !test.approved).length ?? null,
      improvements: item.report?.improvements.length ?? null,
      prefixRequests: before?.modelRequests ?? null, additionalRequests: after.modelRequests, endToEndRequests: sum(before?.modelRequests, after.modelRequests),
      prefixTokens: before?.totalTokens ?? null, additionalTokens: after.totalTokens, endToEndTokens: sum(before?.totalTokens, after.totalTokens),
      prefixSeconds: before?.elapsedSeconds ?? null, additionalSeconds: after.elapsedSeconds, endToEndSeconds: sum(before?.elapsedSeconds, after.elapsedSeconds),
      budgetExhausted: item.report?.resources?.exhausted || item.report?.error?.startsWith('Follow-up model request budget exhausted.') || false,
    };
  });
}
export function pairedMutationCounts(before?: Mutation, after?: Mutation) {
  const usable = (item?: Mutation) => item && !item.incomplete && !item.timedOut && item.mutants.length && new Set(item.mutants.map(mutant => `${mutant.file}:${mutant.id}`)).size === item.mutants.length && item.mutants.every(mutant => mutant.diff && ['killed', 'survived'].includes(mutant.status));
  const keys = (item: Mutation) => item.mutants.map(mutant => [mutant.id, mutant.file, mutant.diff]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!usable(before) || !usable(after) || JSON.stringify(before!.scope) !== JSON.stringify(after!.scope) || JSON.stringify(keys(before!)) !== JSON.stringify(keys(after!))) return null;
  return { total: before!.mutants.length, beforeKilled: before!.mutants.filter(item => item.status === 'killed').length, afterKilled: after!.mutants.filter(item => item.status === 'killed').length };
}
export function experimentRow({ entry, report, gold, reference, referenceExecution, requests }: ExperimentItem) {
  if (report && (report.title !== entry.caseId || report.variant !== entry.variant)) throw new Error('Experiment entry does not match its report.');
  const latest = report?.measurements.at(-1);
  const outcomes = latest?.outcomes || [];
  const generated = outcomes.filter(outcome => report?.tests.some(test => test.approved && outcome.file === testFile(test.id, report.runtime)));
  const count = (items: typeof outcomes, status: string) => items.filter(outcome => outcome.status === status).length;
  const faultHash = createHash('sha256').update(JSON.stringify(gold?.fault || null)).digest('hex');
  const referenceValid = !!report && !!reference?.valid && reference.sourceFingerprint === report.fingerprint && reference.faultHash === faultHash;
  const suiteHash = report ? createHash('sha256').update(JSON.stringify(report.tests.filter(test => test.approved).map(test => ({ id: test.id, code: test.code })))).digest('hex') : null;
  const referenceOutcomes = referenceExecution?.outcomes.filter(outcome => report?.tests.some(test => test.approved && outcome.file === testFile(test.id, report.runtime))) || [];
  const referenceUsable = referenceValid && report?.status === 'completed' && referenceExecution?.sourceFingerprint === report.fingerprint && referenceExecution?.suiteHash === suiteHash && referenceExecution?.integrity === true && !referenceExecution.timedOut && [0, 1].includes(referenceExecution.exitCode) && referenceOutcomes.length > 0 && !referenceExecution.outcomes.some(outcome => ['error', 'skipped'].includes(outcome.status));
  const faultDetection = (phase: 'before' | 'after') => {
    if (!referenceValid || report?.status !== 'completed' || !gold?.fault || entry.fault?.id !== gold.fault.id) return null;
    const measurement = phase === 'before' ? report.measurements[0] : latest;
    if (!measurement?.integrity || measurement.timedOut) return null;
    const failedNodes = (initial: boolean) => {
      const suite = initial ? report.improvements[0]?.before || report.tests : report.tests;
      return (initial ? report.measurements[0] : latest)?.outcomes.filter(outcome => outcome.status === 'failed' && suite.some(test => test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName)) || [];
    };
    const failed = failedNodes(phase === 'before');
    if (!failed.length) return entry.fault[phase === 'before' ? 'beforeDetected' : 'afterDetected'] === false ? false : null;
    const initial = report.measurements[0];
    const offset = phase === 'after' && initial?.integrity && !initial.timedOut && failedNodes(true).length ? 1 : 0;
    const corrected = entry.fault.corrected[offset];
    if (!corrected?.integrity || corrected.timedOut) return null;
    return failed.some(before => corrected.outcomes.some(after => after.node === before.node && after.status === 'passed'));
  };
  const mutation = report && report.mutations.length > 1 ? pairedMutationCounts(report.mutations[0], report.mutations.at(-1)) : null;
  const lastMutation = report?.mutations.at(-1);
  const tokens = (key: 'inputTokens' | 'outputTokens' | 'totalTokens') => requests && requests.every(request => typeof request.usage?.[key] === 'number') ? requests.reduce((sum, request) => sum + request.usage![key]!, 0) : null;
  return {
    caseId: entry.caseId, variant: entry.variant, repeat: entry.repeat, status: report?.status || 'missing',
    elapsedSeconds: entry.elapsedMs === undefined ? null : entry.elapsedMs / 1000,
    modelRequests: requests?.length ?? null, requestErrors: requests?.filter(request => request.error).length ?? null,
    inputTokens: tokens('inputTokens'), outputTokens: tokens('outputTokens'), totalTokens: tokens('totalTokens'),
    approvedArtifacts: report?.tests.filter(test => test.approved).length ?? null,
    blockedArtifacts: report?.tests.filter(test => !test.approved).length ?? null,
    baselinePassed: report?.baseline ? count(report.baseline.outcomes, 'passed') : null,
    passed: count(outcomes, 'passed'), failed: count(outcomes, 'failed'), errors: count(outcomes, 'error'), skipped: count(outcomes, 'skipped'),
    generatedPassed: count(generated, 'passed'), generatedFailed: count(generated, 'failed'), generatedErrors: count(generated, 'error'),
    referenceExecutionUsable: !!referenceUsable,
    referencePassed: referenceUsable ? count(referenceOutcomes, 'passed') : null,
    referenceFailed: referenceUsable ? count(referenceOutcomes, 'failed') : null,
    referenceFailureObserved: referenceUsable ? referenceOutcomes.some(outcome => outcome.status === 'failed') : null,
    suiteHash,
    executionRecorded: !!latest, executionIntegrity: latest ? latest.integrity === true && !latest.timedOut : null,
    completedWithExecution: report?.status === 'completed' && !!latest?.integrity && !latest.timedOut && outcomes.some(outcome => ['passed', 'failed'].includes(outcome.status) && outcome.name !== '<module>'),
    improvementActions: report?.improvements.length ?? null,
    faultCase: !!gold?.fault, referenceValid,
    faultBefore: faultDetection('before'),
    faultAfter: faultDetection('after'),
    mutationTotal: mutation?.total ?? null, mutationBeforeKilled: mutation?.beforeKilled ?? null, mutationAfterKilled: mutation?.afterKilled ?? null,
    mutationAttempts: report?.mutations.length ?? 0,
    rawMutationTotal: lastMutation?.mutants.length ?? null,
    rawMutationKilled: lastMutation?.mutants.filter(mutant => mutant.status === 'killed').length ?? null,
    rawMutationComplete: lastMutation ? !lastMutation.incomplete && !lastMutation.timedOut && lastMutation.mutants.every(mutant => ['killed', 'survived'].includes(mutant.status)) : null,
  };
}
export function summarizeExperiment(items: ExperimentItem[]) {
  const keys = items.map(item => `${item.entry.caseId}:${item.entry.variant}:${item.entry.repeat}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate experiment runs are not allowed.');
  const reports = items.flatMap(item => item.report ? [item.report] : []);
  for (const report of reports) if (reports.some(other => other.title === report.title && (other.fingerprint !== report.fingerprint || other.model !== report.model || JSON.stringify(other.rules) !== JSON.stringify(report.rules) || JSON.stringify(other.requirementInput) !== JSON.stringify(report.requirementInput) || other.configuration?.sandboxImage !== report.configuration?.sandboxImage || other.configuration?.policyVersion !== report.configuration?.policyVersion))) throw new Error('A case must use identical source, requirements, context, model, image and policy in every run.');
  const rows = items.map(experimentRow);
  const summary = [...new Set(rows.map(row => row.variant))].map(variant => {
    const runs = rows.filter(row => row.variant === variant), faults = runs.filter(row => row.faultCase);
    const elapsed = runs.flatMap(row => row.elapsedSeconds === null ? [] : [row.elapsedSeconds]).sort((a, b) => a - b);
    const preserved = faults.filter(row => row.faultBefore === true);
    const total = (key: 'modelRequests' | 'totalTokens') => runs.every(row => row[key] !== null) ? runs.reduce((sum, row) => sum + row[key]!, 0) : null;
    return {
      variant, plannedRuns: runs.length, completed: runs.filter(row => row.status === 'completed').length,
      failed: runs.filter(row => row.status === 'failed').length, missing: runs.filter(row => row.status === 'missing').length,
      completionRate: ratio(runs.filter(row => row.status === 'completed').length, runs.length),
      completedWithExecutionRate: ratio(runs.filter(row => row.completedWithExecution).length, runs.length),
      medianSeconds: elapsed.length ? elapsed.length % 2 ? elapsed[Math.floor(elapsed.length / 2)] : (elapsed[elapsed.length / 2 - 1] + elapsed[elapsed.length / 2]) / 2 : null,
      latencyObservedRuns: elapsed.length, modelRequests: total('modelRequests'), totalTokens: total('totalTokens'),
      approvedArtifacts: runs.reduce((sum, row) => sum + (row.approvedArtifacts || 0), 0),
      blockedArtifacts: runs.reduce((sum, row) => sum + (row.blockedArtifacts || 0), 0),
      generatedPassed: runs.reduce((sum, row) => sum + row.generatedPassed, 0),
      generatedFailed: runs.reduce((sum, row) => sum + row.generatedFailed, 0),
      generatedErrors: runs.reduce((sum, row) => sum + row.generatedErrors, 0),
      referenceObservedRuns: runs.filter(row => row.referenceFailureObserved !== null).length,
      referenceFailureRuns: runs.filter(row => row.referenceFailureObserved === true).length,
      referenceFailureRate: runs.every(row => row.referenceFailureObserved !== null) ? ratio(runs.filter(row => row.referenceFailureObserved).length, runs.length) : null,
      faultRuns: faults.length, unresolvedFaultRuns: faults.filter(row => row.faultAfter === null).length,
      correctedCopyDetectionRate: faults.length && faults.every(row => row.faultAfter !== null) ? ratio(faults.filter(row => row.faultAfter).length, faults.length) : null,
      initialDetections: preserved.length,
      preservedDetectionRate: preserved.length && preserved.every(row => row.faultAfter !== null) ? ratio(preserved.filter(row => row.faultAfter).length, preserved.length) : null,
      independentSemanticAccuracy: null, independentDiagnosisMacroF1: null, independentlyReviewedMutationScore: null,
    };
  });
  const cases = [...new Set(rows.map(row => row.caseId))].flatMap(caseId => summary.map(({ variant }) => {
    const runs = rows.filter(row => row.caseId === caseId && row.variant === variant);
    const suites = runs.flatMap(row => row.suiteHash ? [row.suiteHash] : []);
    return { caseId, variant, plannedRuns: runs.length, observedSuites: suites.length, distinctApprovedSuites: new Set(suites).size,
      detectionObservations: runs.map(row => row.faultAfter), referenceFailureObservations: runs.map(row => row.referenceFailureObserved),
      stabilityAssessed: runs.length > 1 && suites.length === runs.length };
  }));
  return { rows, summary, cases };
}
