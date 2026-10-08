"""A failure belongs to validated functions, not every requirement in a file."""

import re

import pytest
from test_agent import (
    ANALYSIS,
    PLAN,
    PROJECT,
    SUITE,
    FakeRunner,
    execution,
    inspecting_agent,
    install_generated_suite,
)

from app.schemas import ScenarioCheck
from app.services.report_renderer import render_html_report


def mixed_requirement_inputs(*, shared_function=False):
    project = PROJECT.model_copy(
        update={
            "requirements_text": (
                "Orders of at least 100 dollars ship free. Smaller orders cost 10 dollars."
            )
        }
    )
    second_requirement = ANALYSIS.requirements[1].model_copy(
        update={
            "text": "Smaller orders cost 10 dollars.",
            "source_quote": "Smaller orders cost 10 dollars.",
            "testable": True,
            "ambiguity": None,
        }
    )
    analysis = ANALYSIS.model_copy(
        update={"requirements": [ANALYSIS.requirements[0], second_requirement]}
    )
    second = PLAN.scenarios[0].model_copy(
        update={
            "id": "S2",
            "requirement_ids": ["R2"],
            "title": "Shipping below threshold",
            "expected_result": "Shipping costs 10 dollars.",
            "evidence_refs": ["requirement:R2"],
            "check": ScenarioCheck(
                target="shipping.fee", arguments=[9999], operator="equals", expected_value=1000
            ),
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [*PLAN.scenarios, second]})
    code = SUITE.tests[0].code + (
        "    assert fee(9999) == 1000\n"
        if shared_function
        else "\ndef test_paid_shipping():\n    assert fee(9999) == 1000\n"
    )
    suite = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={
                        "scenario_ids": ["S1", "S2"],
                        "requirement_ids": ["R1", "R2"],
                        "code": code,
                    }
                )
            ]
        }
    )
    return project, analysis, plan, suite


@pytest.mark.parametrize("second_outcome", ["failed", "error", "skipped", "missing"])
def test_independent_requirement_keeps_its_passing_evidence(second_outcome, monkeypatch):
    project, analysis, plan, suite = mixed_requirement_inputs()
    install_generated_suite(monkeypatch, suite)
    result = (
        execution("passed") if second_outcome == "missing" else execution("passed", second_outcome)
    )
    if len(result.executions) > 1:
        result.executions[1].name = "test_paid_shipping"
        result.executions[1].message = "Recorded execution outcome."
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    assert run.report.outcome_mapping_version == 1
    behaviors = {item.requirement_id: item for item in run.report.behaviors}
    assert behaviors["R1"].verification_status == "Partially Verified"
    assert behaviors["R1"].evidence_refs == ["E1"]
    assert behaviors["R2"].verification_status == "Unverified"
    assert behaviors["R2"].evidence_refs == ([] if second_outcome == "missing" else ["E2"])
    html = render_html_report(project, run)
    mapping = html.split("<h2>Requirement-to-test mapping</h2>")[1].split("</table>")[0]
    rows = re.findall(r"<tr><td><strong>R[12]</strong>.*?</tr>", mapping)
    assert len(rows) == 2
    assert "test_free_shipping_at_threshold: passed" in rows[0]
    assert "test_paid_shipping" not in rows[0]
    assert "test_free_shipping_at_threshold" not in rows[1]


def test_shared_function_failure_remains_unverified_for_both_requirements(monkeypatch):
    project, analysis, plan, suite = mixed_requirement_inputs(shared_function=True)
    install_generated_suite(monkeypatch, suite)
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(execution("failed"))).run(
        project
    )
    assert [item.verification_status for item in run.report.behaviors] == [
        "Unverified",
        "Unverified",
    ]
    assert [item.evidence_refs for item in run.report.behaviors] == [["E1"], ["E1"]]


def test_later_independent_function_can_pass_after_an_earlier_failure(monkeypatch):
    project, analysis, plan, suite = mixed_requirement_inputs()
    install_generated_suite(monkeypatch, suite)
    result = execution("failed", "passed")
    result.executions[1].name = "test_paid_shipping"
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    assert [item.verification_status for item in run.report.behaviors] == [
        "Unverified",
        "Partially Verified",
    ]
    assert [item.evidence_refs for item in run.report.behaviors] == [["E1"], ["E2"]]


def test_html_flags_historical_mapping_without_rewriting_saved_conclusions(monkeypatch):
    install_generated_suite(monkeypatch, SUITE)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    run.report.outcome_mapping_version = None
    before = run.model_dump_json()
    html = render_html_report(PROJECT, run)
    assert "Historical conclusions have not been recalculated" in html
    assert run.model_dump_json() == before


@pytest.mark.parametrize(
    "field,value", [("module", "test_other.py"), ("test_id", "T2"), ("name", "unknown")]
)
def test_outcome_with_wrong_identity_cannot_verify_a_requirement(field, value, monkeypatch):
    install_generated_suite(monkeypatch, SUITE)
    result = execution("passed")
    setattr(result.executions[0], field, value)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(result)).run(PROJECT)
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.behaviors[0].evidence_refs == []
    assert run.report.evidence[0]["outcome"] == "passed"


def test_collection_error_cannot_substitute_for_a_missing_function_outcome(monkeypatch):
    project, analysis, plan, suite = mixed_requirement_inputs()
    install_generated_suite(monkeypatch, suite)
    result = execution("passed", "error")
    result.executions[1].name = "test_shipping"
    result.executions[1].message = "Collection failed."
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    assert run.report.behaviors[0].verification_status == "Partially Verified"
    assert run.report.behaviors[1].verification_status == "Unverified"
    assert run.report.behaviors[1].evidence_refs == []
    assert len(run.report.evidence) == 2



def test_scenario_attribution_is_exact_and_ignores_unchecked_artifacts(monkeypatch):
    from app.services.outcome_mapping import scenario_evidence_refs

    project, analysis, plan, suite = mixed_requirement_inputs()
    install_generated_suite(monkeypatch, suite)
    result = execution("passed", "failed")
    result.executions[1].name = "test_paid_shipping"
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    mapped = scenario_evidence_refs(plan, run.report.generated_tests, run.report.executions)
    assert mapped["S1"] == ["E1"]
    assert mapped["S2"] == ["E2"]
    unchecked = [
        test.model_copy(update={"validation_status": "not_checked"})
        for test in run.report.generated_tests
    ]
    assert not any(scenario_evidence_refs(plan, unchecked, run.report.executions).values())
    wrong = [item.model_copy(update={"module": "test_other.py"}) for item in run.report.executions]
    assert not any(scenario_evidence_refs(plan, run.report.generated_tests, wrong).values())


def test_html_uses_saved_evidence_refs_and_never_remaps_historical_scenarios(monkeypatch):
    install_generated_suite(monkeypatch, SUITE)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    run.report.behaviors[0].evidence_refs = []
    run.report.scenario_evidence_refs = {"S1": []}
    html = render_html_report(PROJECT, run)
    mapping = html.split("<h2>Requirement-to-test mapping</h2>")[1].split("</table>")[0]
    plan = html.split("<h2>Test plan</h2>")[1].split("<h2>Code-to-plan validation</h2>")[0]
    assert "No attributable outcome" in mapping
    assert "passed" not in mapping
    assert "No attributable execution outcome recorded" in plan
    run.report.scenario_evidence_refs = None
    legacy = render_html_report(PROJECT, run)
    assert "No saved scenario outcome attribution" in legacy
    legacy_plan = legacy.split("<h2>Test plan</h2>")[1].split("<h2>Code-to-plan validation</h2>")[0]
    assert "test_free_shipping_at_threshold: passed" not in legacy_plan


def test_html_interim_report_includes_saved_inputs_activity_and_escaped_ambiguity(monkeypatch):
    from app.schemas import ProjectCreate, RunEvent

    install_generated_suite(monkeypatch, SUITE)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    run.status = "running"
    run.inputs = ProjectCreate(
        name="Original", requirements_text="Original <rule>",
        repository_ref="https://github.com/example/original", goal="Original goal",
    )
    run.events.append(RunEvent(
        id="<event>", stage="generate", created_at=run.created_at,
        message="<script>event</script>",
    ))
    run.report.requirements[0].ambiguity = "<unknown>"
    html = render_html_report(PROJECT, run)
    assert "Interim report" in html and "Original goal" in html
    assert "https://github.com/example/original" in html and "Original &lt;rule&gt;" in html
    assert "Activity record" in html and "not test execution evidence" in html
    assert "&lt;script&gt;event&lt;/script&gt;" in html and "<script>event</script>" not in html
    assert "Ambiguity: &lt;unknown&gt;" in html
    assert "Saved validation version" in html and "current validation version" in html


def test_html_preserves_legacy_execution_records_without_reconstructing_attribution():
    from app.schemas import VerificationRun

    # Old serialized reports can contain raw pytest outcomes without the later evidence table.
    run = VerificationRun.model_validate({
        "id": "legacy-run", "project_id": PROJECT.id, "status": "completed",
        "created_at": PROJECT.created_at.isoformat(), "input_sha256": "legacy", "events": [],
        "report": {
            "summary": "Saved legacy report", "executed_tests": 1,
            "requirements": [item.model_dump(mode="json") for item in ANALYSIS.requirements],
            "test_plan": PLAN.model_dump(mode="json"),
            "generated_tests": [item.model_dump(mode="json") for item in SUITE.tests],
            "behaviors": [{
                "id": "B1", "requirement_id": "R1", "source_quote": "Saved source",
                "description": "Saved conclusion", "evidence_refs": ["E1"],
            }],
            "executions": [{
                "test_id": "T1", "module": "test_legacy.py", "name": "test_original",
                "outcome": "passed", "duration_seconds": 0.01, "message": "Saved <detail>",
            }],
        },
    })
    assert run.report.evidence == [] and run.report.scenario_evidence_refs is None
    before = run.model_dump_json()
    html = render_html_report(PROJECT, run)
    evidence = html.split("<h2>Execution evidence</h2>")[1].split("<h2>Activity record</h2>")[0]
    assert "test_legacy.py::test_original" in evidence and "passed" in evidence
    assert "Saved &lt;detail&gt;" in evidence and "Saved <detail>" not in html
    assert "No evidence IDs were saved" in evidence and "Not recorded" in evidence
    assert "No execution evidence recorded" not in evidence
    assert "No test execution outcomes are recorded" not in html
    mapping = html.split("<h2>Requirement-to-test mapping</h2>")[1].split("</table>")[0]
    plan = html.split("<h2>Test plan</h2>")[1].split("<h2>Code-to-plan validation</h2>")[0]
    assert "E1: referenced evidence was not recorded" in mapping
    assert "passed" not in mapping and "passed" not in plan
    assert "No saved scenario outcome attribution" in plan
    assert "Historical conclusions have not been recalculated" in html
    assert run.model_dump_json() == before
