"""Agent stage tests. A fake model keeps the suite deterministic and off the network."""

from datetime import UTC, datetime

import pytest
from conftest import register
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas import (
    ExecutedTest,
    ExecutionResult,
    GeneratedTest,
    GeneratedTestSuite,
    ModuleInterface,
    Project,
    RepositorySnapshot,
    RequirementAnalysis,
    RequirementItem,
)
from app.services.generator import coverage_gaps, generate_tests, requirement_coverage
from app.services.llm import LLMError
from app.services.orchestrator import DirectLLMOrchestrator

PROJECT = Project(
    id="p1",
    name="Shipping",
    description="",
    repository_ref="",
    requirements_text="Orders of at least 100 dollars ship free. Large orders are fast.",
    goal="Check threshold boundaries.",
    created_at=datetime.now(UTC),
)

ANALYSIS = RequirementAnalysis(
    requirements=[
        RequirementItem(
            id="R1",
            text="An order of at least 100 dollars ships free.",
            source_quote="Orders of at least 100 dollars ship free.",
            testable=True,
            ambiguity=None,
        ),
        RequirementItem(
            id="R2",
            text="Large orders are delivered quickly.",
            source_quote="Large orders are fast.",
            testable=False,
            ambiguity="'large' and 'fast' have no stated threshold.",
        ),
    ],
    notes="",
)

SUITE = GeneratedTestSuite(
    tests=[
        GeneratedTest(
            id="T1",
            requirement_ids=["R1"],
            name="test_free_shipping_at_threshold",
            module="test_shipping.py",
            code="def test_free_shipping_at_threshold():\n    assert True\n",
            rationale="Boundary at 100.",
        )
    ],
    notes="Assumes a `shipping` module.",
)


class FakeLLM:
    """Returns a canned object per requested output contract."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.prompts: list[str] = []

    def parse(self, *, system, prompt, output_format):
        self.prompts.append(prompt)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture
def settings(tmp_path):
    return Settings(database_path=tmp_path / "test.db", llm_enabled=False, _env_file=None)


class FakeRunner:
    """Returns a canned execution result without touching Docker."""

    def __init__(self, result):
        self.result = result
        self.received: list[list[GeneratedTest]] = []
        self.roots: list[str | None] = []

    def execute(self, tests, repository_root=None):
        self.received.append(tests)
        self.roots.append(repository_root)
        return self.result


def execution(*outcomes) -> ExecutionResult:
    return ExecutionResult(
        executions=[
            ExecutedTest(
                test_id="T1",
                module="test_shipping.py",
                name=f"test_{index}",
                outcome=outcome,
                duration_seconds=0.01,
                message="" if outcome == "passed" else f"{outcome} detail",
            )
            for index, outcome in enumerate(outcomes, start=1)
        ],
        exit_code=0 if all(o == "passed" for o in outcomes) else 1,
        timed_out=False,
        stderr_excerpt="",
    )


def run_agent(*responses, runner=None):
    return DirectLLMOrchestrator(FakeLLM(*responses), runner=runner).run(PROJECT)


def test_b0_run_records_requirements_tests_and_traceability():
    run = run_agent(ANALYSIS, SUITE)

    assert run.mode == "baseline_b0"
    assert run.status == "completed"
    assert [r.id for r in run.report.requirements] == ["R1", "R2"]
    assert run.report.generated_tests[0].requirement_ids == ["R1"]
    assert run.report.requirement_coverage == 1.0
    assert run.report.coverage_gaps == []
    # R1 is covered by a test but nothing ran, so it is still unverified, not verified.
    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses == {"R1": "Unverified", "R2": "Uncertain"}
    assert [b.test_refs for b in run.report.behaviors] == [["test_shipping.py"], []]


def test_b0_run_never_claims_execution_or_measurement():
    report = run_agent(ANALYSIS, SUITE).report

    assert report.executed_tests == 0
    assert report.semantic_coverage is None
    assert report.mutation_score is None
    assert any("were not executed" in issue for issue in report.unresolved_issues)
    assert report.execution_success_rate is None
    assert report.executions == []


def test_ambiguity_and_untestable_requirements_are_reported_not_invented():
    report = run_agent(ANALYSIS, SUITE).report

    assert any("R2 is ambiguous" in issue for issue in report.unresolved_issues)
    assert any("R2 is not testable as written" in issue for issue in report.unresolved_issues)


def test_uncovered_testable_requirement_becomes_a_gap():
    empty = GeneratedTestSuite(tests=[], notes="")
    report = run_agent(ANALYSIS, empty).report

    assert report.coverage_gaps == ["R1: An order of at least 100 dollars ships free."]
    assert report.requirement_coverage == 0.0
    assert any("no generated test" in issue for issue in report.unresolved_issues)


def test_invented_requirement_references_are_dropped():
    suite = GeneratedTestSuite(
        tests=[
            GeneratedTest(
                id="T1",
                requirement_ids=["R1", "R99"],
                name="test_x",
                module="test_x",
                code="def test_x():\n    assert True\n",
                rationale="",
            )
        ],
        notes="",
    )
    report = run_agent(ANALYSIS, suite).report

    assert report.generated_tests[0].requirement_ids == ["R1"]
    assert report.generated_tests[0].module == "test_x.py"


def test_untestable_requirements_are_not_sent_to_the_generator():
    llm = FakeLLM(SUITE)
    generate_tests(llm, PROJECT, ANALYSIS.requirements)

    assert "R1" in llm.prompts[0]
    assert "R2" not in llm.prompts[0]


def test_generator_is_skipped_when_nothing_is_testable():
    llm = FakeLLM()
    suite = generate_tests(llm, PROJECT, [ANALYSIS.requirements[1]])

    assert suite.tests == []
    assert llm.prompts == []


def test_model_failure_produces_a_failed_run_not_a_fake_result():
    run = run_agent(LLMError("The model API could not be reached."))

    assert run.status == "failed"
    assert run.stage == "analyze"
    assert run.report.generated_tests == []
    assert run.report.unresolved_issues == ["The model API could not be reached."]


def test_generation_failure_keeps_the_requirements_already_extracted():
    run = run_agent(ANALYSIS, LLMError("rate limited"))

    assert run.status == "failed"
    assert run.stage == "generate"
    assert [r.id for r in run.report.requirements] == ["R1", "R2"]


def test_coverage_helpers_return_none_when_nothing_is_testable():
    untestable = [ANALYSIS.requirements[1]]

    assert requirement_coverage(untestable, []) is None
    assert coverage_gaps(untestable, []) == []


def test_api_serves_an_agent_run_end_to_end(settings):
    app = create_app(settings, orchestrator=DirectLLMOrchestrator(FakeLLM(ANALYSIS, SUITE)))
    with TestClient(app) as client:
        register(client)
        assert client.get("/api/v1/system").json()["mode"] == "baseline_b0"
        project = client.post(
            "/api/v1/projects",
            json={"name": "Shipping", "requirements_text": PROJECT.requirements_text},
        ).json()
        run = client.post(f"/api/v1/projects/{project['id']}/runs").json()

        assert run["mode"] == "baseline_b0"
        stored = client.get(f"/api/v1/runs/{run['id']}").json()
        assert stored == run
        report = client.get(f"/api/v1/runs/{run['id']}/report").json()
        assert report["generated_tests"][0]["module"] == "test_shipping.py"
        assert report["requirement_coverage"] == 1.0


def test_missing_credentials_fall_back_to_scaffold_mode(tmp_path, monkeypatch):
    for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    live = Settings(database_path=tmp_path / "live.db", sandbox_enabled=False, _env_file=None)

    with TestClient(create_app(live)) as client:
        assert client.get("/api/v1/system").json()["mode"] == "scaffold"
        statuses = {
            i["key"]: i["status"] for i in client.get("/api/v1/system").json()["integrations"]
        }
        assert statuses["analysis"] == "not_connected"
        assert statuses["storage"] == "ready"


def test_configured_credentials_enable_the_agent(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-not-a-real-key")
    # sandbox_enabled=False so the result does not depend on whether the machine
    # running the suite happens to have Docker started.
    live = Settings(database_path=tmp_path / "live.db", sandbox_enabled=False, _env_file=None)

    with TestClient(create_app(live)) as client:
        body = client.get("/api/v1/system").json()
        statuses = {i["key"]: i["status"] for i in body["integrations"]}

    assert body["mode"] == "baseline_b0"
    assert statuses["analysis"] == "ready"
    assert statuses["generation"] == "ready"
    assert statuses["execution"] == "not_connected"


def test_a_connected_sandbox_is_advertised_as_ready(tmp_path):
    orchestrator = DirectLLMOrchestrator(
        FakeLLM(ANALYSIS, SUITE), runner=FakeRunner(execution("passed"))
    )
    settings = Settings(database_path=tmp_path / "live.db", _env_file=None)

    with TestClient(create_app(settings, orchestrator=orchestrator)) as client:
        statuses = {
            i["key"]: i["status"] for i in client.get("/api/v1/system").json()["integrations"]
        }

    assert statuses["execution"] == "ready"
    # Diagnosis and refinement are the next stage and must not be claimed yet.
    assert statuses["diagnosis"] == "not_connected"


def test_executed_outcomes_are_recorded_with_a_success_rate():
    runner = FakeRunner(execution("passed", "failed", "error"))

    report = run_agent(ANALYSIS, SUITE, runner=runner).report

    assert runner.received == [SUITE.tests]
    assert report.executed_tests == 3
    assert [e.outcome for e in report.executions] == ["passed", "failed", "error"]
    assert report.execution_success_rate == round(1 / 3, 4)


def test_execution_does_not_promote_a_behavior_to_verified():
    report = run_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("passed"))).report

    statuses = {b.requirement_id: b.verification_status for b in report.behaviors}
    # The system under test was never inspected, so a green test verifies nothing.
    assert statuses == {"R1": "Unverified", "R2": "Uncertain"}


def test_each_behavior_links_to_the_outcomes_of_its_own_tests():
    report = run_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("passed", "failed"))).report

    behaviors = {b.requirement_id: b for b in report.behaviors}
    assert behaviors["R1"].evidence_refs == ["E1", "E2"]
    assert behaviors["R2"].evidence_refs == []
    evidence = {item["id"]: item for item in report.evidence}
    assert evidence["E2"]["outcome"] == "failed"
    assert evidence["E2"]["test"] == "test_shipping.py::test_2"


def test_errored_and_failed_tests_are_reported_as_distinct_problems():
    report = run_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("error", "failed"))).report

    issues = " ".join(report.unresolved_issues)
    assert "1 generated tests could not run" in issues
    assert "1 generated tests ran and failed" in issues
    assert "suspected defect" in issues


def test_a_timed_out_execution_records_no_outcome():
    timed_out = ExecutionResult(
        executions=[], exit_code=-1, timed_out=True, stderr_excerpt="Execution exceeded 120s"
    )

    run = run_agent(ANALYSIS, SUITE, runner=FakeRunner(timed_out))

    assert run.status == "completed"
    assert run.report.executed_tests == 0
    assert run.report.execution_success_rate is None
    assert any("timed out" in issue for issue in run.report.unresolved_issues)
    assert "timed out" in run.report.summary


def test_without_a_sandbox_the_run_says_so_instead_of_claiming_execution():
    run = run_agent(ANALYSIS, SUITE)

    assert [event.stage for event in run.events] == [
        "understand",
        "analyze",
        "generate",
        "measure",
    ]
    assert "not connected" in run.events[-1].message
    assert any("build-sandbox.sh" in issue for issue in run.report.unresolved_issues)


def test_a_container_killed_by_the_memory_limit_is_explained_not_just_numbered():
    killed = ExecutionResult(executions=[], exit_code=137, timed_out=False, stderr_excerpt="")

    report = run_agent(ANALYSIS, SUITE, runner=FakeRunner(killed)).report

    assert report.executed_tests == 0
    assert report.execution_success_rate is None
    assert any("REQTEST_SANDBOX_MEMORY" in issue for issue in report.unresolved_issues)


def test_a_sandbox_that_collected_nothing_is_not_reported_as_success():
    empty = ExecutionResult(executions=[], exit_code=4, timed_out=False, stderr_excerpt="no tests")

    report = run_agent(ANALYSIS, SUITE, runner=FakeRunner(empty)).report

    assert report.execution_success_rate is None
    assert any("Exit code 4" in issue for issue in report.unresolved_issues)


REPOSITORY = RepositorySnapshot(
    root="/repos/shipping",
    modules=[
        ModuleInterface(
            module="shipping",
            path="shipping.py",
            docstring="Shipping fees.",
            constants=["FREE_THRESHOLD"],
            functions=["fee(amount_cents: int) -> int"],
            classes=[],
        )
    ],
    sha256="abc",
)


def inspecting_agent(*responses, runner=None, repository=REPOSITORY):
    """A B0 orchestrator whose inspection step returns a canned snapshot."""
    orchestrator = DirectLLMOrchestrator(FakeLLM(*responses), runner=runner)
    orchestrator._inspect = lambda project, events: (repository, [])
    return orchestrator


def test_the_real_interfaces_reach_the_generator_and_the_sandbox():
    llm = FakeLLM(ANALYSIS, SUITE)
    runner = FakeRunner(execution("passed"))
    orchestrator = DirectLLMOrchestrator(llm, runner=runner)
    orchestrator._inspect = lambda project, events: (REPOSITORY, [])

    run = orchestrator.run(PROJECT)

    assert "module shipping (shipping.py)" in llm.prompts[1]
    assert "fee(amount_cents: int) -> int" in llm.prompts[1]
    assert runner.roots == ["/repos/shipping"]
    assert run.report.repository is not None
    assert run.report.repository.sha256 == "abc"


def test_a_passing_test_against_the_inspected_system_is_partial_evidence():
    run = inspecting_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("passed"))).run(PROJECT)

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    # Partially Verified, never Verified: adequacy of the tests is not evaluated.
    assert statuses == {"R1": "Partially Verified", "R2": "Uncertain"}


def test_a_failing_test_leaves_the_behavior_unverified():
    run = inspecting_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("passed", "failed"))).run(
        PROJECT
    )

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses["R1"] == "Unverified"


def test_a_passing_test_without_inspection_is_not_evidence():
    # Same green result, but the module under test was guessed rather than read.
    run = run_agent(ANALYSIS, SUITE, runner=FakeRunner(execution("passed")))

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses["R1"] == "Unverified"
    assert run.report.repository is None


def test_an_unreadable_repository_reports_the_reason_without_failing_the_run(tmp_path):
    project = PROJECT.model_copy(update={"repository_ref": "../outside"})
    settings = Settings(repository_root=tmp_path, _env_file=None)
    orchestrator = DirectLLMOrchestrator(FakeLLM(ANALYSIS, SUITE), settings=settings)

    run = orchestrator.run(project)

    assert run.status == "completed"
    assert run.report.repository is None
    assert any("Repository not read" in issue for issue in run.report.unresolved_issues)
    assert any(event.stage == "inspect" for event in run.events)


def test_a_project_without_a_repository_says_the_tests_must_guess():
    report = run_agent(ANALYSIS, SUITE).report

    assert any("guess the module" in issue for issue in report.unresolved_issues)


def test_inspection_status_follows_the_configured_root(tmp_path):
    off = Settings(database_path=tmp_path / "a.db", sandbox_enabled=False, _env_file=None)
    on = off.model_copy(update={"repository_root": tmp_path})

    def statuses(settings):
        orchestrator = DirectLLMOrchestrator(FakeLLM(), settings=settings)
        with TestClient(create_app(settings, orchestrator=orchestrator)) as client:
            body = client.get("/api/v1/system").json()
        return {i["key"]: i["status"] for i in body["integrations"]}

    assert statuses(off)["inspection"] == "not_connected"
    assert statuses(on)["inspection"] == "ready"
    # RAG is a separate integration and is still unbuilt.
    assert statuses(on)["retrieval"] == "not_connected"
