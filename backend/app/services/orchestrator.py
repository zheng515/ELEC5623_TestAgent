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
                    message="已记录项目输入与输入指纹；仓库引用仅作为文本保存。",
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message="任务已暂停：需求分析器、代码检查器和隔离执行器尚未接入。",
                    created_at=now,
                ),
            ],
            report=VerificationReport(
                summary="框架联调记录已生成。尚未分析需求、读取代码或执行测试。",
                unresolved_issues=[
                    "接入需求分析与行为拆解模块。",
                    "接入代码与测试检查、行为映射和缺口评估模块。",
                    "接入隔离 pytest 执行、失败诊断与变异测试模块。",
                ],
            ),
        )
