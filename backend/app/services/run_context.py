"""Create a verification run's identity and input snapshot once."""

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from app.schemas import Project, ProjectCreate, VerificationReport, VerificationRun


def new_run(
    project: Project,
    *,
    mode: Literal["scaffold", "baseline_b0", "baseline_b2"] = "scaffold",
    trigger: Literal["manual", "watch"] = "manual",
) -> VerificationRun:
    return VerificationRun(
        id=str(uuid4()),
        project_id=project.id,
        mode=mode,
        trigger=trigger,
        created_at=datetime.now(UTC),
        input_sha256=hashlib.sha256(project.model_dump_json().encode()).hexdigest(),
        inputs=project.model_dump(include=set(ProjectCreate.model_fields)),
        events=[],
        report=VerificationReport(
            summary="Agent run started.", requirement_document=project.requirement_document
        ),
    )
