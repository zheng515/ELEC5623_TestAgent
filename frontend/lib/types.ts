export interface ProjectCreate {
  name: string;
  description: string;
  repository_ref: string;
  requirements_text: string;
  goal: string;
}
export interface Project extends ProjectCreate {
  id: string;
  created_at: string;
}
export type VerificationStatus =
  "Verified" | "Partially Verified" | "Unverified" | "Uncertain";
export interface Behavior {
  id: string;
  requirement_id: string;
  source_quote: string;
  description: string;
  expected_result: string | null;
  verification_status: VerificationStatus;
  code_refs: string[];
  test_refs: string[];
  evidence_refs: string[];
}
export interface RequirementItem {
  id: string;
  text: string;
  source_quote: string;
  testable: boolean;
  ambiguity: string | null;
}
export interface GeneratedTest {
  id: string;
  requirement_ids: string[];
  name: string;
  module: string;
  code: string;
  rationale: string;
}
export type TestOutcome = "passed" | "failed" | "error" | "skipped";
export interface ExecutedTest {
  test_id: string | null;
  module: string;
  name: string;
  outcome: TestOutcome;
  duration_seconds: number;
  message: string;
}
export interface VerificationReport {
  summary: string;
  requirements: RequirementItem[];
  generated_tests: GeneratedTest[];
  behaviors: Behavior[];
  evidence: Record<string, string>[];
  unresolved_issues: string[];
  coverage_gaps: string[];
  executions: ExecutedTest[];
  executed_tests: number;
  execution_success_rate: number | null;
  requirement_coverage: number | null;
  semantic_coverage: number | null;
  mutation_score: number | null;
}
export type RunMode = "scaffold" | "baseline_b0";
export interface VerificationRun {
  id: string;
  project_id: string;
  mode: RunMode;
  status: "blocked" | "completed" | "failed";
  stage: "understand" | "analyze" | "generate" | "execute" | "report";
  created_at: string;
  input_sha256: string;
  events: { id: string; stage: string; message: string; created_at: string }[];
  report: VerificationReport;
}
export interface SystemInfo {
  version: string;
  mode: RunMode;
  integrations: {
    key: string;
    name: string;
    status: "ready" | "not_connected";
    description: string;
  }[];
}
