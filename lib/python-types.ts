import { z } from "zod";
import type { RequirementSource, DocumentPage, RequirementDocument } from "./requirements";
import type { ProjectSetup } from "./project-setup";
import { sourceFile, type ProjectRuntime } from "./runtime";
const evidence = z.object({ file: z.string(), quote: z.string().min(1) });
export const analysisSchema = z.object({
  behaviors: z.array(z.object({
    id: z.string().regex(/^B[1-9]\d*$/), ruleId: z.string(), quote: z.string().min(1),
    text: z.string(), category: z.enum(["rule", "boundary", "condition", "exception"]),
    issue: z.enum(["none", "ambiguous", "incomplete", "not_testable"]), reason: z.string(),
    files: z.array(z.string()).max(4), existingTests: z.array(z.string()).max(8),
    evidence: z.array(evidence).max(8), gaps: z.array(z.string()).max(6),
  })).max(24),
  inconsistencies: z.array(z.object({ ruleId: z.string(), behaviorIds: z.array(z.string()).min(1).max(24), quote: z.string(), description: z.string(), evidence: z.array(evidence).min(1).max(6) })).max(12),
});
export function originalQuoteSchema(quotes: string[], references?: string[]) {
  // Encode multiline originals as stable IDs at the provider boundary; never rewrite text.
  if (references) return z.enum(references).transform(reference => quotes[references.indexOf(reference)]);
  return z.enum(quotes);
}
export function groundedAnalysisSchema(files: Record<string, string>, nodes: string[], quotes: string[], references?: string[]) {
  const evidence = analysisSchema.shape.behaviors.element.shape.evidence.element.extend({ file: z.enum(Object.keys(files)) });
  const quote = originalQuoteSchema(quotes, references);
  const behavior = analysisSchema.shape.behaviors.element.extend({
    quote, files: z.array(z.enum(Object.keys(files).filter(sourceFile))).max(4),
    existingTests: z.array(nodes.length ? z.enum(nodes) : z.string()).max(nodes.length ? 8 : 0),
    evidence: z.array(evidence).max(8),
  });
  return analysisSchema.extend({
    behaviors: z.array(z.union([
      behavior.extend({ evidence: z.array(evidence).min(1).max(8) }),
      behavior.extend({ files: behavior.shape.files.max(0), existingTests: behavior.shape.existingTests.max(0) }),
    ])).max(24),
    inconsistencies: z.array(analysisSchema.shape.inconsistencies.element.extend({ quote, evidence: z.array(evidence).min(1).max(6) })).max(12),
  });
}
export const testsSchema = z.object({ tests: z.array(z.object({
  id: z.string().regex(/^T[1-9]\d*$/), behaviorId: z.string(), functionName: z.string().regex(/^test_[A-Za-z0-9_]+$/),
  gapIndexes: z.array(z.number().int().min(0).max(5)).max(6),
  code: z.string().max(6000), quote: z.string().min(1), purpose: z.string(),
})).max(16) });
export function groundedTestsSchema(behaviors: Pick<Analysis['behaviors'][number], 'id' | 'gaps'>[], quote: z.ZodType<string>) {
  const variants = behaviors.map(behavior => testsSchema.shape.tests.element.extend({
    behaviorId: z.literal(behavior.id), quote,
    gapIndexes: z.array(z.number().int().min(0).max(Math.max(0, behavior.gaps.length - 1))).max(behavior.gaps.length),
  }));
  const item = variants.length === 1 ? variants[0] : variants.length ? z.union(variants) : testsSchema.shape.tests.element.extend({ quote });
  return testsSchema.extend({ tests: z.array(item).max(variants.length ? 16 : 0) });
}
export const diagnosisSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), category: z.enum(["generated_test_error", "requirement_ambiguity", "potential_implementation_defect", "environment_failure", "uncertain"]),
  reason: z.string(), quote: z.string(), executionQuote: z.string(), evidence: z.array(evidence).max(6),
})).max(32) });
export function groundedDiagnosisSchema(ids: string[], quote: z.ZodType<string>) {
  return diagnosisSchema.extend({ decisions: z.array(diagnosisSchema.shape.decisions.element.extend({
    testId: ids.length ? z.enum(ids) : z.string(), quote,
  })).max(32) });
}
export const reviewTestsSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), supported: z.boolean(), reason: z.string(), quote: z.string(),
})).max(16) });
export const relevanceSchema = z.object({ decisions: z.array(z.object({
  mutantId: z.string().regex(/^Mutant #[1-9]\d*$/), behaviorId: z.string().regex(/^B[1-9]\d*$/), relevant: z.boolean(), reason: z.string(), quote: z.string(),
})).max(16) });
export type Analysis = z.infer<typeof analysisSchema>;
export type PythonTest = z.infer<typeof testsSchema>["tests"][number] & { approved?: boolean; review?: string; reviewDecision?: { supported: boolean; quote: string; reason: string } };
export type Outcome = { node: string; file: string; name: string; status: "passed" | "failed" | "error" | "skipped"; message: string };
export type Measurement = { outcomes: Outcome[]; exitCode: number; log: string; timedOut: boolean; integrity: boolean; runtimeArtifacts?: { file: string; kind: 'sqlite'; sha256: string }[] };
export type Mutation = { incomplete: boolean; mutants: { id: string; file: string; line: number; status: string; diff: string }[]; log: string; timedOut: boolean; scope?: { file: string; functions: string[]; lines: number[]; kind: 'functions' | 'file'; suite: 'approved_generated'; setupFiles?: string[] }; totalMutants?: number };
export type DiagnosisPhase = 'collection' | 'baseline' | 'execution' | 'remeasurement';
export type Diagnosis = z.infer<typeof diagnosisSchema>["decisions"][number] & { phase?: DiagnosisPhase };
export type PythonReport = {
  analysisCorrection?: { original: Analysis; error: string };
  runtime?: ProjectRuntime;
  execution?: { queueId: string; image: string; attempt: number; recovered: boolean };
  variant?: "B0" | "B1" | "B2" | "B3";
  environment?: Record<string, string>;
  collection?: { exitCode: number; log: string; timedOut?: boolean };
  elapsedMs?: number;
  retrieval?: { query: string; documents: { file: string; text: string; score: number; sha256: string }[] };
  configuration?: { sandboxImage: string; improvementLimit: number; mutationSeconds: number };
  initialStates?: PythonReport["states"];
  id: string; title: string; createdAt: string; model: string; source: string; fingerprint: string;
  status: "running" | "completed" | "failed" | "cancelled"; stage: string; error?: string;
  rules: { id: string; text: string; source?: RequirementSource; sources?: RequirementSource[] }[]; analysis?: Analysis; tests: PythonTest[];
  requirementDocument?: { id: string; fileName: string; sha256: string; warnings: string[]; selectedBlocks: number; totalBlocks: number; textEdited?: boolean; format?: RequirementDocument['format']; pages?: DocumentPage[] };
  parentRunId?: string;
  clarification?: string;
  workerId?: string;
  projectSetup?: ProjectSetup;
  baseline?: Measurement; measurements: Measurement[]; mutations: Mutation[];
  diagnoses: Diagnosis[];
  proposedDiagnoses?: Diagnosis[];
  relevance: (z.infer<typeof relevanceSchema>["decisions"][number] & { grounded?: boolean; file?: string; diff?: string })[];
  improvements: { reason: string; before: PythonTest[]; after: PythonTest[] }[];
  states: { id: string; status: "Verified" | "Partially Verified" | "Unverified" | "Uncertain"; reason: string; nodes: string[] }[];
  limitations: string[];
};
