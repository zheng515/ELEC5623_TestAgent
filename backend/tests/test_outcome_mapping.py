"""A failure belongs to validated functions, not every requirement in a file."""

import re

import pytest
from test_agent import ANALYSIS, PLAN, PROJECT, SUITE, FakeRunner, execution, inspecting_agent

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
def test_independent_requirement_keeps_its_passing_evidence(second_outcome):
    project, analysis, plan, suite = mixed_requirement_inputs()
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


def test_shared_function_failure_remains_unverified_for_both_requirements():
    project, analysis, plan, suite = mixed_requirement_inputs(shared_function=True)
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(execution("failed"))).run(
        project
    )
    assert [item.verification_status for item in run.report.behaviors] == [
        "Unverified",
        "Unverified",
    ]
    assert [item.evidence_refs for item in run.report.behaviors] == [["E1"], ["E1"]]


def test_later_independent_function_can_pass_after_an_earlier_failure():
    project, analysis, plan, suite = mixed_requirement_inputs()
    result = execution("failed", "passed")
    result.executions[1].name = "test_paid_shipping"
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    assert [item.verification_status for item in run.report.behaviors] == [
        "Unverified",
        "Partially Verified",
    ]
    assert [item.evidence_refs for item in run.report.behaviors] == [["E1"], ["E2"]]


def test_html_flags_historical_mapping_without_rewriting_saved_conclusions():
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
def test_outcome_with_wrong_identity_cannot_verify_a_requirement(field, value):
    result = execution("passed")
    setattr(result.executions[0], field, value)
    run = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=FakeRunner(result)).run(PROJECT)
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.behaviors[0].evidence_refs == []
    assert run.report.evidence[0]["outcome"] == "passed"


def test_collection_error_cannot_substitute_for_a_missing_function_outcome():
    project, analysis, plan, suite = mixed_requirement_inputs()
    result = execution("passed", "error")
    result.executions[1].name = "test_shipping"
    result.executions[1].message = "Collection failed."
    run = inspecting_agent(analysis, plan, suite, runner=FakeRunner(result)).run(project)
    assert run.report.behaviors[0].verification_status == "Partially Verified"
    assert run.report.behaviors[1].verification_status == "Unverified"
    assert run.report.behaviors[1].evidence_refs == []
    assert len(run.report.evidence) == 2
