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
    RepositoryWatch,
    RequirementDocument,
    SystemInfo,
    VerificationReport,
    VerificationRun,
    WatchUpdate,
)
from app.services.document_parser import extract_document
from app.services.document_tools import DocumentOptions, document_capabilities
from app.services.github_source import (
    CREDENTIALS,
    GitHubError,
    contains_credentials,
    is_remote,
    names_fixed_commit,
)
from app.services.jobs import JobInterrupted
from app.services.outcome_mapping import OUTCOME_MAPPING_VERSION
from app.services.report_renderer import render_html_report
from app.services.test_validator import VALIDATION_VERSION

router = APIRouter(prefix="/api/v1")


@router.get("/health", tags=["system"])
def health():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/system", response_model=SystemInfo, tags=["system"])
def system_info(request: Request):
    orchestrator = request.app.state.orchestrator
    mode = getattr(orchestrator, "mode", "scaffold")
    agent_ready = mode in {"baseline_b0", "baseline_b2"}
    execution_ready = getattr(orchestrator, "executes_tests", False)
    inspection_ready = getattr(orchestrator, "inspects_repositories", False)
    diagnosis_ready = mode == "baseline_b2"
    watch_ready = getattr(request.app.state, "watcher", None) is not None
    return SystemInfo(
        mode=mode,
        validation_version=VALIDATION_VERSION,
        outcome_mapping_version=OUTCOME_MAPPING_VERSION,
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
                key="watch",
                name="Repository watching",
                status="ready" if watch_ready else "not_connected",
                description=(
                    "Watched GitHub projects are checked for new commits every "
                    f"{request.app.state.settings.watch_interval_seconds} seconds. A new "
                    "commit adds tests for new or changed functions and re-executes the rest."
                    if watch_ready
                    else "Watching needs model credentials, GitHub downloads and "
                    "REQTEST_WATCH_ENABLED=true."
                ),
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


@router.get("/documents/capabilities", tags=["documents"])
def document_support(request: Request, user: CurrentUser):
    return {
        **document_capabilities(DocumentOptions.from_settings(request.app.state.settings)),
        "import_timeout_seconds": request.app.state.settings.document_import_timeout_seconds,
    }


@router.post("/documents/import", response_model=RequirementDocument, tags=["documents"])
def import_document(payload: DocumentImport, request: Request, user: CurrentUser):
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
        document = extract_document(payload.filename, content, request.app.state.settings)
    except (ValueError, binascii.Error) as error:
        raise HTTPException(422, str(error)) from error
    request.app.state.store.create_document(document, user.id)
    return document


@router.post("/projects", response_model=Project, status_code=201, tags=["projects"])
def create_project(payload: ProjectCreate, request: Request, user: CurrentUser):
    if contains_credentials(payload.repository_ref):
        # A plain message: a validation error would echo the secret back in its input.
        raise HTTPException(422, CREDENTIALS)
    document = _linked_document(
        request, user, payload.requirement_document_id, payload.requirements_text
    )
    project = Project(
        **payload.model_dump(),
        requirement_document=document,
        id=str(uuid4()),
        created_at=datetime.now(UTC),
    )
    request.app.state.store.create_project(project, user.id)
    return project


def _linked_document(request, user, document_id, requirements_text):
    if not document_id:
        return None
    document = request.app.state.store.get_document(document_id, user.id)
    if document is None:
        raise HTTPException(404, "Imported document not found.")
    if requirements_text != document.text:
        raise HTTPException(422, "Requirement text changed. Reimport or remove its source link.")
    return document


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
        changes["requirement_document"] = _linked_document(
            request, user, changes["requirement_document_id"],
            changes.get("requirements_text", project.requirements_text),
        )
    elif changes.get("requirements_text", project.requirements_text) != project.requirements_text:
        changes["requirement_document_id"] = None
        changes["requirement_document"] = None
    updated = Project.model_validate({**project.model_dump(), **changes})
    request.app.state.store.update_project(updated, user.id)
    if _unwatchable(updated.repository_ref):
        # Its watch could never succeed again, and the panel for it is no longer shown.
        request.app.state.store.set_watch(project_id, enabled=False)
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


@router.get("/projects/{project_id}/watch", response_model=RepositoryWatch, tags=["projects"])
def get_watch(project_id: str, request: Request, user: CurrentUser):
    get_project(project_id, request, user)
    return _watch(request, project_id)


@router.post("/projects/{project_id}/watch", response_model=RepositoryWatch, tags=["projects"])
def update_watch(project_id: str, payload: WatchUpdate, request: Request, user: CurrentUser):
    """Start or stop polling the project's GitHub repository for new commits."""
    project = get_project(project_id, request, user)
    store = request.app.state.store
    if not payload.enabled:
        store.set_watch(project_id, enabled=False)
        return _watch(request, project_id)
    watcher = getattr(request.app.state, "watcher", None)
    if watcher is None:
        raise HTTPException(
            409,
            "Repository watching is unavailable: it needs model credentials, GitHub downloads "
            "and REQTEST_WATCH_ENABLED=true on the server.",
        )
    problem = _unwatchable(project.repository_ref)
    if problem:
        raise HTTPException(422, problem)
    # Start from the code the latest completed run read, so only later commits trigger.
    latest = store.latest_completed_run(project_id)
    repository = latest.report.repository if latest else None
    commit = repository.source.commit_sha if repository and repository.source else None
    store.set_watch(project_id, enabled=True, last_commit=commit)
    watcher.wake()
    return _watch(request, project_id)


def _unwatchable(reference: str) -> str | None:
    """Why a repository reference cannot be watched, or None when it can."""
    if not is_remote(reference):
        return "Only projects with a GitHub repository URL can be watched."
    try:
        fixed = names_fixed_commit(reference)
    except GitHubError as error:
        return str(error)
    if fixed:
        return "A commit URL never changes. Watch a branch URL such as .../tree/main instead."
    return None


def _watch(request: Request, project_id: str) -> RepositoryWatch:
    row = request.app.state.store.get_watch(project_id) or {}
    running = getattr(request.app.state, "watcher", None) is not None
    return RepositoryWatch(
        project_id=project_id,
        enabled=bool(row.get("enabled")),
        active=bool(row.get("enabled")) and running,
        interval_seconds=request.app.state.settings.watch_interval_seconds,
        last_checked_at=row.get("last_checked_at"),
        last_commit=row.get("last_commit"),
        last_run_id=row.get("last_run_id"),
        last_error=row.get("last_error"),
    )


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
    return Response(
        render_html_report(project, run),
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="reqtest-report-{run.id}.html"'},
    )
