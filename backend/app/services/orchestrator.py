import hashlib
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from app.schemas import Project, RunEvent, VerificationReport, VerificationRun
from app.services.requirement_analyzer import RequirementAnalyzer


class Orchestrator(Protocol):
    """Replace this adapter when the real evidence-driven workflow is integrated."""

    def run(self, project: Project) -> VerificationRun: ...


class AnalysisOrchestrator:
    """Decomposes requirement sources without inspecting or executing repository code."""

    def __init__(self, analyzer: RequirementAnalyzer | None = None):
        self.analyzer = analyzer or RequirementAnalyzer()

    def run(self, project: Project) -> VerificationRun:
        now = datetime.now(UTC)
        digest = hashlib.sha256(project.model_dump_json().encode()).hexdigest()
        analysis = self.analyzer.analyze(project.requirements_text)
        return VerificationRun(
            id=str(uuid4()),
            project_id=project.id,
            created_at=now,
            input_sha256=digest,
            mode="analysis",
            events=[
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Project inputs and fingerprint recorded. Repository "
                        "reference saved; source code not read."
                    ),
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        f"Requirement source decomposed into {len(analysis.behaviors)} "
                        "traceable behavior candidates."
                    ),
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="measure",
                    message=(
                        "Run blocked before measurement: code inspection, test mapping, "
                        "and isolated execution are not connected."
                    ),
                    created_at=now,
                ),
            ],
            report=VerificationReport(
                summary=(
                    f"Identified {len(analysis.behaviors)} behavior candidates from the "
                    "requirement source. Source code has not been read and no tests have "
                    "been executed."
                ),
                behaviors=analysis.behaviors,
                evidence=analysis.evidence,
                unresolved_issues=[
                    "Connect code inspection, test mapping, and gap evaluation.",
                    "Connect isolated pytest execution, failure diagnosis, and mutation testing.",
                ],
            ),
        )
