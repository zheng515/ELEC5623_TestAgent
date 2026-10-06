"""Exercise real HTTP, SQLite, and worker boundaries with a gated model."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from conftest import register, wait_for_run
from fastapi.testclient import TestClient
from test_agent import ANALYSIS, PLAN, PROJECT, SUITE, FakeLLM

from app.core.config import Settings
from app.main import create_app
from app.schemas import VerificationReport, VerificationRun
from app.services.orchestrator import DirectLLMOrchestrator, ScaffoldOrchestrator


class GatedLLM(FakeLLM):
    def __init__(self):
        super().__init__(ANALYSIS, PLAN, SUITE)
        self.entered = [Event() for _ in range(4)]
        self.release = [Event() for _ in range(4)]
        self.calls = 0

    def parse(self, **kwargs):
        index = self.calls
        self.calls += 1
        self.entered[index].set()
        if not self.release[index].wait(timeout=5):
            raise TimeoutError("Test did not release the model stage.")
        return super().parse(**kwargs)

    def unblock(self):
        for gate in self.release:
            gate.set()


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "jobs.db", llm_enabled=False, _env_file=None)


def project(client, name="Shipping"):
    return client.post(
        "/api/v1/projects",
        json={
            "name": name,
            "requirements_text": PROJECT.requirements_text,
        },
    ).json()


def test_submission_returns_before_model_and_live_checkpoints_are_persisted(settings):
    llm = GatedLLM()
    try:
        with TestClient(create_app(settings, DirectLLMOrchestrator(llm))) as client:
            register(client)
            saved = project(client)
            accepted = client.post(f"/api/v1/projects/{saved['id']}/runs")
            assert accepted.status_code == 202
            run_id = accepted.json()["id"]
            assert accepted.headers["location"] == f"/api/v1/runs/{run_id}"
            assert llm.entered[0].wait(5)
            running = client.get(accepted.headers["location"]).json()
            assert running["status"] == "running"
            assert running["stage"] == "analyze"
            assert client.get("/api/v1/health").status_code == 200
            llm.release[0].set()
            assert llm.entered[1].wait(5)
            planned = client.get(accepted.headers["location"]).json()
            assert planned["stage"] == "plan"
            assert planned["report"]["requirements"][0]["id"] == "R1"
            llm.release[1].set()
            assert llm.entered[2].wait(5)
            reviewing = client.get(accepted.headers["location"]).json()
            assert reviewing["stage"] == "plan"
            assert reviewing["report"]["test_plan"]["scenarios"][0]["oracle_grounding"] is None
            llm.release[2].set()
            assert llm.entered[3].wait(5)
            generating = client.get(accepted.headers["location"]).json()
            assert generating["report"]["test_plan"]["scenarios"][0]["id"] == "S1"
            assert generating["stage"] == "generate"
            assert (
                generating["report"]["test_plan"]["scenarios"][0]["oracle_grounding"]["status"]
                == "supported"
            )
            llm.release[3].set()
            finished = wait_for_run(client, run_id)
            assert finished["status"] == "completed"
            assert finished["id"] == accepted.json()["id"]
            assert finished["created_at"] == accepted.json()["created_at"]
            assert finished["report"]["generated_tests"][0]["scenario_ids"] == ["S1"]
    finally:
        llm.unblock()


def test_concurrent_duplicate_submissions_share_one_model_run(settings):
    llm = GatedLLM()
    try:
        with TestClient(create_app(settings, DirectLLMOrchestrator(llm))) as client:
            register(client)
            saved = project(client)
            path = f"/api/v1/projects/{saved['id']}/runs"
            first = client.post(path).json()
            assert llm.entered[0].wait(5)
            with ThreadPoolExecutor(max_workers=4) as pool:
                duplicates = list(pool.map(lambda _: client.post(path), range(4)))
            assert all(item.status_code == 202 for item in duplicates)
            assert {item.json()["id"] for item in duplicates} == {first["id"]}
            assert len(client.get(f"/api/v1/projects/{saved['id']}/runs").json()) == 1
            llm.unblock()
            wait_for_run(client, first["id"])
            assert llm.calls == 4
    finally:
        llm.unblock()


def test_full_queue_rejects_new_projects_but_reuses_an_active_run(settings):
    llm = GatedLLM()
    settings.max_active_runs = 1
    try:
        with TestClient(create_app(settings, DirectLLMOrchestrator(llm))) as client:
            register(client)
            one, two = project(client), project(client, "Second")
            first = client.post(f"/api/v1/projects/{one['id']}/runs").json()
            assert llm.entered[0].wait(5)
            assert client.post(f"/api/v1/projects/{one['id']}/runs").json()["id"] == first["id"]
            response = client.post(f"/api/v1/projects/{two['id']}/runs")
            assert response.status_code == 429
            assert client.get(f"/api/v1/projects/{two['id']}/runs").json() == []
            llm.unblock()
            wait_for_run(client, first["id"])
    finally:
        llm.unblock()


def test_restart_marks_unfinished_work_failed_and_retains_checkpoint(settings):
    with TestClient(create_app(settings)) as first:
        register(first)
        saved = project(first)
        run = VerificationRun(
            id="stale-run",
            project_id=saved["id"],
            status="running",
            stage="plan",
            mode="baseline_b0",
            created_at=PROJECT.created_at,
            input_sha256="digest",
            events=[],
            report=VerificationReport(summary="Planning", requirements=ANALYSIS.requirements),
        )
        first.app.state.store.create_run(run)
        # Simulate an abruptly terminated process by preventing orderly recovery in stop().
        first.app.state.run_manager.worker_id = "another-worker"
        cookies = first.cookies
    with TestClient(create_app(settings)) as restarted:
        restarted.cookies.update(cookies)
        failed = restarted.get("/api/v1/runs/stale-run").json()
        assert failed["status"] == "failed"
        assert failed["stage"] == "plan"
        assert failed["report"]["requirements"][0]["id"] == "R1"
        assert "restarted" in failed["report"]["summary"]
        assert failed["events"][-1]["stage"] == "interrupt"


def test_unexpected_worker_failure_retains_outputs_and_does_not_stop_next_job(settings):
    class BrokenOnce(ScaffoldOrchestrator):
        calls = 0

        def run(self, project, *, on_progress=None):
            self.calls += 1
            if self.calls > 1:
                return super().run(project)
            snapshot = super().run(project)
            snapshot.status = "running"
            snapshot.stage = "plan"
            snapshot.report.requirements = ANALYSIS.requirements
            on_progress(snapshot)
            raise RuntimeError("Internal diagnostic detail")

    with TestClient(create_app(settings, BrokenOnce())) as client:
        register(client)
        saved = project(client)
        path = f"/api/v1/projects/{saved['id']}/runs"
        failed = wait_for_run(client, client.post(path).json()["id"])
        assert failed["status"] == "failed"
        assert failed["report"]["requirements"][0]["id"] == "R1"
        assert "Internal diagnostic detail" not in str(failed)
        retry = wait_for_run(client, client.post(path).json()["id"])
        assert retry["status"] == "blocked"
        assert retry["id"] != failed["id"]


def test_shutdown_preserves_checkpoint_and_late_model_cannot_overwrite_it(settings):
    llm = GatedLLM()
    app = create_app(settings, DirectLLMOrchestrator(llm))
    try:
        with TestClient(app) as client:
            register(client)
            saved = project(client)
            run_id = client.post(f"/api/v1/projects/{saved['id']}/runs").json()["id"]
            assert llm.entered[0].wait(5)
            llm.release[0].set()
            assert llm.entered[1].wait(5)
            cookies = client.cookies
        with TestClient(create_app(settings)) as restarted:
            restarted.cookies.update(cookies)
            interrupted = restarted.get(f"/api/v1/runs/{run_id}").json()
            assert interrupted["status"] == "failed"
            assert interrupted["report"]["requirements"][0]["id"] == "R1"
            llm.unblock()
            app.state.run_manager._thread.join(timeout=5)
            assert not app.state.run_manager._thread.is_alive()
            assert restarted.get(f"/api/v1/runs/{run_id}").json() == interrupted
            assert llm.calls == 2
    finally:
        llm.unblock()
