from datetime import datetime
from enum import StrEnum
from typing import Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Store one canonical form so case variants cannot create duplicate accounts."""
        try:
            result = validate_email(
                value.strip(),
                check_deliverability=False,
                allow_display_name=False,
                strict=True,
            )
        except EmailNotValidError as error:
            raise ValueError("Enter a valid email address.") from error
        return result.normalized.lower()


class RegisterRequest(Credentials):
    name: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter your name.")
        return value


class User(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime


class VerificationStatus(StrEnum):
    VERIFIED = "Verified"
    PARTIAL = "Partially Verified"
    UNVERIFIED = "Unverified"
    UNCERTAIN = "Uncertain"


class DocumentLocation(BaseModel):
    method: Literal["text", "ocr", "converted"] = "text"
    confidence: float | None = Field(default=None, ge=0, le=100)
    filename: str
    kind: Literal["page", "paragraph"]
    number: int


class DocumentSegment(DocumentLocation):
    start: int
    end: int


class RequirementDocument(BaseModel):
    id: str
    filename: str
    format: Literal["pdf", "docx", "doc"]
    sha256: str
    text: str
    segments: list[DocumentSegment]
    warnings: list[str]


class DocumentImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1, max_length=7_000_000)


class ProjectCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    repository_ref: str = Field(default="", max_length=500)
    requirements_text: str = Field(min_length=1, max_length=50000)
    requirement_document_id: str | None = Field(default=None, max_length=36)
    goal: str = Field(
        default="Identify verification gaps and improve requirement-based tests.",
        min_length=1,
        max_length=2000,
    )


class ProjectUpdate(BaseModel):
    """Editable project inputs. Omitted fields retain their current values."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    requirement_document_id: str | None = Field(default=None, max_length=36)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    repository_ref: str | None = Field(default=None, max_length=500)
    requirements_text: str | None = Field(default=None, min_length=1, max_length=50000)
    goal: str | None = Field(default=None, min_length=1, max_length=2000)


class Project(ProjectCreate):
    requirement_document: RequirementDocument | None = None
    id: str
    created_at: datetime


class Behavior(BaseModel):
    id: str
    requirement_id: str
    source_quote: str
    description: str
    expected_result: str | None = None
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    code_refs: list[str] = Field(default_factory=list)
    test_refs: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)


class RequirementItem(BaseModel):
    """A single structured requirement extracted from the submitted text (FR2, FR3)."""

    id: str
    text: str
    source_quote: str
    testable: bool
    ambiguity: str | None


class RequirementAnalysis(BaseModel):
    """Structured output contract for the requirement analyzer."""

    requirements: list[RequirementItem]
    notes: str


class SourceFragment(BaseModel):
    locations: list[DocumentLocation] = Field(default_factory=list)
    text: str
    start: int
    end: int
    line: int


class SourceLink(SourceFragment):
    requirement_ids: list[str]


class SourceAnalysisAudit(BaseModel):
    """Server-computed quote provenance; not a semantic completeness assessment."""

    version: int = 1
    document: RequirementDocument | None = None
    extraction_limit: int
    limit_reached: bool
    returned_requirements: int
    retained_requirements: int
    links: list[SourceLink] = Field(default_factory=list)
    unlinked_fragments: list[SourceFragment] = Field(default_factory=list)
    ambiguous_requirement_ids: list[str] = Field(default_factory=list)
    semantic_completeness: Literal["not_established"] = "not_established"
    issues: list[str] = Field(default_factory=list)


class ModuleInterface(BaseModel):
    """The importable surface of one source module, as read from its AST (FR4)."""

    module: str
    path: str
    docstring: str
    constants: list[str] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    classes: list[str] = Field(default_factory=list)


class SnapshotFile(BaseModel):
    path: str
    size: int
    sha256: str
    mode: int


class CodeSnapshot(BaseModel):
    id: str
    content_sha256: str
    files: list[SnapshotFile]
    directories: list[str]
    excluded: list[str] = Field(default_factory=list)


class RepositorySource(BaseModel):
    """Where a downloaded repository came from, pinned to the commit that was read."""

    provider: Literal["github"] = "github"
    repository: str
    url: str
    requested_ref: str | None = None
    ref: str
    commit_sha: str
    subdirectory: str = ""


class RepositorySnapshot(BaseModel):
    """What was read from the project under test, and what was deliberately not."""

    root: str
    modules: list[ModuleInterface]
    skipped: list[str] = Field(default_factory=list)
    truncated: bool = False
    sha256: str
    artifact: CodeSnapshot | None = None
    import_roots: list[str] = Field(default_factory=lambda: ["."])
    source: RepositorySource | None = None
    # Qualified public name -> signature without docs ("shipping.fee" -> "def fee(...)").
    # Compared between runs to find new or changed functionality; never sent to the model.
    # None on snapshots saved before it existed.
    callables: dict[str, str] | None = None


LiteralScalar = str | int | float | bool | None
LiteralValue = LiteralScalar | list[LiteralScalar]


class KeywordArgument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(pattern=r"^[A-Za-z_]\w*$")
    value: LiteralValue


class ScenarioCheck(BaseModel):
    """Literal call and oracle planned before generation; never executed on the host."""

    model_config = ConfigDict(extra="forbid")
    target: str = Field(pattern=r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$")
    arguments: list[LiteralValue] = Field(default_factory=list)
    keyword_arguments: list[KeywordArgument] = Field(default_factory=list)
    operator: Literal["equals", "raises"]
    expected_value: LiteralValue = None
    exception_type: str | None = None

    @field_validator("keyword_arguments", mode="before")
    @classmethod
    def normalize_keywords(cls, value):
        # Preserve compatibility with early local contracts; model output uses closed objects.
        if isinstance(value, dict):
            return [{"name": key, "value": item} for key, item in value.items()]
        return value


class ValidatedCheck(BaseModel):
    scenario_id: str
    function_name: str
    target: str
    call_line: int
    assertion_line: int


class OracleCitation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requirement_id: str
    quote: str = Field(min_length=1)


class OracleDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str
    verdict: Literal["supported", "contradicted", "insufficient"]
    rationale: str = Field(min_length=1)
    citations: list[OracleCitation]


class OracleReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[OracleDecision]


class OracleGrounding(BaseModel):
    """Server-checked citations plus an AI assessment, never semantic proof."""

    version: int = 1
    status: Literal["supported", "needs_review"]
    verdict: Literal["supported", "contradicted", "insufficient"] | None = None
    rationale: str
    citations: list[OracleCitation] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    scenario_sha256: str
    source_sha256: str


class TestScenario(BaseModel):
    """A proposed check with source links and a separate oracle assessment (FR6)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    requirement_ids: list[str]
    title: str = Field(min_length=1)
    category: Literal["nominal", "boundary", "negative"]
    preconditions: list[str]
    inputs: list[str]
    steps: list[str] = Field(min_length=1)
    expected_result: str = Field(min_length=1)
    evidence_refs: list[str]
    assumptions: list[str]
    check: ScenarioCheck | None = None
    oracle_grounding: OracleGrounding | None = None


class TestPlan(BaseModel):
    """Persisted output of the planning stage, distinct from executable tests."""

    scenarios: list[TestScenario]
    notes: str


class GeneratedTest(BaseModel):
    """A generated pytest test and the requirements it claims to cover (FR7, FR8)."""

    id: str
    requirement_ids: list[str]
    scenario_ids: list[str] = Field(default_factory=list)
    name: str
    module: str
    code: str
    rationale: str
    validation_status: Literal["not_checked", "validated", "needs_review"] = "not_checked"
    validation_issues: list[str] = Field(default_factory=list)
    validated_checks: list[ValidatedCheck] = Field(default_factory=list)


class GeneratedTestSuite(BaseModel):
    """Structured output contract for the test generator."""

    tests: list[GeneratedTest]
    notes: str


class ExecutedTest(BaseModel):
    """The recorded outcome of one test that pytest actually ran (FR9, FR10).

    Not named TestExecution because pytest would try to collect the class.
    """

    test_id: str | None
    module: str
    name: str
    outcome: Literal["passed", "failed", "error", "skipped"]
    duration_seconds: float
    message: str


class RuntimePackage(BaseModel):
    name: str
    version: str


class ExecutionEnvironment(BaseModel):
    requested_image: str
    image_id: str
    repo_digests: list[str]
    image_os: str
    image_architecture: str
    python_version: str
    platform: str
    packages: list[RuntimePackage]
    fingerprint: str


class ExecutionResult(BaseModel):
    """Everything one sandbox invocation produced."""

    executions: list[ExecutedTest]
    exit_code: int
    timed_out: bool
    stderr_excerpt: str
    repository_content_sha256: str | None = None
    snapshot_error: str | None = None
    environment: ExecutionEnvironment | None = None
    environment_error: str | None = None


class ReadinessCheck(BaseModel):
    kind: Literal["layout", "python", "dependency", "import"]
    subject: str
    status: Literal["passed", "failed", "unknown"]
    detail: str


class ProjectReadiness(BaseModel):
    status: Literal["ready", "blocked", "unknown"]
    checks: list[ReadinessCheck] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    import_roots: list[str] = Field(default_factory=lambda: ["."])
    environment: ExecutionEnvironment | None = None


class ExecutionAttempt(BaseModel):
    """Immutable test artifacts and results for one sandbox invocation."""

    number: int
    stage: Literal["measure", "re_measure"]
    created_at: datetime
    tests: list[GeneratedTest]
    result: ExecutionResult
    diagnoses: list["TestDiagnosis"] = Field(default_factory=list)


class TestDiagnosis(BaseModel):
    """Conservative classification of an observed test outcome (FR11)."""

    test_id: str | None
    classification: Literal["invalid_test", "suspected_defect", "inconclusive"]
    explanation: str


class RunEvent(BaseModel):
    id: str
    stage: Literal[
        "queue",
        "interrupt",
        "understand",
        "inspect",
        "analyze",
        "plan",
        "generate",
        "measure",
        "improve",
        "re_measure",
    ]
    message: str
    created_at: datetime


class RepositoryChange(BaseModel):
    """How the code moved since the baseline run, and how this run responded (watch mode)."""

    baseline_run_id: str
    baseline_commit: str | None = None
    commit: str | None = None
    content_changed: bool
    # Qualified public names: functions, classes and methods.
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    changed: list[str] = Field(default_factory=list)
    new_scenario_ids: list[str] = Field(default_factory=list)
    new_test_ids: list[str] = Field(default_factory=list)
    carried_test_ids: list[str] = Field(default_factory=list)
    # New or changed functions that no requirement-backed scenario checks.
    untraced: list[str] = Field(default_factory=list)
    # Carried tests that validated at the baseline but not against the new code.
    invalidated_tests: list[str] = Field(default_factory=list)
    # Test functions that passed at the baseline and fail or error now.
    regressions: list[str] = Field(default_factory=list)


class VerificationReport(BaseModel):
    requirement_document: RequirementDocument | None = None
    summary: str
    validation_version: int | None = None
    outcome_mapping_version: int | None = None
    source_audit: SourceAnalysisAudit | None = None
    repository: RepositorySnapshot | None = None
    project_readiness: ProjectReadiness | None = None
    requirements: list[RequirementItem] = Field(default_factory=list)
    test_plan: TestPlan | None = None
    planning_gaps: list[str] = Field(default_factory=list)
    uncovered_scenarios: list[str] = Field(default_factory=list)
    generated_tests: list[GeneratedTest] = Field(default_factory=list)
    behaviors: list[Behavior] = Field(default_factory=list)
    evidence: list[dict[str, str]] = Field(default_factory=list)
    unresolved_issues: list[str] = Field(default_factory=list)
    coverage_gaps: list[str] = Field(default_factory=list)
    executions: list[ExecutedTest] = Field(default_factory=list)
    execution_attempts: list[ExecutionAttempt] = Field(default_factory=list)
    execution_gaps: list[str] = Field(default_factory=list)
    diagnoses: list[TestDiagnosis] = Field(default_factory=list)
    refinement_iterations: int = 0
    executed_tests: int = 0
    execution_success_rate: float | None = None
    requirement_coverage: float | None = None
    semantic_coverage: float | None = None
    mutation_score: float | None = None
    change: RepositoryChange | None = None


class VerificationRun(BaseModel):
    id: str
    project_id: str
    trigger: Literal["manual", "watch"] = "manual"
    mode: Literal["scaffold", "baseline_b0", "baseline_b2"] = "scaffold"
    status: Literal["queued", "running", "blocked", "completed", "failed"] = "blocked"
    stage: Literal[
        "understand",
        "inspect",
        "analyze",
        "plan",
        "generate",
        "execute",
        "improve",
        "re_measure",
        "report",
    ] = "understand"
    created_at: datetime
    updated_at: datetime | None = None
    input_sha256: str
    inputs: ProjectCreate | None = None
    events: list[RunEvent]
    report: VerificationReport


class RepositoryWatch(BaseModel):
    """Whether a project's GitHub repository is polled, and what the last check found."""

    project_id: str
    enabled: bool = False
    # Enabled and a watcher is running on this server; false while it is unavailable.
    active: bool = False
    interval_seconds: int
    last_checked_at: datetime | None = None
    last_commit: str | None = None
    last_run_id: str | None = None
    last_error: str | None = None


class WatchUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class Integration(BaseModel):
    key: str
    name: str
    status: Literal["ready", "not_connected"]
    description: str


class SystemInfo(BaseModel):
    version: str = "0.1.0"
    mode: Literal["scaffold", "baseline_b0", "baseline_b2"] = "scaffold"
    integrations: list[Integration]
