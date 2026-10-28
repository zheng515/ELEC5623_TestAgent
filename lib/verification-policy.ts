import { z } from 'zod';
import type { PythonReport } from './python-types';

export const verificationPolicyVersion = 'contract-witness-v16-exact-execution-references';
export const defaultModelResponseSeconds = 300;

export const verificationPolicySchema = z.object({
  mutationChecks: z.boolean().default(true),
  // Omitted means no request limit; usage is still recorded for every request.
  modelRequestLimit: z.number().int().min(1).optional(),
  modelTimeoutSeconds: z.number().int().min(0).max(86400).optional(),
});
export type VerificationPolicy = z.infer<typeof verificationPolicySchema>;
export const interactivePolicy: VerificationPolicy = { mutationChecks: false };

export function usageNotice(report: PythonReport) {
  const usage = requestUsage(report), threshold = 100_000;
  if (usage.reportedTokens >= threshold) return `${usage.reportedTokens.toLocaleString('en-US')} provider-reported tokens so far${usage.unknownUsage ? `; ${usage.unknownUsage} requests have unknown usage` : ''}. This is a usage notice, not a spending cap.`;
  if (report.resources?.limit && usage.used >= Math.ceil(report.resources.limit * 0.8)) return `${usage.used} of ${report.resources.limit} model requests consumed. ${usage.remaining} remain; incomplete evidence is retained if the limit is reached.`;
  return null;
}

export function requestUsage(report: PythonReport) {
  const requests = report.resources?.requests || [];
  const known = requests.filter(request => request.totalTokens !== undefined);
  return {
    used: requests.length,
    remaining: report.resources && report.resources.limit !== null ? Math.max(0, report.resources.limit - requests.length) : null,
    reportedTokens: known.reduce((sum, request) => sum + request.totalTokens!, 0),
    unknownUsage: requests.length - known.length,
  };
}

export class ModelBudgetError extends Error {
  constructor(limit: number) { super(`Model request budget exhausted (${limit} requests). Partial evidence is retained; unresolved checks are not verified.`); }
}

// Reserve and persist before dispatch. An interrupted request still consumes a slot.
export async function budgetedRequest<T>(report: PythonReport, key: string, save: () => void | Promise<void>, task: (request: NonNullable<PythonReport['resources']>['requests'][number]) => Promise<T>) {
  const resources = report.resources;
  if (!resources) throw new Error('Model request accounting is not initialized.');
  if (resources.limit !== null && resources.requests.length >= resources.limit) {
    resources.exhausted = true;
    report.stopReason = new ModelBudgetError(resources.limit).message;
    await save();
    throw new ModelBudgetError(resources.limit);
  }
  const request: typeof resources.requests[number] = { key, stage: report.stage, status: 'started', startedAt: new Date().toISOString() };
  resources.requests.push(request);
  await save();
  const started = Date.now();
  try {
    const result = await task(request);
    request.status = 'completed';
    return result;
  } catch (error) {
    request.status = 'failed';
    throw error;
  } finally {
    request.elapsedMs = Date.now() - started;
    await save();
  }
}

export function mutationAssessmentMissing(report: PythonReport) {
  return report.policy?.mutationChecks === false && !report.mutations.length;
}
