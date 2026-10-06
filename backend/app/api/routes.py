import base64
import binascii
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.auth import CurrentUser
from app.core.config import Settings
from app.core.database import RunQueueFull
from app.schemas import (
    DocumentImport,
    Integration,
    Project,
    ProjectCreate,
    ProjectUpdate,
    RequirementDocument,
    SystemInfo,
    VerificationReport,
    VerificationRun,
)
from app.services.document_parser import extract_document
from app.services.github_source import CREDENTIALS, contains_credentials
from app.services.jobs import JobInterrupted
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
                key="planning",
                name="Structured test planning",
                status="ready" if agent_ready else "not_connected",
                description=(
                    "Requirements and available interfaces inform traceable nominal, "
                    "boundary, and negative test scenarios."
                    if agent_ready
                    else "Test planning requires model credentials."
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
                description=_inspection_description(request.app.state.settings, inspection_ready),
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


def _inspection_description(settings: Settings, ready: bool) -> str:
    if not ready:
        return (
            "Enable GitHub downloads or set REQTEST_REPOSITORY_ROOT to let runs read the "
            "project under test. Until then, generated tests must guess what to import."
        )
    if settings.github_enabled and settings.repository_root is not None:
        sources = (
            "GitHub repository URLs are downloaded at a pinned commit, and local paths "
            "inside REQTEST_REPOSITORY_ROOT are read."
        )
    elif settings.github_enabled:
        sources = (
            "GitHub repository URLs are downloaded at a pinned commit. Set "
            "REQTEST_REPOSITORY_ROOT to also read local paths."
        )
    else:
        sources = "Local paths inside REQTEST_REPOSITORY_ROOT are read; GitHub downloads are off."
    return (
        f"{sources} The public interface of the project under test is given to the "
        "generator; file contents are not sent to the model."
    )


@router.get("/projects", response_model=list[Project], tags=["projects"])
def list_projects(request: Request, user: CurrentUser):
    return request.app.state.store.list_projects(user.id)


@router.post("/documents/import", response_model=RequirementDocument, tags=["documents"])
def import_document(payload: DocumentImport, request: Request, user: CurrentUser):
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
        document = extract_document(payload.filename, content)
    except (ValueError, binascii.Error) as error:
        raise HTTPException(422, str(error)) from error
    request.app.state.store.create_document(document, user.id)
    return document


@router.post("/projects", response_model=Project, status_code=201, tags=["projects"])
def create_project(payload: ProjectCreate, request: Request, user: CurrentUser):
    if contains_credentials(payload.repository_ref):
        # A plain message: a validation error would echo the secret back in its input.
        raise HTTPException(422, CREDENTIALS)
    document = None
    if payload.requirement_document_id:
        document = request.app.state.store.get_document(payload.requirement_document_id, user.id)
        if document is None:
            raise HTTPException(404, "Imported document not found.")
        if payload.requirements_text != document.text:
            raise HTTPException(
                422, "Requirement text changed. Reimport the file or remove its source link."
            )
    project = Project(
        **payload.model_dump(),
        requirement_document=document,
        id=str(uuid4()),
        created_at=datetime.now(UTC),
    )
    request.app.state.store.create_project(project, user.id)
    return project


@router.get("/projects/{project_id}", response_model=Project, tags=["projects"])
def get_project(project_id: str, request: Request, user: CurrentUser):
    project = request.app.state.store.get_project(project_id, user.id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.patch("/projects/{project_id}", response_model=Project, tags=["projects"])
def update_project(project_id: str, payload: ProjectUpdate, request: Request, user: CurrentUser):
    project = get_project(project_id, request, user)
    changes = payload.model_dump(exclude_unset=True)
    repository_ref = changes.get("repository_ref", project.repository_ref)
    if contains_credentials(repository_ref):
        raise HTTPException(422, CREDENTIALS)
    if request.app.state.store.has_active_run(project_id):
        raise HTTPException(409, "Wait for the active run to finish before editing this project.")
    if "requirement_document_id" in changes:
        document = None
        if changes["requirement_document_id"]:
            document = request.app.state.store.get_document(
                changes["requirement_document_id"], user.id
            )
            if document is None:
                raise HTTPException(404, "Imported document not found.")
            if changes.get("requirements_text", project.requirements_text) != document.text:
                raise HTTPException(
                    422, "Requirement text changed. Reimport or remove its source link."
                )
        changes["requirement_document"] = document
    elif changes.get("requirements_text", project.requirements_text) != project.requirements_text:
        changes["requirement_document_id"] = None
        changes["requirement_document"] = None
    updated = Project.model_validate({**project.model_dump(), **changes})
    request.app.state.store.update_project(updated, user.id)
    return updated


@router.get("/projects/{project_id}/runs", response_model=list[VerificationRun], tags=["runs"])
def list_runs(project_id: str, request: Request, user: CurrentUser):
    get_project(project_id, request, user)
    return request.app.state.store.list_runs(project_id)


@router.post(
    "/projects/{project_id}/runs", response_model=VerificationRun, status_code=202, tags=["runs"]
)
def create_run(project_id: str, request: Request, response: Response, user: CurrentUser):
    project = get_project(project_id, request, user)
    try:
        run = request.app.state.run_manager.submit(project)
    except RunQueueFull as error:
        raise HTTPException(429, str(error), headers={"Retry-After": "5"}) from error
    except JobInterrupted as error:
        raise HTTPException(503, str(error)) from error
    response.headers["Location"] = f"/api/v1/runs/{run.id}"
    return run


@router.get("/runs", response_model=list[VerificationRun], tags=["runs"])
def recent_runs(request: Request, user: CurrentUser, limit: int = Query(default=20, ge=1, le=100)):
    return request.app.state.store.recent_runs(user.id, limit)


@router.get("/runs/{run_id}", response_model=VerificationRun, tags=["runs"])
def get_run(run_id: str, request: Request, user: CurrentUser):
    run = request.app.state.store.get_run(run_id, user.id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}/report", response_model=VerificationReport, tags=["runs"])
def get_report(run_id: str, request: Request, response: Response, user: CurrentUser):
    run = get_run(run_id, request, user)
    response.headers["Content-Disposition"] = f'attachment; filename="report-{run.id}.json"'
    return run.report


@router.get("/runs/{run_id}/report.html", response_class=Response, tags=["runs"])
def get_html_report(run_id: str, request: Request, user: CurrentUser):
    run = get_run(run_id, request, user)
    project = get_project(run.project_id, request, user)
    if run.inputs is not None:
        project = Project(**run.inputs.model_dump(), id=project.id, created_at=project.created_at)
    return Response(
        render_html_report(project, run),
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="reqtest-report-{run.id}.html"'},
    )
