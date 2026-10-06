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


@pytest.mark.parametrize("case", ["passing", "defect", "repair", "setup_blocked", "unplanned"])
def test_real_container_workflow_preserves_code_and_environment_provenance(tmp_path, case):
    source = tmp_path / "project"
    source.mkdir()
    (source / "shipping.py").write_text(
        f"def fee(amount_cents: int) -> int:\n    return {999 if case == 'defect' else 0}\n"
    )
    if case == "setup_blocked":
        (source / "requirements.txt").write_text("reqtest-missing-dependency-999==1.0\n")
    settings = Settings(
        database_path=tmp_path / "app.db",
        repository_root=tmp_path,
        repository_snapshot_root=tmp_path / "snapshots",
        _env_file=None,
    )
    responses = (
        [ANALYSIS, PLAN, INVALID_SUITE, SUITE] if case == "repair" else [ANALYSIS, PLAN, SUITE]
    )
    if case == "unplanned":
        responses[-1] = SUITE.model_copy(
            update={
                "tests": [
                    SUITE.tests[0].model_copy(
                        update={"code": SUITE.tests[0].code + "    assert fee(0) == 999\n"}
                    )
                ]
            }
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
        if case == "setup_blocked":
            assert run["status"] == "blocked"
            assert run["report"]["requirements"]
            assert run["report"]["source_audit"]
            assert run["report"]["project_readiness"]["status"] == "blocked"
            assert run["report"]["test_plan"] is None
            assert run["report"]["generated_tests"] == []
            assert run["report"]["execution_attempts"] == []
            html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
            assert "reqtest-missing-dependency-999" in html
            assert "Project setup checks" in html
            return
        assert run["status"] == "completed"
        report = run["report"]
        if case == "unplanned":
            assert report["project_readiness"]["status"] == "ready"
            assert report["validation_version"] == 2
            assert report["generated_tests"][0]["validation_status"] == "needs_review"
            assert report["executions"] == []
            assert report["execution_attempts"] == []
            assert report["requirement_coverage"] == 0
            assert report["behaviors"][0]["verification_status"] == "Unverified"
            assert not any(
                item["classification"] == "suspected_defect" for item in report["diagnoses"]
            )
            html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
            assert "no matching linked scenario contract" in html
            assert "No tests executed." in html
            return
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


@pytest.mark.parametrize(
    "case",
    [
        "src",
        "missing",
        "version",
        "python",
        "marker",
        "include",
        "collision",
        "conditional",
        "no_import_execution",
        "outside_include",
        "runtime_shadow",
        "build_metadata_with_requirements",
    ],
)
def test_real_project_readiness_checks_run_before_generation(tmp_path, case):
    from app.services.inspector import inspect_repository
    from app.services.project_readiness import check_project_readiness

    source = tmp_path / "project"
    code_root = source / "src" if case in {"src", "collision"} else source
    code_root.mkdir(parents=True)
    (code_root / "shipping.py").write_text("def fee(amount_cents: int) -> int:\n    return 0\n")
    expected = "ready"
    if case == "missing":
        (source / "requirements.txt").write_text("reqtest-missing-dependency-999==1.0\n")
        expected = "blocked"
    elif case == "version":
        (source / "requirements.txt").write_text("pytest>=99\n")
        expected = "blocked"
    elif case == "python":
        (source / "pyproject.toml").write_text(
            '[project]\nname="shipping"\nrequires-python=">=99"\n'
        )
        expected = "blocked"
    elif case == "marker":
        (source / "requirements.txt").write_text(
            'reqtest-missing-dependency-999; python_version < "2"\n'
        )
    elif case == "include":
        (source / "requirements.txt").write_text("-r requirements/base.txt\n")
        (source / "requirements").mkdir()
        (source / "requirements/base.txt").write_text("pytest==9.1.1\n")
    elif case == "build_metadata_with_requirements":
        (source / "pyproject.toml").write_text(
            '[build-system]\nrequires=["setuptools"]\nbuild-backend="setuptools.build_meta"\n'
        )
        (source / "requirements.txt").write_text("pytest==9.1.1\n")
    elif case == "collision":
        (source / "shipping.py").write_text("def fee(amount_cents: int) -> int:\n    return 999\n")
        expected = "blocked"
    elif case == "conditional":
        (source / "shipping.py").write_text(
            "try:\n    import reqtest_missing_optional\nexcept ImportError:\n    pass\n"
            "def fee(amount_cents: int) -> int:\n    return 0\n"
        )
    elif case == "outside_include":
        (source / "requirements.txt").write_text("-r ../outside.txt\n")
        (tmp_path / "outside.txt").write_text("pytest==9.1.1\n")
        expected = "blocked"
    elif case == "runtime_shadow":
        (source / "pytest.py").write_text("def main(): return 0\n")
        expected = "blocked"
    elif case == "no_import_execution":
        (source / "shipping.py").write_text(
            "raise RuntimeError('Project code must not execute during readiness checks')\n"
            "def fee(amount_cents: int) -> int:\n    return 0\n"
        )
    settings = Settings(repository_root=tmp_path, _env_file=None)
    repository = inspect_repository("project", settings)
    runner = DockerTestRunner(settings).for_run()
    readiness = check_project_readiness(repository, runner, settings)
    assert readiness.status == expected, readiness.model_dump_json()
    assert readiness.environment.image_id.startswith("sha256:")
    if case == "src":
        from app.services.repository_snapshot import verified_snapshot_root

        assert repository.import_roots == ["src", "."]
        result = runner.execute(
            SUITE.tests, str(verified_snapshot_root(repository.artifact, settings))
        )
        assert [item.outcome for item in result.executions] == ["passed"]
    if expected == "blocked":
        assert any(item.status != "passed" for item in readiness.checks)
    assert any("do not execute project imports" in note for note in readiness.notes)
