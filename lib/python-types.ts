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
export function groundedAnalysisSchema(files: Record<string, string>, nodes: string[], quotes: string[]) {
  const evidence = analysisSchema.shape.behaviors.element.shape.evidence.element.extend({ file: z.enum(Object.keys(files)) });
  return analysisSchema.extend({
    behaviors: z.array(analysisSchema.shape.behaviors.element.extend({
      quote: z.enum(quotes), files: z.array(z.enum(Object.keys(files).filter(sourceFile))).max(4),
      existingTests: z.array(nodes.length ? z.enum(nodes) : z.string()).max(nodes.length ? 8 : 0),
      evidence: z.array(evidence).max(8),
    })).max(24),
    inconsistencies: z.array(analysisSchema.shape.inconsistencies.element.extend({ quote: z.enum(quotes), evidence: z.array(evidence).min(1).max(6) })).max(12),
  });
}
export const testsSchema = z.object({ tests: z.array(z.object({
  id: z.string().regex(/^T[1-9]\d*$/), behaviorId: z.string(), functionName: z.string().regex(/^test_[A-Za-z0-9_]+$/),
  gapIndexes: z.array(z.number().int().min(0).max(5)).max(6),
  code: z.string().max(6000), quote: z.string().min(1), purpose: z.string(),
})).max(16) });
export const diagnosisSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), category: z.enum(["generated_test_error", "requirement_ambiguity", "potential_implementation_defect", "environment_failure", "uncertain"]),
  reason: z.string(), quote: z.string(), executionQuote: z.string(), evidence: z.array(evidence).max(6),
})).max(32) });
export const reviewTestsSchema = z.object({ decisions: z.array(z.object({
  testId: z.string(), supported: z.boolean(), reason: z.string(), quote: z.string(),
})).max(16) });
export const relevanceSchema = z.object({ decisions: z.array(z.object({
  mutantId: z.string().regex(/^Mutant #[1-9]\d*$/), behaviorId: z.string().regex(/^B[1-9]\d*$/), relevant: z.boolean(), reason: z.string(), quote: z.string(),
})).max(16) });
export type Analysis = z.infer<typeof analysisSchema>;
export type PythonTest = z.infer<typeof testsSchema>["tests"][number] & { approved?: boolean; review?: string; reviewDecision?: { supported: boolean; quote: string; reason: string } };
export type Outcome = { node: string; file: string; name: string; status: "passed" | "failed" | "error" | "skipped"; message: string };
export type Measurement = { outcomes: Outcome[]; exitCode: number; log: string; timedOut: boolean; integrity: boolean };
export type Mutation = { incomplete: boolean; mutants: { id: string; file: string; line: number; status: string; diff: string }[]; log: string; timedOut: boolean };
export type DiagnosisPhase = 'collection' | 'baseline' | 'execution' | 'remeasurement';
export type Diagnosis = z.infer<typeof diagnosisSchema>["decisions"][number] & { phase?: DiagnosisPhase };
export type PythonReport = {
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
  rules: { id: string; text: string; source?: RequirementSource }[]; analysis?: Analysis; tests: PythonTest[];
  requirementDocument?: { id: string; fileName: string; sha256: string; warnings: string[]; selectedBlocks: number; totalBlocks: number; format?: RequirementDocument['format']; pages?: DocumentPage[] };
  parentRunId?: string;
  clarification?: string;
  workerId?: string;
  access?: "owner" | "team";
  sharedWith?: string | null;
  projectSetup?: ProjectSetup;
  baseline?: Measurement; measurements: Measurement[]; mutations: Mutation[];
  diagnoses: Diagnosis[];
  proposedDiagnoses?: Diagnosis[];
  relevance: (z.infer<typeof relevanceSchema>["decisions"][number] & { grounded?: boolean })[];
  improvements: { reason: string; before: PythonTest[]; after: PythonTest[] }[];
  states: { id: string; status: "Verified" | "Partially Verified" | "Unverified" | "Uncertain"; reason: string; nodes: string[] }[];
  limitations: string[];
};
