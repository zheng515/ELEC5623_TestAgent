export const VALIDATION_VERSION = 3;

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}
export interface Credentials {
  email: string;
  password: string;
}
export interface RegisterRequest extends Credentials {
  name: string;
}

export interface DocumentLocation {
  filename: string;
  kind: "page" | "paragraph";
  number: number;
}
export interface RequirementDocument {
  id: string;
  filename: string;
  format: "pdf" | "docx";
  sha256: string;
  text: string;
  segments: (DocumentLocation & { start: number; end: number })[];
  warnings: string[];
}

export interface ProjectCreate {
  requirement_document_id?: string | null;
  name: string;
  description: string;
  repository_ref: string;
  requirements_text: string;
  goal: string;
}
export interface Project extends ProjectCreate {
  requirement_document?: RequirementDocument | null;
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
  scenario_ids?: string[];
  name: string;
  module: string;
  code: string;
  rationale: string;
  validation_status?: "not_checked" | "validated" | "needs_review";
  validation_issues?: string[];
  validated_checks?: {
    scenario_id: string;
    function_name: string;
    target: string;
    call_line: number;
    assertion_line: number;
  }[];
}
export interface TestScenario {
  oracle_grounding?: OracleGrounding | null;
  id: string;
  requirement_ids: string[];
  title: string;
  category: "nominal" | "boundary" | "negative";
  preconditions: string[];
  inputs: string[];
  steps: string[];
  expected_result: string;
  evidence_refs: string[];
  assumptions: string[];
  check?: {
    target: string;
    arguments: unknown[];
    keyword_arguments: { name: string; value: unknown }[];
    operator: "equals" | "raises";
    expected_value: unknown;
    exception_type: string | null;
  } | null;
}
export interface OracleGrounding {
  version: number;
  status: "supported" | "needs_review";
  verdict: "supported" | "contradicted" | "insufficient" | null;
  rationale: string;
  citations: { requirement_id: string; quote: string }[];
  issues: string[];
  scenario_sha256: string;
  source_sha256: string;
}
export interface TestPlan {
  scenarios: TestScenario[];
  notes: string;
}
export interface ModuleInterface {
  module: string;
  path: string;
  docstring: string;
  constants: string[];
  functions: string[];
  classes: string[];
}
export interface CodeSnapshot {
  id: string;
  content_sha256: string;
  files: { path: string; size: number; sha256: string; mode: number }[];
  directories: string[];
  excluded: string[];
}
export interface RepositorySource {
  provider: "github";
  repository: string;
  url: string;
  requested_ref?: string | null;
  ref: string;
  commit_sha: string;
  subdirectory: string;
}
export interface RepositorySnapshot {
  artifact?: CodeSnapshot | null;
  import_roots?: string[];
  source?: RepositorySource | null;
  root: string;
  modules: ModuleInterface[];
  skipped: string[];
  truncated: boolean;
  sha256: string;
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
export interface TestDiagnosis {
  test_id: string | null;
  classification: "invalid_test" | "suspected_defect" | "inconclusive";
  explanation: string;
}
export interface ExecutionEnvironment {
  requested_image: string;
  image_id: string;
  repo_digests: string[];
  image_os: string;
  image_architecture: string;
  python_version: string;
  platform: string;
  packages: { name: string; version: string }[];
  fingerprint: string;
}
export interface ExecutionAttempt {
  number: number;
  stage: "measure" | "re_measure";
  created_at: string;
  tests: GeneratedTest[];
  result: {
    executions: ExecutedTest[];
    exit_code: number;
    timed_out: boolean;
    stderr_excerpt: string;
    repository_content_sha256?: string | null;
    snapshot_error?: string | null;
    environment?: ExecutionEnvironment | null;
    environment_error?: string | null;
  };
  diagnoses: TestDiagnosis[];
}
export interface SourceFragment {
  locations?: DocumentLocation[];
  text: string;
  start: number;
  end: number;
  line: number;
}
export interface SourceAnalysisAudit {
  document?: RequirementDocument | null;
  version: number;
  extraction_limit: number;
  limit_reached: boolean;
  returned_requirements: number;
  retained_requirements: number;
  links: (SourceFragment & { requirement_ids: string[] })[];
  unlinked_fragments: SourceFragment[];
  ambiguous_requirement_ids: string[];
  semantic_completeness: "not_established";
  issues: string[];
}
export interface ProjectReadiness {
  status: "ready" | "blocked" | "unknown";
  checks: {
    kind: "layout" | "python" | "dependency" | "import";
    subject: string;
    status: "passed" | "failed" | "unknown";
    detail: string;
  }[];
  notes: string[];
  import_roots: string[];
  environment?: ExecutionEnvironment | null;
}
export interface VerificationReport {
  requirement_document?: RequirementDocument | null;
  project_readiness?: ProjectReadiness | null;
  source_audit?: SourceAnalysisAudit | null;
  validation_version?: number | null;
  outcome_mapping_version?: number | null;
  summary: string;
  repository: RepositorySnapshot | null;
  requirements: RequirementItem[];
  test_plan?: TestPlan | null;
  planning_gaps?: string[];
  uncovered_scenarios?: string[];
  generated_tests: GeneratedTest[];
  behaviors: Behavior[];
  evidence: Record<string, string>[];
  unresolved_issues: string[];
  coverage_gaps: string[];
  executions: ExecutedTest[];
  execution_attempts?: ExecutionAttempt[];
  execution_gaps?: string[];
  diagnoses?: TestDiagnosis[];
  refinement_iterations?: number;
  executed_tests: number;
  execution_success_rate: number | null;
  requirement_coverage: number | null;
  semantic_coverage: number | null;
  mutation_score: number | null;
}
export type RunMode = "scaffold" | "baseline_b0" | "baseline_b2";
export interface VerificationRun {
  id: string;
  project_id: string;
  mode: RunMode;
  status: "queued" | "running" | "blocked" | "completed" | "failed";
  stage:
    | "understand"
    | "inspect"
    | "analyze"
    | "plan"
    | "generate"
    | "execute"
    | "improve"
    | "re_measure"
    | "report";
  created_at: string;
  updated_at?: string | null;
  input_sha256: string;
  inputs?: ProjectCreate | null;
  events: { id: string; stage: string; message: string; created_at: string }[];
  report: VerificationReport;
}
export function isRunActive(run?: VerificationRun): boolean {
  return run?.status === "queued" || run?.status === "running";
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
