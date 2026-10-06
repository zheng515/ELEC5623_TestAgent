"""Agent stage tests. A fake model keeps the suite deterministic and off the network."""

from datetime import UTC, datetime

import pytest
from conftest import register, wait_for_run
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
    ProjectReadiness,
    RepositorySnapshot,
    RequirementAnalysis,
    RequirementItem,
    ScenarioCheck,
)
from app.schemas import (
    TestPlan as ScenarioPlan,
)
from app.schemas import (
    TestScenario as Scenario,
)
from app.services.generator import coverage_gaps, generate_tests, requirement_coverage
from app.services.llm import LLMError
from app.services.orchestrator import DirectLLMOrchestrator
from app.services.planner import plan_tests

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

PLAN = ScenarioPlan(
    scenarios=[
        Scenario(
            id="S1",
            requirement_ids=["R1"],
            title="Free shipping at threshold",
            category="boundary",
            preconditions=[],
            inputs=["amount = 100 dollars"],
            steps=["Calculate the shipping fee."],
            expected_result="Free shipping.",
            evidence_refs=["requirement:R1"],
            assumptions=[],
            check=ScenarioCheck(
                target="shipping.fee", arguments=[10000], operator="equals", expected_value=0
            ),
        )
    ],
    notes="",
)

SUITE = GeneratedTestSuite(
    tests=[
        GeneratedTest(
            id="T1",
            requirement_ids=["R1"],
            scenario_ids=["S1"],
            name="test_free_shipping_at_threshold",
            module="test_shipping.py",
            code=(
                "from shipping import fee\n\n"
                "def test_free_shipping_at_threshold():\n    assert fee(10000) == 0\n"
            ),
            rationale="Boundary at 100.",
        )
    ],
    notes="Assumes a `shipping` module.",
)


INVALID_SUITE = SUITE.model_copy(
    update={
        "tests": [
            SUITE.tests[0].model_copy(
                update={
                    "code": SUITE.tests[0].code.replace(
                        "at_threshold():", "at_threshold(missing_fixture):"
                    )
                }
            )
        ]
    }
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
        assert isinstance(response, output_format)
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

    def for_run(self):
        return self

    def preflight(self, repository_root, import_roots, module_paths):
        return ProjectReadiness(
            status="unknown",
            import_roots=import_roots,
            notes=["Test double: no real runtime check."],
        )


class SequenceRunner(FakeRunner):
    def __init__(self, *results):
        super().__init__(None)
        self.results = list(results)

    def execute(self, tests, repository_root=None):
        self.received.append(tests)
        self.roots.append(repository_root)
        return self.results.pop(0)


def execution(*outcomes) -> ExecutionResult:
    return ExecutionResult(
        executions=[
            ExecutedTest(
                test_id="T1",
                module="test_shipping.py",
                name=SUITE.tests[0].name if index == 1 else f"test_{index}",
                outcome=outcome,
                duration_seconds=0.01,
                message=(
                    ""
                    if outcome == "passed"
                    else "fixture 'missing_fixture' not found"
                    if outcome == "error"
                    else f"{outcome} detail"
                ),
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
    run = run_agent(ANALYSIS, PLAN, SUITE)

    assert run.mode == "baseline_b0"
    assert run.status == "completed"
    assert [r.id for r in run.report.requirements] == ["R1", "R2"]
    assert run.report.generated_tests[0].requirement_ids == ["R1"]
    assert run.report.requirement_coverage == 0.0
    assert run.report.coverage_gaps == ["R1: An order of at least 100 dollars ships free."]
    assert run.report.test_plan == PLAN
    assert run.report.generated_tests[0].scenario_ids == ["S1"]
    # R1 is covered by a test but nothing ran, so it is still unverified, not verified.
    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses == {"R1": "Unverified", "R2": "Uncertain"}
    assert [b.test_refs for b in run.report.behaviors] == [["test_shipping.py"], []]


def test_b0_run_never_claims_execution_or_measurement():
    report = run_agent(ANALYSIS, PLAN, SUITE).report

    assert report.executed_tests == 0
    assert report.semantic_coverage is None
    assert report.mutation_score is None
    assert any("were not executed" in issue for issue in report.unresolved_issues)
    assert report.execution_success_rate is None
    assert report.executions == []


def test_ambiguity_and_untestable_requirements_are_reported_not_invented():
    report = run_agent(ANALYSIS, PLAN, SUITE).report

    assert any("R2 is ambiguous" in issue for issue in report.unresolved_issues)
    assert any("R2 is not testable as written" in issue for issue in report.unresolved_issues)


def test_uncovered_testable_requirement_becomes_a_gap():
    empty = GeneratedTestSuite(tests=[], notes="")
    report = run_agent(ANALYSIS, PLAN, empty).report

    assert report.coverage_gaps == ["R1: An order of at least 100 dollars ships free."]
    assert report.requirement_coverage == 0.0
    assert any("no generated test" in issue for issue in report.unresolved_issues)


def test_invented_requirement_references_are_dropped():
    suite = GeneratedTestSuite(
        tests=[
            GeneratedTest(
                id="T1",
                requirement_ids=["R1", "R99"],
                scenario_ids=["S1", "S99"],
                name="test_x",
                module="test_x",
                code="def test_x():\n    assert True\n",
                rationale="",
            )
        ],
        notes="",
    )
    report = run_agent(ANALYSIS, PLAN, suite).report

    assert report.generated_tests[0].requirement_ids == ["R1"]
    assert report.generated_tests[0].module == "test_x.py"


def test_untestable_requirements_are_not_sent_to_the_generator():
    llm = FakeLLM(SUITE)
    generate_tests(llm, PROJECT, ANALYSIS.requirements, plan=PLAN)

    assert "R1" in llm.prompts[0]
    assert "R2" not in llm.prompts[0]


def test_generator_is_skipped_when_nothing_is_testable():
    llm = FakeLLM()
    suite = generate_tests(
        llm, PROJECT, [ANALYSIS.requirements[1]], plan=ScenarioPlan(scenarios=[], notes="")
    )

    assert suite.tests == []
    assert llm.prompts == []


def test_model_failure_produces_a_failed_run_not_a_fake_result():
    run = run_agent(LLMError("The model API could not be reached."))

    assert run.status == "failed"
    assert run.stage == "analyze"
    assert run.report.generated_tests == []
    assert run.report.unresolved_issues == ["The model API could not be reached."]


def test_generation_failure_keeps_the_requirements_already_extracted():
    run = run_agent(ANALYSIS, PLAN, LLMError("rate limited"))

    assert run.status == "failed"
    assert run.stage == "generate"
    assert run.report.test_plan == PLAN
    assert [r.id for r in run.report.requirements] == ["R1", "R2"]
    assert run.report.uncovered_scenarios == ["S1: Free shipping at threshold"]


def test_coverage_helpers_return_none_when_nothing_is_testable():
    untestable = [ANALYSIS.requirements[1]]

    assert requirement_coverage(untestable, []) is None
    assert coverage_gaps(untestable, []) == []


def test_api_serves_an_agent_run_end_to_end(settings):
    app = create_app(settings, orchestrator=DirectLLMOrchestrator(FakeLLM(ANALYSIS, PLAN, SUITE)))
    with TestClient(app) as client:
        register(client)
        assert client.get("/api/v1/system").json()["mode"] == "baseline_b0"
        project = client.post(
            "/api/v1/projects",
            json={"name": "Shipping", "requirements_text": PROJECT.requirements_text},
        ).json()
        response = client.post(f"/api/v1/projects/{project['id']}/runs")
        assert response.status_code == 202
        run = wait_for_run(client, response.json()["id"])

        assert run["mode"] == "baseline_b0"
        stored = client.get(f"/api/v1/runs/{run['id']}").json()
        assert stored == run
        report = client.get(f"/api/v1/runs/{run['id']}/report").json()
        assert report["generated_tests"][0]["module"] == "test_shipping.py"
        assert report["requirement_coverage"] == 0.0
        assert report["test_plan"]["scenarios"][0]["expected_result"] == "Free shipping."
        assert report["generated_tests"][0]["scenario_ids"] == ["S1"]
        html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
        assert "Test plan" in html
        assert "Free shipping at threshold" in html
        assert "Orders of at least 100 dollars ship free." in html
    with TestClient(create_app(settings)) as restarted:
        restarted.cookies.update(client.cookies)
        assert restarted.get(f"/api/v1/runs/{run['id']}").json() == run


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
        FakeLLM(ANALYSIS, PLAN, SUITE), runner=FakeRunner(execution("passed"))
    )
    settings = Settings(database_path=tmp_path / "live.db", _env_file=None)

    with TestClient(create_app(settings, orchestrator=orchestrator)) as client:
        system = client.get("/api/v1/system").json()
        statuses = {i["key"]: i["status"] for i in system["integrations"]}

    assert system["mode"] == "baseline_b2"
    assert statuses["execution"] == "ready"
    assert statuses["diagnosis"] == "ready"


def test_executed_outcomes_are_recorded_with_a_success_rate():
    runner = FakeRunner(execution("passed", "failed", "error"))

    report = (
        inspecting_agent(
            ANALYSIS, PLAN, SUITE, GeneratedTestSuite(tests=[], notes=""), runner=runner
        )
        .run(PROJECT)
        .report
    )

    assert runner.received == [report.generated_tests]
    assert report.executed_tests == 3
    assert [e.outcome for e in report.executions] == ["passed", "failed", "error"]
    assert report.execution_success_rate == round(1 / 3, 4)


def test_execution_does_not_promote_a_behavior_to_verified():
    report = run_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).report

    statuses = {b.requirement_id: b.verification_status for b in report.behaviors}
    # The system under test was never inspected, so a green test verifies nothing.
    assert statuses == {"R1": "Unverified", "R2": "Uncertain"}


def test_each_behavior_links_to_the_outcomes_of_its_own_tests():
    report = (
        inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed", "failed")))
        .run(PROJECT)
        .report
    )

    behaviors = {b.requirement_id: b for b in report.behaviors}
    assert behaviors["R1"].evidence_refs == ["E1"]
    assert behaviors["R2"].evidence_refs == []
    evidence = {item["id"]: item for item in report.evidence}
    assert evidence["E2"]["outcome"] == "failed"
    assert evidence["E2"]["test"] == "test_shipping.py::test_2"


def test_errored_and_failed_tests_are_reported_as_distinct_problems():
    report = (
        inspecting_agent(
            ANALYSIS,
            PLAN,
            SUITE,
            GeneratedTestSuite(tests=[], notes=""),
            runner=FakeRunner(execution("error", "failed")),
        )
        .run(PROJECT)
        .report
    )

    issues = " ".join(report.unresolved_issues)
    assert "1 generated tests still could not run" in issues
    assert "1 generated tests ran and failed" in issues
    assert "suspected product defects" in issues


def test_a_timed_out_execution_records_no_outcome():
    timed_out = ExecutionResult(
        executions=[], exit_code=-1, timed_out=True, stderr_excerpt="Execution exceeded 120s"
    )

    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(timed_out)).run(PROJECT)

    assert run.status == "completed"
    assert run.report.executed_tests == 0
    assert run.report.execution_success_rate is None
    assert any("timed out" in issue for issue in run.report.unresolved_issues)
    assert "timed out" in run.report.summary


def test_without_a_sandbox_the_run_says_so_instead_of_claiming_execution():
    run = run_agent(ANALYSIS, PLAN, SUITE)

    assert [event.stage for event in run.events] == [
        "understand",
        "analyze",
        "plan",
        "generate",
        "measure",
    ]
    assert "not connected" in run.events[-1].message
    assert any("build-sandbox.sh" in issue for issue in run.report.unresolved_issues)


def test_a_container_killed_by_the_memory_limit_is_explained_not_just_numbered():
    killed = ExecutionResult(executions=[], exit_code=137, timed_out=False, stderr_excerpt="")

    report = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(killed)).run(PROJECT).report

    assert report.executed_tests == 0
    assert report.execution_success_rate is None
    assert any("REQTEST_SANDBOX_MEMORY" in issue for issue in report.unresolved_issues)


def test_a_sandbox_that_collected_nothing_is_not_reported_as_success():
    empty = ExecutionResult(executions=[], exit_code=4, timed_out=False, stderr_excerpt="no tests")

    report = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(empty)).run(PROJECT).report

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


def pin_stub_repository(repository, settings):
    from app.services.repository_snapshot import capture_repository, snapshot_store

    if repository is None:
        return None
    root = snapshot_store(settings).parent / "fixture-repository"
    root.mkdir(exist_ok=True)
    (root / "shipping.py").write_text("def fee(amount_cents: int) -> int:\n    return 0\n")
    artifact, _ = capture_repository(root, settings)
    return repository.model_copy(update={"artifact": artifact})


def inspecting_agent(*responses, runner=None, repository=REPOSITORY):
    """A B0 orchestrator whose inspection step returns a canned snapshot."""
    orchestrator = DirectLLMOrchestrator(FakeLLM(*responses), runner=runner)
    repository = pin_stub_repository(repository, orchestrator._settings)
    orchestrator._inspect = lambda project, events: (repository, [])
    return orchestrator


def test_the_real_interfaces_reach_the_generator_and_the_sandbox():
    llm = FakeLLM(ANALYSIS, PLAN, SUITE)
    runner = FakeRunner(execution("passed"))
    orchestrator = DirectLLMOrchestrator(llm, runner=runner)
    repository = pin_stub_repository(REPOSITORY, orchestrator._settings)
    orchestrator._inspect = lambda project, events: (repository, [])

    run = orchestrator.run(PROJECT)

    assert "module shipping (shipping.py)" in llm.prompts[2]
    assert "fee(amount_cents: int) -> int" in llm.prompts[2]
    from app.services.repository_snapshot import verified_snapshot_root

    assert runner.roots == [
        str(verified_snapshot_root(repository.artifact, orchestrator._settings))
    ]
    assert runner.roots != [REPOSITORY.root]
    assert run.report.repository is not None
    assert run.report.repository.sha256 == "abc"


def test_a_passing_test_against_the_inspected_system_is_partial_evidence():
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    # Partially Verified, never Verified: adequacy of the tests is not evaluated.
    assert statuses == {"R1": "Partially Verified", "R2": "Uncertain"}


def test_a_failing_test_leaves_the_behavior_unverified():
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("failed"))).run(
        PROJECT
    )

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses["R1"] == "Unverified"


def test_invalid_test_is_refined_and_reexecuted_once():
    refined = GeneratedTestSuite(
        tests=[SUITE.tests[0].model_copy(update={"code": SUITE.tests[0].code})],
        notes="Corrected the invalid test construction.",
    )
    runner = SequenceRunner(execution("error"), execution("passed"))

    run = inspecting_agent(ANALYSIS, PLAN, INVALID_SUITE, refined, runner=runner).run(PROJECT)

    assert run.mode == "baseline_b2"
    assert len(runner.received) == 2
    assert runner.received[1][0].code == refined.tests[0].code
    assert [item.outcome for item in run.report.executions] == ["passed"]
    assert run.report.refinement_iterations == 1
    assert run.report.diagnoses == []
    assert run.report.execution_attempts[0].diagnoses[0].classification == "invalid_test"
    assert [item.result.executions[0].outcome for item in run.report.execution_attempts] == [
        "error",
        "passed",
    ]
    assert [event.stage for event in run.events][-2:] == ["improve", "re_measure"]


def test_assertion_failure_is_preserved_as_a_suspected_defect():
    runner = FakeRunner(execution("failed"))

    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=runner).run(PROJECT)

    assert len(runner.received) == 1
    assert run.report.refinement_iterations == 0
    assert run.report.diagnoses[0].classification == "suspected_defect"
    assert any("human review" in issue for issue in run.report.unresolved_issues)


def test_a_passing_test_without_inspection_is_not_evidence():
    # Same green result, but the module under test was guessed rather than read.
    run = run_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed")))

    statuses = {b.requirement_id: b.verification_status for b in run.report.behaviors}
    assert statuses["R1"] == "Unverified"
    assert run.report.repository is None


def test_an_unreadable_repository_reports_the_reason_without_failing_the_run(tmp_path):
    project = PROJECT.model_copy(update={"repository_ref": "../outside"})
    settings = Settings(repository_root=tmp_path, _env_file=None)
    orchestrator = DirectLLMOrchestrator(FakeLLM(ANALYSIS, PLAN, SUITE), settings=settings)

    run = orchestrator.run(project)

    assert run.status == "completed"
    assert run.report.repository is None
    assert any("Repository not read" in issue for issue in run.report.unresolved_issues)
    assert any(event.stage == "inspect" for event in run.events)


def test_a_project_without_a_repository_says_the_tests_must_guess():
    report = run_agent(ANALYSIS, PLAN, SUITE).report

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


def test_planning_failure_keeps_requirements_and_stops_generation():
    llm = FakeLLM(ANALYSIS, LLMError("Planning response was unavailable."))
    run = DirectLLMOrchestrator(llm).run(PROJECT)

    assert run.status == "failed"
    assert run.stage == "plan"
    assert run.report.requirements == ANALYSIS.requirements
    assert run.report.test_plan is None
    assert run.report.generated_tests == []
    assert len(llm.prompts) == 2


def test_planner_filters_unknown_sources_and_assigns_unique_scenario_ids():
    candidate = PLAN.scenarios[0].model_copy(
        update={
            "id": "duplicate",
            "requirement_ids": ["R1", "R1", "R2", "invented"],
            "evidence_refs": ["requirement:R2", "requirement:invented", "repository:secret.py"],
        }
    )
    invalid = candidate.model_copy(update={"requirement_ids": ["R2", "invented"]})
    llm = FakeLLM(ScenarioPlan(scenarios=[candidate, candidate, invalid], notes=""))

    plan = plan_tests(llm, PROJECT, ANALYSIS.requirements, REPOSITORY)

    assert [scenario.id for scenario in plan.scenarios] == ["S1", "S2"]
    assert all(item.requirement_ids == ["R1"] for item in plan.scenarios)
    assert all(item.evidence_refs == ["requirement:R1"] for item in plan.scenarios)
    assert "no testable requirement link" in plan.notes
    assert '"repository:shipping.py"' in llm.prompts[0]
    assert "Orders of at least 100 dollars ship free." in llm.prompts[0]


def test_planner_bounds_scenarios_and_reports_truncation():
    llm = FakeLLM(ScenarioPlan(scenarios=PLAN.scenarios * 3, notes=""))
    plan = plan_tests(llm, PROJECT, ANALYSIS.requirements, max_scenarios=2)

    assert len(plan.scenarios) == 2
    assert "remaining ones omitted" in plan.notes


def test_no_testable_requirement_skips_both_planning_and_generation():
    analysis = RequirementAnalysis(requirements=[ANALYSIS.requirements[1]], notes="")
    llm = FakeLLM(analysis)
    run = DirectLLMOrchestrator(llm).run(PROJECT)

    assert len(llm.prompts) == 1
    assert run.report.test_plan.scenarios == []
    assert run.report.generated_tests == []
    assert run.report.requirement_coverage is None


def test_empty_plan_records_planning_gap_without_generating_unplanned_tests():
    llm = FakeLLM(ANALYSIS, ScenarioPlan(scenarios=[], notes="Missing interface."))
    run = DirectLLMOrchestrator(llm).run(PROJECT)

    assert len(llm.prompts) == 2
    assert run.report.generated_tests == []
    assert run.report.planning_gaps == ["R1: An order of at least 100 dollars ships free."]
    assert run.report.requirement_coverage == 0
    assert any("no planned scenario" in item for item in run.report.unresolved_issues)


def test_generator_uses_plan_oracle_and_rejects_unlinked_tests():
    invented = SUITE.tests[0].model_copy(
        update={
            "scenario_ids": ["invented"],
            "requirement_ids": ["R1"],
        }
    )
    llm = FakeLLM(GeneratedTestSuite(tests=[invented], notes=""))
    suite = generate_tests(llm, PROJECT, ANALYSIS.requirements, REPOSITORY, plan=PLAN)

    assert "Free shipping." in llm.prompts[0]
    assert "amount = 100 dollars" in llm.prompts[0]
    assert suite.tests == []
    assert "no valid scenario link" in suite.notes


def test_unimplemented_scenario_is_reported_separately_from_requirement_coverage():
    second = PLAN.scenarios[0].model_copy(
        update={
            "id": "S2",
            "title": "Above the shipping threshold",
        }
    )
    plan = ScenarioPlan(scenarios=[*PLAN.scenarios, second], notes="")
    run = inspecting_agent(ANALYSIS, plan, SUITE).run(PROJECT)

    assert run.report.requirement_coverage == 1
    assert run.report.uncovered_scenarios == ["S2: Above the shipping threshold"]
    assert any(
        "planned scenarios have no generated test" in item for item in run.report.unresolved_issues
    )


def test_refinement_cannot_rewrite_requirement_or_scenario_lineage():
    replacement = SUITE.tests[0].model_copy(
        update={
            "requirement_ids": ["R2"],
            "scenario_ids": ["invented"],
            "module": "test_other.py",
        }
    )
    runner = SequenceRunner(execution("error"), execution("passed"))
    run = inspecting_agent(
        ANALYSIS,
        PLAN,
        INVALID_SUITE,
        GeneratedTestSuite(tests=[replacement], notes=""),
        runner=runner,
    ).run(PROJECT)

    assert run.report.generated_tests[0].requirement_ids == ["R1"]
    assert run.report.generated_tests[0].scenario_ids == ["S1"]
    assert runner.received[1][0].module == "test_shipping.py"


def test_html_plan_escapes_model_text_and_links_execution_outcomes():
    from app.services.report_renderer import render_html_report

    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    scenario = run.report.test_plan.scenarios[0].model_copy(
        update={
            "title": "<script>alert(1)</script>",
            "expected_result": "<img src=x onerror=alert(1)>",
            "evidence_refs": ["requirement:R1", "repository:shipping.py"],
        }
    )
    run.report.test_plan = ScenarioPlan(scenarios=[scenario], notes="")
    html = render_html_report(PROJECT, run)

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<img src=x" not in html
    assert "&lt;img src=x onerror=alert(1)&gt;" in html
    assert "fee(amount_cents: int) -&gt; int" in html
    assert "test_free_shipping_at_threshold: passed" in html


def test_legacy_run_without_a_plan_remains_readable():
    from app.schemas import VerificationRun

    run = run_agent(ANALYSIS, PLAN, SUITE).model_dump()
    for key in ("test_plan", "planning_gaps", "uncovered_scenarios"):
        run["report"].pop(key)
    run["report"]["generated_tests"][0].pop("scenario_ids")

    legacy = VerificationRun.model_validate(run)
    assert legacy.report.test_plan is None
    assert legacy.report.generated_tests[0].scenario_ids == []


@pytest.mark.parametrize("quote", ["", "   ", "A fabricated source quote."])
def test_invalid_source_quote_stops_before_planning(quote):
    analysis = ANALYSIS.model_copy(
        update={
            "requirements": [ANALYSIS.requirements[0].model_copy(update={"source_quote": quote})]
        }
    )
    llm = FakeLLM(analysis)
    run = DirectLLMOrchestrator(llm).run(PROJECT)
    assert run.status == "failed"
    assert run.stage == "analyze"
    assert run.report.requirements == []
    assert "source evidence could not be validated" in run.report.unresolved_issues[0]
    assert len(llm.prompts) == 1


def test_unexecuted_linked_test_prevents_partial_verification():
    second = SUITE.tests[0].model_copy(update={"id": "T2", "module": "test_other.py"})
    suite = GeneratedTestSuite(tests=[SUITE.tests[0], second], notes="")
    run = inspecting_agent(ANALYSIS, PLAN, suite, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.execution_gaps == ["T2: test_other.py"]


def test_missing_planned_scenario_prevents_partial_verification():
    second = PLAN.scenarios[0].model_copy(update={"id": "S2", "title": "Above threshold"})
    plan = ScenarioPlan(scenarios=[*PLAN.scenarios, second], notes="")
    run = inspecting_agent(ANALYSIS, plan, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.uncovered_scenarios == ["S2: Above threshold"]


def test_repair_timeout_preserves_both_attempts_and_uses_latest_execution_metadata():
    timeout = ExecutionResult(
        executions=[], exit_code=-1, timed_out=True, stderr_excerpt="Repair exceeded 120s."
    )
    refined = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={
                        "code": "# Repair preserves the original check.\n" + SUITE.tests[0].code
                    }
                )
            ]
        }
    )
    runner = SequenceRunner(execution("error"), timeout)
    run = inspecting_agent(ANALYSIS, PLAN, INVALID_SUITE, refined, runner=runner).run(PROJECT)
    assert "latest sandbox attempt timed out" in run.report.summary
    assert any("Repair exceeded 120s" in item for item in run.report.unresolved_issues)
    assert not any("Exit code 1" in item for item in run.report.unresolved_issues)
    assert run.report.executions == []
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.execution_attempts[0].tests[0].code == INVALID_SUITE.tests[0].code
    assert run.report.execution_attempts[0].result.executions[0].outcome == "error"
    assert run.report.execution_attempts[1].result.timed_out
    assert run.report.execution_attempts[1].tests[0].code == refined.tests[0].code


def test_unknown_environment_error_is_not_automatically_repaired():
    result = execution("error")
    result.executions[0].message = "ModuleNotFoundError: No module named 'numpy'"
    runner = FakeRunner(result)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=runner).run(PROJECT)
    assert len(runner.received) == 1
    assert run.report.refinement_iterations == 0
    assert run.report.diagnoses[0].classification == "inconclusive"


def test_duplicate_generated_test_ids_are_distinct_traceable_artifacts():
    second = SUITE.tests[0].model_copy(update={"module": "test_other.py"})
    suite = generate_tests(
        FakeLLM(GeneratedTestSuite(tests=[SUITE.tests[0], second], notes="")),
        PROJECT,
        ANALYSIS.requirements,
        plan=PLAN,
    )
    assert len({test.id for test in suite.tests}) == 2
    assert suite.tests[1].module == "test_other.py"
    assert suite.tests[1].scenario_ids == ["S1"]
    assert "Renumbered duplicate test id" in suite.notes


def test_html_archives_original_and_repaired_artifacts_and_escapes_code():
    from app.services.report_renderer import render_html_report

    repaired = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={"code": ("# <script>alert(1)</script>\n" + SUITE.tests[0].code)}
                )
            ]
        }
    )
    run = inspecting_agent(
        ANALYSIS,
        PLAN,
        INVALID_SUITE,
        repaired,
        runner=SequenceRunner(
            execution("error"),
            ExecutionResult(
                executions=[], exit_code=-1, timed_out=True, stderr_excerpt="Repair timed out."
            ),
        ),
    ).run(PROJECT)
    html = render_html_report(PROJECT, run)
    assert "Execution history" in html
    assert "Attempt 1" in html and "Attempt 2" in html
    assert "Repair timed out." in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>alert(1)</script>" not in html
    assert "T1: test_shipping.py" in html


def test_full_extracted_coverage_preserves_omitted_source_in_report_and_html():
    from app.services.report_renderer import render_html_report

    partial = RequirementAnalysis(requirements=[ANALYSIS.requirements[0]], notes="")
    run = inspecting_agent(partial, PLAN, SUITE).run(PROJECT)
    assert run.report.requirement_coverage == 1.0
    assert run.report.source_audit.unlinked_fragments[0].text == "Large orders are fast."
    assert any("not established" in issue for issue in run.report.unresolved_issues)
    html = render_html_report(PROJECT, run)
    assert "Specification analysis scope" in html
    assert "Large orders are fast." in html


def test_source_audit_survives_planning_failure_and_progress_checkpoint():
    snapshots = []
    agent = inspecting_agent(ANALYSIS, LLMError("planning unavailable"))
    run = agent.run(PROJECT, on_progress=snapshots.append)
    assert run.report.source_audit is not None
    assert run.report.source_audit == next(
        snapshot.report.source_audit for snapshot in snapshots if snapshot.stage == "plan"
    )


def test_live_edits_after_inspection_do_not_change_execution_input(tmp_path):
    from pathlib import Path

    source = tmp_path / "project"
    source.mkdir()
    original = "def fee(amount_cents: int) -> int:\n    return 0\n"
    (source / "shipping.py").write_text(original)
    settings = Settings(repository_root=tmp_path, _env_file=None)
    project = PROJECT.model_copy(update={"repository_ref": "project"})

    class EditingLLM(FakeLLM):
        def parse(self, **kwargs):
            if kwargs["output_format"] is RequirementAnalysis:
                (source / "shipping.py").write_text(
                    "def fee(amount_cents: int) -> int:\n    return 999\n"
                )
            return super().parse(**kwargs)

    class ReadingRunner(FakeRunner):
        def execute(self, tests, repository_root=None):
            assert Path(repository_root, "shipping.py").read_text() == original
            return super().execute(tests, repository_root)

    runner = ReadingRunner(execution("passed"))
    run = DirectLLMOrchestrator(
        EditingLLM(ANALYSIS, PLAN, SUITE), runner=runner, settings=settings
    ).run(project)
    assert run.report.behaviors[0].verification_status == "Partially Verified"
    assert (
        run.report.execution_attempts[0].result.repository_content_sha256
        == run.report.repository.artifact.content_sha256
    )
    assert runner.roots != [str(source)]


@pytest.mark.parametrize("when", ["before", "during"])
def test_snapshot_tampering_never_produces_trusted_passing_outcomes(when):

    from app.services.repository_snapshot import verified_snapshot_root

    runner = FakeRunner(execution("passed"))
    agent = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=runner)
    repository, _ = agent._inspect(PROJECT, [])
    root = verified_snapshot_root(repository.artifact, agent._settings)

    def tamper():
        file = root / "shipping.py"
        file.chmod(0o644)
        file.write_text("def fee(amount_cents): return 999\n")
        file.chmod(0o444)

    if when == "before":
        tamper()
    else:
        execute = runner.execute

        def change_during_execution(*args, **kwargs):
            result = execute(*args, **kwargs)
            tamper()
            return result

        runner.execute = change_during_execution
    run = agent.run(PROJECT)
    assert run.report.executions == []
    assert run.report.execution_success_rate is None
    assert run.report.behaviors[0].verification_status == "Unverified"
    if when == "before":
        assert run.status == "blocked"
        assert run.report.execution_attempts == []
        assert run.report.project_readiness.status == "blocked"
    else:
        assert run.report.execution_attempts[0].result.snapshot_error
    assert any("integrity check failed" in issue for issue in run.report.unresolved_issues)
    assert len(runner.received) == (0 if when == "before" else 1)


def test_repaired_tests_execute_against_the_same_saved_code_version():
    runner = SequenceRunner(execution("error"), execution("passed"))
    run = inspecting_agent(ANALYSIS, PLAN, INVALID_SUITE, SUITE, runner=runner).run(PROJECT)
    assert len(runner.roots) == 2
    assert len(set(runner.roots)) == 1
    fingerprints = {
        attempt.result.repository_content_sha256 for attempt in run.report.execution_attempts
    }
    assert fingerprints == {run.report.repository.artifact.content_sha256}


def test_legacy_interface_snapshot_is_not_an_execution_input():
    runner = FakeRunner(execution("passed"))
    agent = DirectLLMOrchestrator(FakeLLM(ANALYSIS, PLAN, SUITE), runner=runner)
    agent._inspect = lambda project, events: (REPOSITORY, [])
    run = agent.run(PROJECT)
    assert runner.received == []
    assert run.report.executions == []
    assert any("live repository is refused" in issue for issue in run.report.unresolved_issues)


def test_environment_preparation_failure_does_not_become_a_product_defect():
    result = ExecutionResult(
        executions=[],
        exit_code=-1,
        timed_out=False,
        stderr_excerpt="Sandbox environment could not be established: missing image.",
        environment_error="Sandbox environment could not be established: missing image.",
    )
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(result)).run(PROJECT)
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.executions == []
    assert run.report.execution_success_rate is None
    assert any("missing image" in issue for issue in run.report.unresolved_issues)
    assert not any(item.classification == "suspected_defect" for item in run.report.diagnoses)


def test_blocked_readiness_preserves_requirements_and_skips_planning_generation_execution():
    from app.schemas import ReadinessCheck
    from app.services.report_renderer import render_html_report

    runner = FakeRunner(execution("passed"))
    runner.preflight = lambda *args: ProjectReadiness(
        status="blocked",
        checks=[
            ReadinessCheck(
                kind="dependency",
                subject="missing-package",
                status="failed",
                detail="Install the dependency in a custom sandbox image.",
            )
        ],
    )
    agent = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=runner)
    run = agent.run(PROJECT)
    assert run.status == "blocked"
    assert run.report.requirements == ANALYSIS.requirements
    assert run.report.source_audit
    assert run.report.project_readiness.status == "blocked"
    assert run.report.test_plan is None
    assert run.report.generated_tests == []
    assert runner.received == []
    assert len(agent._llm.responses) == 2
    assert run.report.execution_success_rate is None
    assert "missing-package" in render_html_report(PROJECT, run)
