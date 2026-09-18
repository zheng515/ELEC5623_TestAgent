import hashlib
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from app.schemas import Project, RunEvent, VerificationReport, VerificationRun


class Orchestrator(Protocol):
    """Replace this adapter when the real evidence-driven workflow is integrated."""

    def run(self, project: Project) -> VerificationRun: ...


class ScaffoldOrchestrator:
    """Records inputs honestly. Does not interpret requirements or execute repository code."""

    def run(self, project: Project) -> VerificationRun:
        now = datetime.now(UTC)
        digest = hashlib.sha256(project.model_dump_json().encode()).hexdigest()
        return VerificationRun(
            id=str(uuid4()),
            project_id=project.id,
            created_at=now,
            input_sha256=digest,
            events=[
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Project input and input fingerprint were recorded; the repository "
                        "reference is stored as text only."
                    ),
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Run paused: the requirement analyzer, code inspector, and isolated "
                        "executor are not connected yet."
                    ),
                    created_at=now,
                ),
            ],
            report=VerificationReport(
                summary=(
                    "A scaffold integration record has been generated. Requirements have not "
                    "been analyzed, code has not been read, and tests have not been executed."
                ),
                unresolved_issues=[
                    "Connect the requirement analysis and behavior breakdown module.",
                    "Connect code and test inspection, behavior mapping, and gap assessment.",
                    "Connect isolated pytest execution, failure diagnosis, and mutation testing.",
                ],
            ),
        )
