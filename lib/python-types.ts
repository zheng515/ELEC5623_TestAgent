import { z } from "zod";
import type { RequirementSource, DocumentPage, RequirementDocument } from "./requirements";
import type { ProjectSetup } from "./project-setup";
import type { VerificationPolicy } from './verification-policy';
import { sourceFile, type ProjectRuntime } from "./runtime";
const evidence = z.object({ file: z.string(), quote: z.string().min(1), line: z.number().int().min(1).optional() });
export function sourceEvidenceSchema(files: Record<string, string>) {
  const lines = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, text.split('\n')]));
  return z.object({ file: z.enum(Object.keys(files)), line: z.number().int().min(1).max(Math.max(1, ...Object.values(lines).map(rows => rows.length))) })
    .superRefine((reference, context) => {
      if (!lines[reference.file]?.[reference.line - 1]?.trim()) context.addIssue({ code: 'custom', message: 'Source line is missing or blank.' });
    })
    .transform(reference => ({ ...reference, quote: lines[reference.file][reference.line - 1] }));
}
export const analysisSchema = z.object({
  behaviors: z.array(z.object({
    id: z.string().regex(/^B[1-9]\d*$/), ruleId: z.string(), quote: z.string().min(1),
    text: z.string(), category: z.enum(["rule", "boundary", "condition", "exception"]),
    issue: z.enum(["none", "ambiguous", "incomplete", "not_testable"]).describe('Quality of the ORIGINAL REQUIREMENT, never test coverage or implementation status. Missing tests go in gaps with issue=none when the contract is clear. incomplete means a missing contract detail, not absent assertions.'), reason: z.string(),
    files: z.array(z.string()), existingTests: z.array(z.string()),
    evidence: z.array(evidence), gaps: z.array(z.string()),
  })),
  inconsistencies: z.array(z.object({ ruleId: z.string(), behaviorIds: z.array(z.string()).min(1), quote: z.string(), description: z.string(), evidence: z.array(evidence).min(1) })),
});
export function originalQuoteSchema(quotes: string[], references?: string[]) {
  // Encode multiline originals as stable IDs at the provider boundary; never rewrite text.
  if (references) return z.enum(references).transform(reference => quotes[references.indexOf(reference)]);
  return z.enum(quotes);
}
export function groundedAnalysisSchema(files: Record<string, string>, nodes: string[], quotes: string[], references?: string[], lineReferences = false) {
  const evidence = lineReferences ? sourceEvidenceSchema(files) : analysisSchema.shape.behaviors.element.shape.evidence.element.extend({ file: z.enum(Object.keys(files)) });
  const quote = originalQuoteSchema(quotes, references);
  const behavior = analysisSchema.shape.behaviors.element.extend({
    quote, files: z.array(z.enum(Object.keys(files).filter(sourceFile))),
    existingTests: nodes.length ? z.array(z.enum(nodes)) : z.array(z.string()).max(0),
    evidence: z.array(evidence),
  });
  return analysisSchema.extend({
    behaviors: z.array(z.union([
      behavior.extend({ evidence: z.array(evidence).min(1) }),
      behavior.extend({ files: behavior.shape.files.max(0), existingTests: behavior.shape.existingTests.max(0) }),
    ])),
    inconsistencies: z.array(analysisSchema.shape.inconsistencies.element.extend({ quote, evidence: z.array(evidence).min(1) })),
  });
}
export const testsSchema = z.object({ tests: z.array(z.object({
  id: z.string().regex(/^T[1-9]\d*$/), behaviorId: z.string(), functionName: z.string().regex(/^test_[A-Za-z0-9_]+$/),
  gapIndexes: z.array(z.number().int().min(0)),
  code: z.string(), quote: z.string().min(1), purpose: z.string(),
})) });
export function groundedTestsSchema(behaviors: Pick<Analysis['behaviors'][number], 'id' | 'gaps'>[], quote: z.ZodType<string>) {
  const variants = behaviors.map(behavior => testsSchema.shape.tests.element.extend({
    behaviorId: z.literal(behavior.id), quote,
    gapIndexes: z.array(z.number().int().min(0).max(Math.max(0, behavior.gaps.length - 1))).max(behavior.gaps.length),
  }));
  const item = variants.length === 1 ? variants[0] : variants.length ? z.union(variants) : testsSchema.shape.tests.element.extend({ quote });
  return testsSchema.extend({ tests: variants.length ? z.array(item) : z.array(item).max(0) });
}
export const diagnosisSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), category: z.enum(["generated_test_error", "requirement_ambiguity", "potential_implementation_defect", "environment_failure", "uncertain"]),
  reason: z.string(), quote: z.string(), executionQuote: z.string(), evidence: z.array(evidence),
})) });
export function groundedDiagnosisSchema(ids: string[], quote: z.ZodType<string>, files?: Record<string, string>) {
  const decision = diagnosisSchema.shape.decisions.element.extend({
    testId: ids.length ? z.enum(ids) : z.string(), quote,
  });
  return diagnosisSchema.extend({ decisions: z.array(files ? decision.extend({ evidence: z.array(sourceEvidenceSchema(files)) }) : decision) });
}
export const coverageReviewSchema = z.object({
  ruleId: z.string(), quote: z.string(), complete: z.boolean(), reason: z.string(),
  testIds: z.array(z.string().regex(/^T[1-9]\d*$/)),
  missingExamples: z.array(z.string().min(1)),
});
export const reviewTestsSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), supported: z.boolean(), reason: z.string(), quote: z.string(),
})), coverage: z.array(coverageReviewSchema).default([]) });
export const relevanceSchema = z.object({ decisions: z.array(z.object({
  mutantId: z.string().regex(/^Mutant #[1-9]\d*$/), behaviorId: z.string().regex(/^B[1-9]\d*$/), relevant: z.boolean(), reason: z.string(), quote: z.string(),
})) });
export function groundedRelevanceSchema(pairs: { id: string; behaviorId: string }[], quote: z.ZodType<string>) {
  const variants = pairs.map(pair => relevanceSchema.shape.decisions.element.extend({ mutantId: z.literal(pair.id), behaviorId: z.literal(pair.behaviorId), quote }));
  const item = variants.length === 1 ? variants[0] : variants.length ? z.union(variants) : relevanceSchema.shape.decisions.element;
  // At most one decision per supplied pair; mutation review batches bound how many pairs one request carries.
  return relevanceSchema.extend({ decisions: z.array(item).max(pairs.length) });
}
export type Analysis = z.infer<typeof analysisSchema>;
export type PythonTest = z.infer<typeof testsSchema>["tests"][number] & { approved?: boolean; review?: string; reviewDecision?: { supported: boolean; quote: string; reason: string } };
export type TestAttempt = {
  phase: 'generation' | 'improvement'; reason: string;
  status: 'proposed' | 'reviewed' | 'applied' | 'rejected' | 'failed';
  tests: PythonTest[]; decisions?: z.infer<typeof reviewTestsSchema>['decisions']; coverage?: z.infer<typeof coverageReviewSchema>[]; coverageRuleIds?: string[]; error?: string;
};
export type Outcome = { node: string; file: string; name: string; status: "passed" | "failed" | "error" | "skipped"; message: string; screenshot?: string };
export type Measurement = { outcomes: Outcome[]; exitCode: number; log: string; timedOut: boolean; integrity: boolean; runtimeArtifacts?: { file: string; kind: 'sqlite'; sha256: string }[] };
export type Mutation = { incomplete: boolean; mutants: { id: string; file: string; line: number; status: string; diff: string }[]; log: string; timedOut: boolean; scope?: { file: string; functions: string[]; lines: number[]; kind: 'functions' | 'file'; suite: 'approved_generated'; setupFiles?: string[] }; totalMutants?: number };
export type DiagnosisPhase = 'collection' | 'baseline' | 'execution' | 'remeasurement';
export type Diagnosis = z.infer<typeof diagnosisSchema>["decisions"][number] & { phase?: DiagnosisPhase };
export type PythonReport = {
  policy?: VerificationPolicy;
  resources?: {
    limit: number | null; exhausted?: boolean;
    requests: { key: string; stage: string; status: 'started' | 'completed' | 'failed'; startedAt: string; elapsedMs?: number; inputTokens?: number; outputTokens?: number; totalTokens?: number; promptBytes?: number; promptHash?: string }[];
  };
  initialSuite?: { reportId: string; executableHash: string };
  testAttempts?: TestAttempt[];
  stopReason?: string;
  analysisCorrection?: { original: Analysis; error: string; removed?: string[] };
  runtime?: ProjectRuntime;
  execution?: { queueId: string; image: string; attempt: number; recovered: boolean };
  variant?: "B0" | "B1" | "B2" | "B3";
  environment?: Record<string, string>;
  collection?: { exitCode: number; log: string; timedOut?: boolean };
  elapsedMs?: number;
  retrieval?: { query: string; documents: { file: string; text: string; score: number; sha256: string }[] };
  configuration?: { sandboxImage: string; improvementLimit: number; mutationSeconds: number; policyVersion?: string; mode?: 'saved_tests' | 'regenerate' };
  initialStates?: PythonReport["states"];
  id: string; title: string; createdAt: string; model: string; source: string; fingerprint: string;
  status: "running" | "completed" | "failed" | "cancelled"; stage: string; error?: string;
  rules: { id: string; text: string; originalId?: string; source?: RequirementSource; sources?: RequirementSource[] }[]; analysis?: Analysis; tests: PythonTest[];
  requirementInput?: { mode: 'numbered' | 'text'; text: string; context: string };
  requirementDocument?: { id: string; fileName: string; sha256: string; warnings: string[]; selectedBlocks: number; totalBlocks: number; textEdited?: boolean; format?: RequirementDocument['format']; pages?: DocumentPage[] };
  parentRunId?: string;
  replay?: { suiteHash: string; states: PythonReport['states'] };
  clarification?: string;
  workerId?: string;
  projectSetup?: ProjectSetup;
  baseline?: Measurement; measurements: Measurement[]; mutations: Mutation[];
  diagnoses: Diagnosis[];
  proposedDiagnoses?: Diagnosis[];
  relevance: (z.infer<typeof relevanceSchema>["decisions"][number] & { grounded?: boolean; file?: string; diff?: string })[];
  improvementProposal?: PythonTest[];
  improvements: { reason: string; before: PythonTest[]; after: PythonTest[] }[];
  states: { id: string; status: "Verified" | "Partially Verified" | "Unverified" | "Uncertain"; reason: string; nodes: string[] }[];
  limitations: string[];
};
