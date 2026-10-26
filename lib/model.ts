import { createOpenAI } from "@ai-sdk/openai";

export function options(input: { model: string }, signal: AbortSignal) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Fill OPENAI_API_KEY in the root .env or this app's .env.local.");
  return {
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(input.model),
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    maxRetries: 0,
    maxOutputTokens: 6000,
    providerOptions: { openai: { store: false } },
  };
}
