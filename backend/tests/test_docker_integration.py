"""Opt-in real Docker workflow checks; model output remains deterministic."""

import os

import pytest
from conftest import register, wait_for_run
from fastapi.testclient import TestClient
from test_agent import ANALYSIS, INVALID_SUITE, PLAN, PROJECT, SUITE, FakeLLM

from app.core.config import Settings
from app.main import create_app
from app.services.orchestrator import DirectLLMOrchestrator
from app.services.runner import DockerTestRunner

pytestmark = pytest.mark.skipif(
    os.environ.get("REQTEST_RUN_DOCKER_TESTS") != "1",
    reason="Set REQTEST_RUN_DOCKER_TESTS=1 to run real container integration checks.",
)


@pytest.mark.parametrize("case", ["passing", "defect", "repair"])
def test_real_container_workflow_preserves_code_and_environment_provenance(tmp_path, case):
    source = tmp_path / "project"
    source.mkdir()
    (source / "shipping.py").write_text(
        f"def fee(amount_cents: int) -> int:\n    return {999 if case == 'defect' else 0}\n"
    )
    settings = Settings(
        database_path=tmp_path / "app.db",
        repository_root=tmp_path,
        repository_snapshot_root=tmp_path / "snapshots",
        _env_file=None,
    )
    responses = (
        [ANALYSIS, PLAN, INVALID_SUITE, SUITE] if case == "repair" else [ANALYSIS, PLAN, SUITE]
    )
    agent = DirectLLMOrchestrator(
        FakeLLM(*responses), runner=DockerTestRunner(settings), settings=settings
    )
    with TestClient(create_app(settings, orchestrator=agent)) as client:
        register(client)
        response = client.post(
            "/api/v1/projects",
            json={
                "name": "Docker verification probe",
                "repository_ref": "project",
                "requirements_text": PROJECT.requirements_text,
                "goal": PROJECT.goal,
            },
        )
        assert response.status_code == 201
        project_id = response.json()["id"]
        queued = client.post(f"/api/v1/projects/{project_id}/runs")
        assert queued.status_code == 202
        run = wait_for_run(client, queued.json()["id"], timeout=45)
        assert run["status"] == "completed"
        report = run["report"]
        expected = "failed" if case == "defect" else "passed"
        assert [item["outcome"] for item in report["executions"]] == [expected]
        assert report["behaviors"][0]["verification_status"] == (
            "Unverified" if case == "defect" else "Partially Verified"
        )
        attempts = report["execution_attempts"]
        assert len(attempts) == (2 if case == "repair" else 1)
        assert len({item["result"]["environment"]["image_id"] for item in attempts}) == 1
        assert all(
            item["result"]["repository_content_sha256"]
            == report["repository"]["artifact"]["content_sha256"]
            for item in attempts
        )
        environment = attempts[-1]["result"]["environment"]
        assert environment["image_id"].startswith("sha256:")
        assert any(item["name"] == "pytest" for item in environment["packages"])
        html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
        assert environment["image_id"] in html
        assert environment["fingerprint"] in html
        assert "Pinned execution environment" in html
