"""Incremental runs (watch mode): real repositories change between runs; the model is faked."""

import json
from datetime import UTC, datetime

import pytest
from test_agent import FakeLLM, FakeRunner

from app.core.config import Settings
from app.schemas import (
    ExecutedTest,
    ExecutionResult,
    GeneratedTest,
    GeneratedTestSuite,
    Project,
    RequirementAnalysis,
    RequirementItem,
    ScenarioCheck,
)
from app.schemas import TestPlan as ScenarioPlan
from app.schemas import TestScenario as Scenario
from app.services.incremental import (
    baseline_problem,
    diff_interfaces,
    focus_targets,
    next_number,
    renumber_tests,
)
from app.services.inspector import inspect_repository
from app.services.orchestrator import DirectLLMOrchestrator
from app.services.planner import INCREMENTAL

FEE = "def fee(amount_cents: int) -> int:\n    return 0 if amount_cents >= 10000 else 500\n"
REFUND = "\n\ndef refund(amount_cents: int) -> int:\n    return amount_cents\n"

PROJECT = Project(
    id="p1",
    name="Shipping",
    repository_ref="repo",
    requirements_text="Orders of at least 100 dollars ship free. Refunds return the full amount.",
    goal="Check the rules.",
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
            text="A refund returns the full amount.",
            source_quote="Refunds return the full amount.",
            testable=True,
            ambiguity=None,
        ),
    ],
    notes="",
)


def scenario(identifier, requirement, target, argument, expected):
    return Scenario(
        id=identifier,
        requirement_ids=[requirement],
        title=f"{target} with {argument}",
        category="nominal",
        preconditions=[],
        inputs=[str(argument)],
        steps=[f"Call {target}."],
        expected_result=str(expected),
        evidence_refs=[f"requirement:{requirement}"],
        assumptions=[],
        check=ScenarioCheck(
            target=target, arguments=[argument], operator="equals", expected_value=expected
        ),
    )


def make_test(identifier, scenario_id, module, function, call, expected):
    name = f"test_{function}"
    return GeneratedTest(
        id=identifier,
        requirement_ids=[],
        scenario_ids=[scenario_id],
        name=name,
        module=module,
        code=f"from shipping import {function}\n\ndef {name}():\n    assert {call} == {expected}\n",
        rationale="Fixture.",
    )


BASE_PLAN = ScenarioPlan(scenarios=[scenario("S1", "R1", "shipping.fee", 10000, 0)], notes="")
BASE_SUITE = GeneratedTestSuite(
    tests=[make_test("T1", "S1", "test_shipping.py", "fee", "fee(10000)", 0)], notes=""
)
# The model reuses an existing id and module name; the server must renumber both.
REFUND_PLAN = ScenarioPlan(scenarios=[scenario("S1", "R2", "shipping.refund", 500, 500)], notes="")
REFUND_SUITE = GeneratedTestSuite(
    tests=[make_test("T1", "S2", "test_shipping.py", "refund", "refund(500)", 500)], notes=""
)


def outcomes(*items) -> ExecutionResult:
    return ExecutionResult(
        executions=[
            ExecutedTest(
                test_id=test_id,
                module=module,
                name=name,
                outcome=outcome,
                duration_seconds=0.01,
                message="" if outcome == "passed" else "assert detail",
            )
            for test_id, module, name, outcome in items
        ],
        exit_code=0 if all(item[3] == "passed" for item in items) else 1,
        timed_out=False,
        stderr_excerpt="",
    )


FEE_PASSED = ("T1", "test_generated_1.py", "test_scenario_1", "passed")


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "shipping.py").write_text(FEE)
    return root


@pytest.fixture
def settings(tmp_path):
    return Settings(repository_root=tmp_path, sandbox_enabled=False, _env_file=None)


def agent(settings, *responses, result=None):
    llm = FakeLLM(*responses)
    runner = FakeRunner(result or outcomes(FEE_PASSED))
    return DirectLLMOrchestrator(llm, runner=runner, settings=settings), llm, runner


@pytest.fixture
def baseline(repo, settings):
    orchestrator, _, _ = agent(settings, ANALYSIS, BASE_PLAN, BASE_SUITE)
    run = orchestrator.run(PROJECT)
    assert run.status == "completed"
    assert run.report.generated_tests[0].validation_status == "validated"
    return run


def test_a_new_function_gets_new_tests_while_carried_tests_run_again(repo, settings, baseline):
    (repo / "shipping.py").write_text(FEE + REFUND)
    orchestrator, llm, runner = agent(
        settings,
        REFUND_PLAN,
        REFUND_SUITE,
        result=outcomes(FEE_PASSED, ("T2", "test_generated_1_t2.py", "test_scenario_1", "passed")),
    )

    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    change = run.report.change
    assert run.status == "completed"
    assert change.baseline_run_id == baseline.id
    assert change.added == ["shipping.refund"]
    assert change.new_scenario_ids == ["S2"]
    assert change.new_test_ids == ["T2"]
    assert change.carried_test_ids == ["T1"]
    assert change.untraced == [] and change.regressions == []
    # Requirements are reused; only planning and independent review ask the model.
    assert len(llm.prompts) == 1
    assert json.loads(llm.prompts[0])["focus_functions"] == ["shipping.refund"]
    assert [item["id"] for item in json.loads(llm.prompts[0])["existing_scenarios"]] == ["S1"]
    tests = {item.id: item for item in run.report.generated_tests}
    assert tests["T2"].module == "test_generated_1_t2.py"
    assert all(item.validation_status == "validated" for item in tests.values())
    assert [item.id for item in runner.received[0]] == ["T1", "T2"]
    assert [item.id for item in run.report.test_plan.scenarios] == ["S1", "S2"]
    statuses = {item.requirement_id: item.verification_status for item in run.report.behaviors}
    assert statuses == {"R1": "Partially Verified", "R2": "Partially Verified"}
    assert "incremental run against baseline" in run.report.summary


def test_the_planner_is_told_to_plan_only_for_focus_functions(repo, settings, baseline):
    (repo / "shipping.py").write_text(FEE + REFUND)
    systems = []
    orchestrator, llm, _ = agent(settings, REFUND_PLAN, REFUND_SUITE)
    original = llm.parse

    def recording(*, system, prompt, output_format):
        systems.append(system)
        return original(system=system, prompt=prompt, output_format=output_format)

    llm.parse = recording
    orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    assert INCREMENTAL in systems[0]


def test_new_code_without_a_requirement_is_reported_not_tested(repo, settings, baseline):
    (repo / "shipping.py").write_text(FEE + "\n\ndef discount(code: str) -> int:\n    return 0\n")
    # The model tries to re-plan an old function; only focus functions may get scenarios.
    stray = ScenarioPlan(
        scenarios=[scenario("S9", "R1", "shipping.fee", 20000, 0)],
        notes="discount: no requirement describes it.",
    )
    orchestrator, llm, _ = agent(settings, stray)

    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    change = run.report.change
    assert change.added == ["shipping.discount"]
    assert change.new_scenario_ids == [] and change.new_test_ids == []
    assert change.untraced == ["shipping.discount"]
    assert any("no requirement-backed scenario" in item for item in run.report.unresolved_issues)
    assert len(llm.prompts) == 1  # planning only; nothing to generate


def test_an_implementation_change_reruns_carried_tests_without_the_model(repo, settings, baseline):
    (repo / "shipping.py").write_text(FEE.replace("return 0 if", "return 1 if"))
    orchestrator, llm, runner = agent(
        settings, result=outcomes(("T1", "test_generated_1.py", "test_scenario_1", "failed"))
    )

    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    change = run.report.change
    assert llm.prompts == []
    assert change.content_changed is True
    assert change.added == change.changed == change.removed == []
    assert [item.id for item in runner.received[0]] == ["T1"]
    assert change.regressions == ["T1::test_scenario_1: passed at the baseline, failed now"]
    assert any(
        item.startswith("Regression: T1::test_scenario_1") for item in run.report.unresolved_issues
    )


def test_carried_tests_are_never_refined(repo, settings, baseline):
    (repo / "shipping.py").write_text(FEE + "# touched\n")
    error = ("T1", "test_generated_1.py", "test_scenario_1", "error")
    result = outcomes(error)
    result.executions[0].message = "fixture 'missing_fixture' not found"
    orchestrator, llm, runner = agent(settings, result=result)

    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    assert llm.prompts == []
    assert len(runner.received) == 1
    assert run.report.refinement_iterations == 0


def test_a_removed_function_invalidates_the_tests_that_call_it(repo, settings, baseline):
    (repo / "shipping.py").write_text(REFUND.lstrip())
    orchestrator, _, runner = agent(settings, ScenarioPlan(scenarios=[], notes=""))

    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)

    change = run.report.change
    assert change.removed == ["shipping.fee"]
    assert change.invalidated_tests and change.invalidated_tests[0].startswith("T1: ")
    assert runner.received == []  # nothing validated is left to execute
    assert any("no longer validates" in item for item in run.report.unresolved_issues)


def test_without_a_usable_baseline_the_full_workflow_creates_one(repo, settings, baseline):
    failed = baseline.model_copy(update={"status": "failed"})
    orchestrator, llm, _ = agent(settings, ANALYSIS, BASE_PLAN, BASE_SUITE)

    run = orchestrator.run(PROJECT, incremental=True, baseline=failed)

    assert run.status == "completed"
    assert run.report.change is None
    assert len(llm.prompts) == 2
    assert any("No usable baseline run: it ended as failed" in e.message for e in run.events)


def test_an_unreadable_repository_stops_an_incremental_check(repo, settings, baseline):
    project = PROJECT.model_copy(update={"repository_ref": "missing"})
    orchestrator, llm, runner = agent(settings)

    run = orchestrator.run(project, incremental=True, baseline=baseline)

    assert run.status == "blocked"
    assert run.stage == "inspect"
    assert llm.prompts == [] and runner.received == []
    assert any("Repository not read" in item for item in run.report.unresolved_issues)


def test_interface_diffs_ignore_docs_and_separate_functions_from_classes(tmp_path, settings):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "shipping.py").write_text(
        'def fee(x):\n    "Old doc."\n\nclass Order:\n    def total(self): ...\n'
    )
    before = inspect_repository("repo", settings).callables
    (root / "shipping.py").write_text(
        'def fee(x):\n    "New doc."\n\nclass Order:\n    def total(self, tax): ...\n'
        "    def notes(self): ...\n\nasync def track(order): ...\n"
    )
    after = inspect_repository("repo", settings).callables

    diff = diff_interfaces(before, after)

    assert diff.changed == ["shipping.Order.total"]
    assert diff.added == ["shipping.Order.notes", "shipping.track"]
    assert focus_targets(diff, after) == ["shipping.track"]


def test_baselines_must_match_inputs_and_current_rules(baseline):
    assert baseline_problem(baseline, baseline.input_sha256) is None
    assert baseline_problem(None, "x") == "no completed run exists yet"
    assert baseline_problem(baseline, "other") == "its project inputs differ"
    legacy = baseline.model_copy(deep=True)
    legacy.report.repository.callables = None
    assert baseline_problem(legacy, baseline.input_sha256) == "it has no comparable code snapshot"
    old_rules = baseline.model_copy(deep=True)
    old_rules.report.validation_version = 1
    assert "earlier validation rules" in baseline_problem(old_rules, baseline.input_sha256)


def test_new_ids_continue_the_baseline_numbering():
    carried = [BASE_SUITE.tests[0].model_copy(update={"id": "T7"})]
    renumbered = renumber_tests([REFUND_SUITE.tests[0], REFUND_SUITE.tests[0]], carried)

    assert [item.id for item in renumbered] == ["T8", "T9"]
    assert [item.module for item in renumbered] == ["test_shipping_t8.py", "test_shipping_t9.py"]
    assert next_number(["S1", "S12", "custom"], "S") == 13


def test_the_html_report_lists_what_changed_and_how_the_suite_grew(repo, settings, baseline):
    from app.services.report_renderer import render_html_report

    (repo / "shipping.py").write_text(FEE + REFUND)
    orchestrator, _, _ = agent(settings, REFUND_PLAN, REFUND_SUITE)
    run = orchestrator.run(PROJECT, incremental=True, baseline=baseline)
    run = run.model_copy(update={"trigger": "watch"})

    html = render_html_report(PROJECT, run)

    assert "Changes since the baseline run" in html
    assert "Started by repository watching." in html
    assert "<li>shipping.refund</li>" in html
    assert "New tests (1)" in html
    assert render_html_report(PROJECT, baseline).count("Changes since the baseline run") == 0
