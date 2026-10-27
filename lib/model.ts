import { createOpenAI } from "@ai-sdk/openai";

export function options(input: { model: string }, signal: AbortSignal) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Fill OPENAI_API_KEY in the root .env or this app's .env.local.");
  return {
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses(input.model),
    abortSignal: signal,
    maxRetries: 0,
    providerOptions: { openai: { store: false } },
  };
}
