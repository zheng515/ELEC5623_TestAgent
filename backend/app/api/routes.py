from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response

from app.schemas import (
    Integration,
    Project,
    ProjectCreate,
    SystemInfo,
    VerificationReport,
    VerificationRun,
)

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["system"])
def health():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/system", response_model=SystemInfo, tags=["system"])
def system_info():
    return SystemInfo(
        integrations=[
            Integration(
                key="storage",
                name="Project and Run Storage",
                status="ready",
                description="SQLite persists projects, requirements, runs, and reports.",
            ),
            Integration(
                key="api",
                name="Frontend-Backend API",
                status="ready",
                description="Versioned REST API with OpenAPI documentation.",
            ),
            Integration(
                key="analysis",
                name="Requirement Analysis and Behavior Mapping",
                status="not_connected",
                description=(
                    "Waiting for LLM analysis, code inspection, and verification "
                    "status assessment."
                ),
            ),
            Integration(
                key="execution",
                name="Isolated Test Execution",
                status="not_connected",
                description="Waiting for sandboxing, pytest, and execution evidence collection.",
            ),
            Integration(
                key="diagnosis",
                name="Failure Diagnosis and Mutation Analysis",
                status="not_connected",
                description="Waiting for evidence diagnosis, test improvement, and re-evaluation.",
            ),
        ]
    )


@router.get("/projects", response_model=list[Project], tags=["projects"])
def list_projects(request: Request):
    return request.app.state.store.list_projects()


@router.post("/projects", response_model=Project, status_code=201, tags=["projects"])
def create_project(payload: ProjectCreate, request: Request):
    project = Project(**payload.model_dump(), id=str(uuid4()), created_at=datetime.now(UTC))
    request.app.state.store.create_project(project)
    return project


@router.get("/projects/{project_id}", response_model=Project, tags=["projects"])
def get_project(project_id: str, request: Request):
    project = request.app.state.store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.get("/projects/{project_id}/runs", response_model=list[VerificationRun], tags=["runs"])
def list_runs(project_id: str, request: Request):
    get_project(project_id, request)
    return request.app.state.store.list_runs(project_id)


@router.post(
    "/projects/{project_id}/runs", response_model=VerificationRun, status_code=201, tags=["runs"]
)
def create_run(project_id: str, request: Request):
    project = get_project(project_id, request)
    run = request.app.state.orchestrator.run(project)
    request.app.state.store.create_run(run)
    return run


@router.get("/runs/{run_id}", response_model=VerificationRun, tags=["runs"])
def get_run(run_id: str, request: Request):
    run = request.app.state.store.get_run(run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}/report", response_model=VerificationReport, tags=["runs"])
def get_report(run_id: str, request: Request, response: Response):
    run = get_run(run_id, request)
    response.headers["Content-Disposition"] = f'attachment; filename="report-{run.id}.json"'
    return run.report
