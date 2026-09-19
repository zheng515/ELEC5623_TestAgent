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
export interface VerificationReport {
  summary: string;
  behaviors: Behavior[];
  evidence: Record<string, string>[];
  unresolved_issues: string[];
  executed_tests: number;
  semantic_coverage: number | null;
  mutation_score: number | null;
}
export interface VerificationRun {
  id: string;
  project_id: string;
  mode: "scaffold";
  status: "blocked";
  stage: "understand";
  created_at: string;
  input_sha256: string;
  events: { id: string; stage: string; message: string; created_at: string }[];
  report: VerificationReport;
}
export interface SystemInfo {
  version: string;
  mode: "scaffold";
  integrations: {
    key: string;
    name: string;
    status: "ready" | "not_connected";
    description: string;
  }[];
}
