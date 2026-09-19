import hashlib

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas import Project


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "test.db", _env_file=None)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as client:
        yield client


def create_project(client):
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Shipping",
            "requirements_text": "Orders of at least 100 have free shipping.",
            "repository_ref": "/unread/example",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_project_run_report_flow_does_not_claim_verification(client):
    project = create_project(client)
    assert client.get("/api/v1/projects").json() == [project]
    response = client.post(f"/api/v1/projects/{project['id']}/runs")
    assert response.status_code == 201
    run = response.json()
    assert run["status"] == "blocked"
    assert run["mode"] == "scaffold"
    assert (
        run["input_sha256"]
        == hashlib.sha256(Project.model_validate(project).model_dump_json().encode()).hexdigest()
    )
    assert client.get(f"/api/v1/runs/{run['id']}").json() == run
    assert client.get(f"/api/v1/projects/{project['id']}/runs").json() == [run]
    report = client.get(f"/api/v1/runs/{run['id']}/report")
    assert report.json()["executed_tests"] == 0
    assert report.json()["behaviors"] == []
    assert report.json()["evidence"] == []
    assert report.json()["semantic_coverage"] is None
    assert report.json()["mutation_score"] is None
    assert report.json()["unresolved_issues"]
    assert "attachment" in report.headers["content-disposition"]


def test_data_survives_app_restart(settings):
    with TestClient(create_app(settings)) as first:
        project = create_project(first)
        run = first.post(f"/api/v1/projects/{project['id']}/runs").json()
    with TestClient(create_app(settings)) as second:
        assert second.get(f"/api/v1/projects/{project['id']}").json() == project
        assert second.get(f"/api/v1/runs/{run['id']}").json() == run


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "  ", "requirements_text": "rule"},
        {"name": "project", "requirements_text": " \n "},
        {"name": "x" * 101, "requirements_text": "rule"},
        {"name": "project", "requirements_text": "rule", "execute_shell": "something"},
    ],
)
def test_invalid_project_input(client, payload):
    assert client.post("/api/v1/projects", json=payload).status_code == 422
    assert client.get("/api/v1/projects").json() == []


@pytest.mark.parametrize(
    "path",
    [
        "/projects/missing",
        "/projects/missing/runs",
        "/runs/missing",
        "/runs/missing/report",
    ],
)
def test_missing_records(client, path):
    assert client.get("/api/v1" + path).status_code == 404


def test_cannot_create_run_for_unknown_project(client):
    assert client.post("/api/v1/projects/missing/runs").status_code == 404


def test_system_health_and_cors(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/api/v1/system").json()["mode"] == "scaffold"
    response = client.options(
        "/api/v1/projects",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_goal_is_persisted_and_recent_runs_are_newest_first(client):
    payload = {
        "name": "English UI project",
        "requirements_text": "Orders over the threshold receive free shipping.",
        "goal": "Check threshold boundaries.",
    }
    project = client.post("/api/v1/projects", json=payload).json()
    assert client.get(f"/api/v1/projects/{project['id']}").json()["goal"] == payload["goal"]
    first = client.post(f"/api/v1/projects/{project['id']}/runs").json()
    second = client.post(f"/api/v1/projects/{project['id']}/runs").json()
    assert [r["id"] for r in client.get("/api/v1/runs").json()] == [second["id"], first["id"]]
    assert [r["id"] for r in client.get("/api/v1/runs?limit=1").json()] == [second["id"]]
    assert client.get("/api/v1/runs?limit=0").status_code == 422
    assert client.get("/api/v1/runs?limit=101").status_code == 422


def test_system_generated_content_is_english(client):
    import re

    project = create_project(client)
    run = client.post(f"/api/v1/projects/{project['id']}/runs").json()
    content = str(run) + str(client.get("/api/v1/system").json())
    assert not re.search(r"[\u3400-\u9fff]", content)
    assert client.get("/api/v1/projects/missing").json()["detail"] == "Project not found"
    assert client.get("/api/v1/runs/missing").json()["detail"] == "Run not found"


def test_legacy_project_without_goal_remains_readable():
    project = Project.model_validate(
        {
            "id": "legacy",
            "name": "Old project",
            "requirements_text": "A rule.",
            "created_at": "2026-09-14T10:00:00Z",
        }
    )
    assert project.goal == "Identify verification gaps and improve requirement-based tests."
