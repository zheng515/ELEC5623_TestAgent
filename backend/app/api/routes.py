from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.schemas import (
    Integration,
    Project,
    ProjectCreate,
    SystemInfo,
    VerificationReport,
    VerificationRun,
)
from app.services.report_renderer import render_html_report

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["system"])
def health():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/system", response_model=SystemInfo, tags=["system"])
def system_info(request: Request):
    mode = getattr(request.app.state, "mode", "scaffold")
    agent_ready = mode in {"baseline_b0", "baseline_b2"}
    execution_ready = getattr(request.app.state, "execution_ready", False)
    inspection_ready = getattr(request.app.state, "inspection_ready", False)
    diagnosis_ready = getattr(request.app.state, "diagnosis_ready", False)
    return SystemInfo(
        mode=mode,
        integrations=[
            Integration(
                key="storage",
                name="Project and run storage",
                status="ready",
                description="Projects, requirements, runs, and reports are persisted in SQLite.",
            ),
            Integration(
                key="api",
                name="Application API",
                status="ready",
                description="Versioned REST endpoints and OpenAPI documentation.",
            ),
            Integration(
                key="analysis",
                name="Requirement analysis and ambiguity detection",
                status="ready" if agent_ready else "not_connected",
                description=(
                    "Requirements are split into testable items and ambiguities are flagged."
                    if agent_ready
                    else "No model credentials resolved, so requirements are stored but "
                    "not analysed."
                ),
            ),
            Integration(
                key="generation",
                name="Test generation and traceability",
                status="ready" if agent_ready else "not_connected",
                description=(
                    "Pytest tests are generated from requirements and linked back to them. "
                    + (
                        "Sandbox feedback enables one bounded B2 refinement attempt."
                        if mode == "baseline_b2"
                        else "B0 generation has no execution feedback or refinement."
                    )
                    if agent_ready
                    else "Test generation requires model credentials."
                ),
            ),
            Integration(
                key="inspection",
                name="Repository inspection",
                status="ready" if inspection_ready else "not_connected",
                description=(
                    "The public interface of the project under test is read and given "
                    "to the generator; file contents are not read."
                    if inspection_ready
                    else "Set REQTEST_REPOSITORY_ROOT to let runs read the project under "
                    "test. Until then, generated tests must guess what to import."
                ),
            ),
            Integration(
                key="retrieval",
                name="RAG evidence retrieval",
                status="not_connected",
                description="Retrieval of testing knowledge and project evidence is not connected.",
            ),
            Integration(
                key="execution",
                name="Isolated test execution",
                status="ready" if execution_ready else "not_connected",
                description=(
                    "Generated tests run in a Docker sandbox with no network and a "
                    "read-only filesystem; each outcome is recorded as evidence."
                    if execution_ready
                    else "Docker or the sandbox image is unavailable, so generated tests "
                    "are not executed. Run: bash scripts/build-sandbox.sh"
                ),
            ),
            Integration(
                key="diagnosis",
                name="Failure diagnosis and bounded refinement",
                status="ready" if diagnosis_ready else "not_connected",
                description=(
                    "Execution errors are diagnosed, invalid tests are refined once, and the "
                    "refined tests are re-executed. Assertion failures remain suspected defects."
                    if diagnosis_ready
                    else "Diagnosis and refinement require both model access and the sandbox."
                ),
            ),
        ],
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


@router.get("/runs", response_model=list[VerificationRun], tags=["runs"])
def recent_runs(request: Request, limit: int = Query(default=20, ge=1, le=100)):
    return request.app.state.store.recent_runs(limit)


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


@router.get("/runs/{run_id}/report.html", response_class=Response, tags=["runs"])
def get_html_report(run_id: str, request: Request):
    run = get_run(run_id, request)
    project = get_project(run.project_id, request)
    return Response(
        render_html_report(project, run),
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="reqtest-report-{run.id}.html"'
        },
    )
