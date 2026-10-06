"""Repository watching: real HTTP, SQLite and worker; GitHub and the agent are faked."""

from datetime import UTC, datetime

import pytest
from conftest import register, wait_for_run
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas import (
    CodeSnapshot,
    RepositorySnapshot,
    RepositorySource,
    VerificationReport,
    VerificationRun,
)
from app.services.github_source import GitHubError
from app.services.watcher import RepositoryWatcher

URL = "https://github.com/example/shipping/tree/main"
FIRST, SECOND = "a" * 40, "b" * 40


class RecordingOrchestrator:
    """Completes every run at the commit GitHub currently names, and records how it was asked."""

    mode = "baseline_b0"

    def __init__(self):
        self.calls: list[tuple[bool, str | None]] = []
        self.commit = FIRST

    def run(self, project, *, on_progress=None, incremental=False, baseline=None):
        self.calls.append((incremental, baseline.id if baseline else None))
        now = datetime.now(UTC)
        repository = RepositorySnapshot(
            root=URL,
            modules=[],
            sha256="0",
            artifact=CodeSnapshot(id="0" * 32, content_sha256="0", files=[], directories=[]),
            source=RepositorySource(
                repository="example/shipping", url=URL, ref="main", commit_sha=self.commit
            ),
        )
        return VerificationRun(
            id="ignored",
            project_id=project.id,
            mode=self.mode,
            status="completed",
            stage="report",
            created_at=now,
            input_sha256="0",
            events=[],
            report=VerificationReport(summary="Done.", repository=repository),
        )


class FakeGitHub:
    def __init__(self, commit=FIRST):
        self.commit = commit
        self.error: GitHubError | None = None
        self.references: list[str] = []

    def __call__(self, reference, settings):
        self.references.append(reference)
        if self.error:
            raise self.error
        return self.commit


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "watch.db", sandbox_enabled=False, _env_file=None)


@pytest.fixture
def app_parts(settings):
    orchestrator = RecordingOrchestrator()
    with TestClient(create_app(settings, orchestrator=orchestrator)) as client:
        register(client)
        github = FakeGitHub()
        # A separate, unstarted watcher makes checks deterministic. The app's own watcher
        # only wakes into the blocked network and records nothing.
        watcher = RepositoryWatcher(
            client.app.state.store, client.app.state.run_manager, settings, resolve=github
        )
        yield client, orchestrator, github, watcher


def create(client, reference=URL):
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Shipping",
            "requirements_text": "Orders of at least 100 dollars ship free.",
            "repository_ref": reference,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def watch(client, project_id, enabled=True):
    return client.post(f"/api/v1/projects/{project_id}/watch", json={"enabled": enabled})


def test_a_new_commit_queues_one_incremental_run_with_the_latest_baseline(app_parts):
    client, orchestrator, github, watcher = app_parts
    project = create(client)
    assert watch(client, project["id"]).json()["enabled"] is True

    # No run has completed yet, so the first check builds the baseline.
    [first] = watcher.check_all()
    assert first.trigger == "watch"
    assert wait_for_run(client, first.id)["status"] == "completed"
    assert orchestrator.calls == [(True, None)]

    # The same commit again queues nothing.
    assert watcher.check_all() == []

    github.commit = orchestrator.commit = SECOND
    [second] = watcher.check_all()
    wait_for_run(client, second.id)
    assert orchestrator.calls[-1] == (True, first.id)

    state = client.get(f"/api/v1/projects/{project['id']}/watch").json()
    assert state["last_commit"] == SECOND
    assert state["last_run_id"] == second.id
    assert state["last_error"] is None
    assert state["last_checked_at"] is not None


def test_enabling_starts_from_the_commit_the_latest_run_read(app_parts):
    client, orchestrator, github, watcher = app_parts
    project = create(client)
    manual = client.post(f"/api/v1/projects/{project['id']}/runs").json()
    wait_for_run(client, manual["id"])

    state = watch(client, project["id"]).json()

    assert state["last_commit"] == FIRST
    assert watcher.check_all() == []  # GitHub still names the commit already verified
    assert orchestrator.calls == [(False, None)]  # only the manual, full run


def test_failures_are_recorded_and_retried_at_the_next_check(app_parts):
    client, _, github, watcher = app_parts
    project = create(client)
    watch(client, project["id"])
    github.error = GitHubError("GitHub's API rate limit was reached.")

    assert watcher.check_all() == []
    state = client.get(f"/api/v1/projects/{project['id']}/watch").json()
    assert state["last_error"] == "GitHub's API rate limit was reached."
    assert state["last_commit"] is None

    github.error = None
    [run] = watcher.check_all()
    wait_for_run(client, run.id)
    assert client.get(f"/api/v1/projects/{project['id']}/watch").json()["last_error"] is None


def test_a_commit_waits_while_the_project_has_an_active_run(app_parts):
    client, _, _, watcher = app_parts
    project = create(client)
    watch(client, project["id"])
    store = client.app.state.store
    # Hold the project's single active-run slot.
    blocker = VerificationRun(
        id="active",
        project_id=project["id"],
        status="running",
        created_at=datetime.now(UTC),
        input_sha256="0",
        events=[],
        report=VerificationReport(summary="Running."),
    )
    store.reserve_run(blocker, "other-worker", 20)

    assert watcher.check_all() == []
    state = client.get(f"/api/v1/projects/{project['id']}/watch").json()
    assert "waits for the project's active run" in state["last_error"]
    assert state["last_commit"] is None  # not handled, so the next check retries it


def test_disabled_watches_are_not_checked(app_parts):
    client, _, github, watcher = app_parts
    project = create(client)
    watch(client, project["id"])
    assert watch(client, project["id"], enabled=False).json()["enabled"] is False

    assert watcher.check_all() == []
    assert github.references == []


@pytest.mark.parametrize(
    ("reference", "message"),
    [
        ("shipping", "Only projects with a GitHub repository URL"),
        ("https://github.com/example/shipping/commit/abcdef1", "commit URL never changes"),
        (f"https://github.com/example/shipping/tree/{FIRST}", "commit URL never changes"),
        ("https://gitlab.com/example/shipping", "Only GitHub"),
    ],
)
def test_only_moving_github_references_can_be_watched(app_parts, reference, message):
    client, _, _, _ = app_parts
    project = create(client, reference)

    response = watch(client, project["id"])

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_watching_is_unavailable_without_the_agent(settings):
    with TestClient(create_app(settings)) as client:  # scaffold mode: no model credentials
        register(client)
        project = create(client)

        response = watch(client, project["id"])
        integrations = {
            item["key"]: item for item in client.get("/api/v1/system").json()["integrations"]
        }

    assert response.status_code == 409
    assert integrations["watch"]["status"] == "not_connected"


def test_watch_state_is_private_and_reported_by_the_system(app_parts):
    client, _, _, _ = app_parts
    project = create(client)
    state = client.get(f"/api/v1/projects/{project['id']}/watch").json()
    integrations = {
        item["key"]: item for item in client.get("/api/v1/system").json()["integrations"]
    }

    assert state["enabled"] is False and state["active"] is False
    assert state["interval_seconds"] == 600
    assert integrations["watch"]["status"] == "ready"
    assert watch(client, project["id"]).json()["active"] is True

    client.post("/api/v1/auth/logout")
    register(client, email="other@example.com")
    assert client.get(f"/api/v1/projects/{project['id']}/watch").status_code == 404
    assert watch(client, project["id"]).status_code == 404


def test_a_branch_named_commit_can_still_be_watched(app_parts):
    client, _, _, _ = app_parts
    project = create(client, "https://github.com/example/shipping/tree/commit/fixes")

    assert watch(client, project["id"]).status_code == 200
