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


class RunEvent(BaseModel):
    id: str
    stage: Literal["understand", "measure", "improve", "re_measure"]
    message: str
    created_at: datetime


class VerificationReport(BaseModel):
    summary: str
    behaviors: list[Behavior] = Field(default_factory=list)
    evidence: list[dict[str, str]] = Field(default_factory=list)
    unresolved_issues: list[str] = Field(default_factory=list)
    executed_tests: int = 0
    semantic_coverage: float | None = None
    mutation_score: float | None = None


class VerificationRun(BaseModel):
    id: str
    project_id: str
    mode: Literal["scaffold"] = "scaffold"
    status: Literal["blocked"] = "blocked"
    stage: Literal["understand"] = "understand"
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
    mode: Literal["scaffold"] = "scaffold"
    integrations: list[Integration]
