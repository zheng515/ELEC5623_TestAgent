from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VerificationStatus(StrEnum):
    VERIFIED = "Verified"
    PARTIAL = "Partially Verified"
    UNVERIFIED = "Unverified"
    UNCERTAIN = "Uncertain"


class ProjectCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    repository_ref: str = Field(default="", max_length=500)
    requirements_text: str = Field(min_length=1, max_length=50000)
    goal: str = Field(
        default="Identify verification gaps and improve requirement-based tests.",
        min_length=1,
        max_length=2000,
    )


class Project(ProjectCreate):
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


class ModuleInterface(BaseModel):
    """The importable surface of one source module, as read from its AST (FR4)."""

    module: str
    path: str
    docstring: str
    constants: list[str] = Field(default_factory=list)
    functions: list[str] = Field(default_factory=list)
    classes: list[str] = Field(default_factory=list)


class RepositorySnapshot(BaseModel):
    """What was read from the project under test, and what was deliberately not."""

    root: str
    modules: list[ModuleInterface]
    skipped: list[str] = Field(default_factory=list)
    truncated: bool = False
    sha256: str


class GeneratedTest(BaseModel):
    """A generated pytest test and the requirements it claims to cover (FR7, FR8)."""

    id: str
    requirement_ids: list[str]
    name: str
    module: str
    code: str
    rationale: str


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


class ExecutionResult(BaseModel):
    """Everything one sandbox invocation produced."""

    executions: list[ExecutedTest]
    exit_code: int
    timed_out: bool
    stderr_excerpt: str


class RunEvent(BaseModel):
    id: str
    stage: Literal[
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


class VerificationReport(BaseModel):
    summary: str
    repository: RepositorySnapshot | None = None
    requirements: list[RequirementItem] = Field(default_factory=list)
    generated_tests: list[GeneratedTest] = Field(default_factory=list)
    behaviors: list[Behavior] = Field(default_factory=list)
    evidence: list[dict[str, str]] = Field(default_factory=list)
    unresolved_issues: list[str] = Field(default_factory=list)
    coverage_gaps: list[str] = Field(default_factory=list)
    executions: list[ExecutedTest] = Field(default_factory=list)
    executed_tests: int = 0
    execution_success_rate: float | None = None
    requirement_coverage: float | None = None
    semantic_coverage: float | None = None
    mutation_score: float | None = None


class VerificationRun(BaseModel):
    id: str
    project_id: str
    mode: Literal["scaffold", "baseline_b0"] = "scaffold"
    status: Literal["blocked", "completed", "failed"] = "blocked"
    stage: Literal["understand", "inspect", "analyze", "generate", "execute", "report"] = (
        "understand"
    )
    created_at: datetime
    input_sha256: str
    events: list[RunEvent]
    report: VerificationReport


class Integration(BaseModel):
    key: str
    name: str
    status: Literal["ready", "not_connected"]
    description: str


class SystemInfo(BaseModel):
    version: str = "0.1.0"
    mode: Literal["scaffold", "baseline_b0"] = "scaffold"
    integrations: list[Integration]
