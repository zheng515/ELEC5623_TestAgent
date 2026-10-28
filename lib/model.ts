import { createOpenAI } from "@ai-sdk/openai";
import { APICallError } from "ai";
import { defaultModelResponseSeconds } from './verification-policy';

export class ModelTimeoutError extends Error {
  constructor(seconds: number) {
    super(`Model response timed out after ${seconds} seconds. Partial evidence and the consumed request are retained. Increase the model response timeout or reduce the scope before starting a new run.`);
    this.name = 'ModelTimeoutError';
  }
}

export function modelError(error: unknown) {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 401) return 'OpenAI rejected the API key. Update OPENAI_API_KEY in .env.local and restart the website and worker.';
  if (status === 403 || status === 404) return 'OpenAI cannot access this model. Check its exact model ID and account permissions.';
  if (status === 429) return 'OpenAI quota or rate limit reached. Check the API account and retry later.';
  return (error instanceof Error ? error.message : 'Model request failed.').replaceAll(process.env.OPENAI_API_KEY || '\0', '[redacted]').replace(/sk-[A-Za-z0-9_*.-]+/g, '[redacted]');
}

export function options(input: { model: string; timeoutMs?: number; maxOutputTokens?: number }, signal: AbortSignal) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Fill OPENAI_API_KEY in the root .env or this app's .env.local.");
  if (process.env.OPENAI_API_KEY.startsWith('sk-or-')) throw new Error('Use an OpenAI API key from platform.openai.com. Third-party API keys are not supported.');
  return {
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1' }).responses(input.model),
    // Zero explicitly disables the per-call deadline; owner cancellation remains active.
    abortSignal: (input.timeoutMs ?? defaultModelResponseSeconds * 1000) > 0 ? AbortSignal.any([signal, AbortSignal.timeout(input.timeoutMs ?? defaultModelResponseSeconds * 1000)]) : signal,
    maxRetries: 0,
    ...(input.maxOutputTokens ? { maxOutputTokens: input.maxOutputTokens } : {}),
    providerOptions: { openai: { store: false } },
  };
}
