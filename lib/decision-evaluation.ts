import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ratio } from './evaluation';
import { diagnosisSchema, reviewTestsSchema } from './python-types';
import type { DecisionCase } from '../examples/benchmark/decision-cases';

export const decisionHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const decisionReferenceSchema = z.object({
  datasetHash: z.string(), reviewed: z.boolean(), reviewer: z.string(),
  labels: z.array(z.object({ id: z.string(), allowed: z.array(z.string()).min(1), rationale: z.string().min(1) })),
});
export type DecisionReference = z.infer<typeof decisionReferenceSchema>;
export type DecisionAttempt = { caseId: string; repeat: number; inputHash: string; agentFingerprint: string; elapsedMs: number; output?: unknown; error?: string };
export function decisionLabel(item: DecisionCase, attempt: DecisionAttempt) {
  if (attempt.error || attempt.output === undefined) return null;
  try {
    const decisions = (item.kind === 'test_review' ? reviewTestsSchema : diagnosisSchema).parse(attempt.output).decisions;
    const ids = item.kind === 'test_review' ? item.context.tests.map(test => test.id) : item.context.failedTestIds || [];
    if (ids.length !== 1 || decisions.length !== 1 || decisions[0].testId !== ids[0]) return null;
    const decision = decisions[0];
    if (decision.quote && !item.context.rules.some(rule => rule.text.includes(decision.quote))) return null;
    if ('supported' in decision) return decision.quote.trim() ? decision.supported ? 'supported' : 'blocked' : null;
    return decision.category;
  } catch { return null; }
}

export function scoreDecisions(cases: DecisionCase[], reference: DecisionReference, attempts: DecisionAttempt[], repeat: number, agentFingerprint: string) {
  if (!Number.isInteger(repeat) || repeat < 2 || repeat > 5 || !cases.length || new Set(cases.map(item => item.id)).size !== cases.length) throw new Error('Use unique cases and 2–5 repetitions.');
  if (reference.datasetHash !== decisionHash(cases) || reference.labels.length !== cases.length || new Set(reference.labels.map(label => label.id)).size !== cases.length || reference.labels.some(label => !cases.some(item => item.id === label.id))) throw new Error('Reference labels must match the exact frozen dataset.');
  if (reference.reviewed && !reference.reviewer.trim()) throw new Error('Reviewed labels require a named independent reviewer.');
  for (const item of cases) {
    const allowed = item.kind === 'test_review' ? ['supported', 'blocked'] : diagnosisSchema.shape.decisions.element.shape.category.options;
    const labels = reference.labels.find(label => label.id === item.id)!.allowed;
    if (new Set(labels).size !== labels.length || labels.some(label => !allowed.includes(label)) || item.kind === 'test_review' && labels.length !== 1) throw new Error('Reference labels must use unique case labels; test support needs one decision.');
  }
  const keys = new Set<string>();
  for (const attempt of attempts) {
    const item = cases.find(item => item.id === attempt.caseId), key = `${attempt.caseId}:${attempt.repeat}`;
    if (!item || attempt.agentFingerprint !== agentFingerprint || attempt.inputHash !== decisionHash(item.context) || keys.has(key) || !Number.isInteger(attempt.repeat) || attempt.repeat < 1 || attempt.repeat > repeat) throw new Error('Attempt ID, repetition, agent version or input fingerprint does not match the frozen dataset.');
    keys.add(key);
  }
  const rows = cases.map(item => {
    const predictions = Array.from({ length: repeat }, (_, i) => {
      const attempt = attempts.find(attempt => attempt.caseId === item.id && attempt.repeat === i + 1);
      return attempt ? decisionLabel(item, attempt) : null;
    });
    const labels = reference.labels.find(label => label.id === item.id)!;
    return { id: item.id, kind: item.kind, predictions, draftAllowed: labels.allowed, complete: predictions.every(label => label !== null), unanimous: predictions.every(label => label !== null && label === predictions[0]) };
  });
  const total = cases.length * repeat, valid = rows.reduce((count, row) => count + row.predictions.filter(label => label !== null).length, 0);
  const reviewed = reference.reviewed && !!reference.reviewer.trim();
  const ready = reviewed && valid === total;
  const matches = (row: typeof rows[number]) => row.predictions.filter(label => label !== null && row.draftAllowed.includes(label)).length;
  const diagnoses = rows.filter(row => row.kind === 'diagnosis');
  const blocked = rows.filter(row => row.kind === 'test_review' && !row.draftAllowed.includes('supported'));
  return {
    referenceStatus: reviewed ? 'reviewed' : 'pending_independent_review', cases: cases.length, repeat, expectedDecisions: total,
    validDecisions: valid, missingOrInvalid: total - valid, completionRate: ratio(valid, total),
    unanimousCaseRate: ratio(rows.filter(row => row.unanimous).length, rows.length),
    classificationAccuracy: ready ? ratio(rows.reduce((count, row) => count + matches(row), 0), total) : null,
    diagnosisAccuracy: ready ? ratio(diagnoses.reduce((count, row) => count + matches(row), 0), diagnoses.length * repeat) : null,
    falseSupportRate: ready ? ratio(blocked.reduce((count, row) => count + row.predictions.filter(label => label === 'supported').length, 0), blocked.length * repeat) : null,
    rows,
  };
}
