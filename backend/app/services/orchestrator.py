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
                        "Project inputs and fingerprint recorded. Repository "
                        "reference saved; source code not read."
                    ),
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Run blocked: requirement analysis, code inspection, "
                        "and isolated execution are not connected."
                    ),
                    created_at=now,
                ),
            ],
            report=VerificationReport(
                summary=(
                    "Setup report created. Requirements have not been analyzed, "
                    "source code has not been read, and no tests have been executed."
                ),
                unresolved_issues=[
                    "Connect requirement analysis and behavior decomposition.",
                    "Connect code inspection, test mapping, and gap evaluation.",
                    "Connect isolated pytest execution, failure diagnosis, and mutation testing.",
                ],
            ),
        )
