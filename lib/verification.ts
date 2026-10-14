import { z } from "zod";

export const requestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(8000),
  endpoint: z.url().max(2000).refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash;
  }, "Use an HTTP(S) URL without credentials or a fragment."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  headers: z.record(z.string(), z.string()).default({}),
  model: z.string().trim().min(1).max(100),
});
export const caseSchema = z.object({
  id: z.string().min(1).max(40),
  ruleId: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  query: z.array(z.object({ name: z.string().max(100), value: z.string().max(1000) })).max(12),
  bodyJson: z.string().max(8000).nullable(),
  expectedStatus: z.number().int().min(100).max(599).nullable(),
  assertions: z.array(z.object({
    pointer: z.string().max(200).regex(/^(?:\/(?:[^~/]|~0|~1)*)*$/),
    expectedJson: z.string().max(8000).describe("JSON-encoded expected value; preserve its JSON type."),
  })).max(8),
  rationale: z.string().min(1).max(1000),
});
export const planSchema = z.object({ cases: z.array(caseSchema).max(16) });
export const reviewSchema = z.object({
  decisions: z.array(z.object({
    caseId: z.string(),
    verdict: z.enum(["supported", "contradicted", "insufficient"]),
    evidence: z.string(),
    reason: z.string(),
  })).max(16),
  coverage: z.array(z.object({
    ruleId: z.string(),
    verdict: z.enum(["covered", "missing", "unclear"]),
    reason: z.string(),
  })).max(12),
});
export type VerificationInput = z.infer<typeof requestSchema>;
export type TestCase = z.infer<typeof caseSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Rule = { id: string; text: string };
export type CaseResult = {
  caseId: string;
  ruleId: string;
  status: "passed" | "failed" | "blocked" | "error";
  reason: string;
  durationMs: number;
  request?: { url: string; method: string; bodyJson: string | null };
  response?: { status: number; body: string };
  checks?: { label: string; expected: unknown; actual: unknown; passed: boolean }[];
};
export type VerificationReport = {
  version: 1;
  title: string;
  endpoint: string;
  method: string;
  model: string;
  createdAt: string;
  rules: Rule[];
  cases: TestCase[];
  review: Review;
  results: CaseResult[];
  uncoveredRuleIds: string[];
  conclusion: "passed" | "failed" | "inconclusive";
  summary: string;
  elapsedMs: number;
  tokensUsed?: number;
  limitations: string[];
};
