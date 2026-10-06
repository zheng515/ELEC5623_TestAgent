"""Source support is assessed independently; citations are verified by the server."""

import json

import pytest
from test_agent import (
    ANALYSIS,
    PLAN,
    PROJECT,
    REPOSITORY,
    SUITE,
    FakeLLM,
    FakeRunner,
    execution,
    inspecting_agent,
)

from app.schemas import OracleReview
from app.services.llm import LLMError
from app.services.oracle_review import review_oracles
from app.services.report_renderer import render_html_report
from app.services.test_validator import validate_test


def decision(verdict="supported", **updates):
    item = {
        "scenario_id": "S1",
        "verdict": verdict,
        "rationale": "The source states free shipping at this threshold.",
        "citations": [{"requirement_id": "R1", "quote": ANALYSIS.requirements[0].source_quote}],
    }
    item.update(updates)
    return item


@pytest.mark.parametrize("verdict", ["contradicted", "insufficient"])
def test_wrong_plan_oracle_is_excluded_even_when_generated_code_matches_it(verdict):
    wrong = PLAN.scenarios[0].model_copy(
        update={
            "check": PLAN.scenarios[0].check.model_copy(update={"expected_value": 999}),
            "expected_result": "Shipping costs 999 cents.",
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [wrong]})
    suite = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={
                        "code": SUITE.tests[0].code.replace("== 0", "== 999"),
                    }
                )
            ]
        }
    )
    review = OracleReview(
        decisions=[decision(verdict, rationale="The requirement says free, not 999.")]
    )
    runner = FakeRunner(execution("failed"))
    run = inspecting_agent(ANALYSIS, plan, review, suite, runner=runner).run(PROJECT)
    grounding = run.report.test_plan.scenarios[0].oracle_grounding
    assert grounding.status == "needs_review"
    assert grounding.verdict == verdict
    assert "free, not 999" in grounding.rationale
    assert run.report.generated_tests == []
    assert "generation was skipped" in run.report.summary or any(
        "generation was skipped" in issue for issue in run.report.unresolved_issues
    )
    assert run.report.requirement_coverage == 0
    assert run.report.executed_tests == 0
    assert runner.received == []
    assert not any(item.classification == "suspected_defect" for item in run.report.diagnoses)
    html = render_html_report(PROJECT, run)
    assert "Original-source oracle review" in html
    assert "free, not 999" in html


@pytest.mark.parametrize(
    "decisions",
    [
        [],
        [decision(), decision()],
        [decision(scenario_id="invented")],
        [decision(citations=[])],
        [decision(citations=[{"requirement_id": "R1", "quote": "Invented rule"}])],
        [decision(citations=[{"requirement_id": "R2", "quote": "Large orders are fast."}])],
        [decision(citations=[{"requirement_id": "R1", "quote": " "}])],
        [decision(rationale=" ")],
    ],
)
def test_support_verdict_cannot_bypass_server_evidence_checks(decisions):
    reviewed = review_oracles(
        FakeLLM(OracleReview(decisions=decisions)), PROJECT, ANALYSIS.requirements, PLAN
    )
    assert reviewed.scenarios[0].oracle_grounding.status == "needs_review"
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "needs_review"


def test_reconstructed_requirement_quote_is_not_original_source_evidence():
    fake_source = ANALYSIS.requirements[0].model_copy(
        update={"source_quote": "Shipping costs 999."}
    )
    review = OracleReview(
        decisions=[
            decision(citations=[{"requirement_id": "R1", "quote": fake_source.source_quote}])
        ]
    )
    reviewed = review_oracles(FakeLLM(review), PROJECT, [fake_source], PLAN)
    assert reviewed.scenarios[0].oracle_grounding.status == "needs_review"


def test_review_failure_replaces_previous_support_and_fails_closed():
    class Unavailable:
        def parse(self, **kwargs):
            raise LLMError("Review service unavailable.")

    reviewed = review_oracles(Unavailable(), PROJECT, ANALYSIS.requirements, PLAN)
    assert reviewed.scenarios[0].oracle_grounding.status == "needs_review"
    assert any("unavailable" in issue for issue in reviewed.scenarios[0].oracle_grounding.issues)
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "needs_review"


def test_review_api_failure_does_not_create_execution_or_defect_evidence():
    class ReviewUnavailable(FakeLLM):
        def parse(self, *, output_format, **kwargs):
            if output_format is OracleReview:
                raise LLMError("Review API unavailable.")
            return super().parse(output_format=output_format, **kwargs)

    runner = FakeRunner(execution("failed"))
    agent = inspecting_agent(ANALYSIS, PLAN, SUITE, runner=runner)
    agent._llm = ReviewUnavailable(ANALYSIS, PLAN, SUITE)
    run = agent.run(PROJECT)
    assert run.status == "completed"
    assert runner.received == []
    assert run.report.execution_attempts == []
    assert run.report.requirement_coverage == 0
    assert any("Review API unavailable" in issue for issue in run.report.unresolved_issues)


def test_independent_request_contains_original_source_and_exact_contract_without_prior_approval():
    llm = FakeLLM(OracleReview(decisions=[decision()]))
    reviewed = review_oracles(llm, PROJECT, ANALYSIS.requirements, PLAN, REPOSITORY)
    data = json.loads(llm.review_prompts[0])
    assert data["original_requirements"] == PROJECT.requirements_text
    assert data["scenarios"][0]["check"]["expected_value"] == 0
    assert "oracle_grounding" not in data["scenarios"][0]
    assert reviewed.scenarios[0].oracle_grounding.status == "supported"
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "validated"


@pytest.mark.parametrize(
    "update",
    [
        {"expected_result": "A changed expectation."},
        {"check": PLAN.scenarios[0].check.model_copy(update={"expected_value": 999})},
        {"requirement_ids": ["R2"]},
    ],
)
def test_changed_scenario_cannot_reuse_a_saved_support_assessment(update):
    changed = PLAN.scenarios[0].model_copy(update=update)
    checked = validate_test(
        SUITE.tests[0], PLAN.model_copy(update={"scenarios": [changed]}), REPOSITORY
    )
    assert checked.validation_status == "needs_review"
    assert any("current original-source support" in issue for issue in checked.validation_issues)


def test_missing_oracle_review_on_old_plan_cannot_establish_new_validation():
    scenario = PLAN.scenarios[0].model_copy(update={"oracle_grounding": None})
    assert (
        validate_test(
            SUITE.tests[0], PLAN.model_copy(update={"scenarios": [scenario]}), REPOSITORY
        ).validation_status
        == "needs_review"
    )


def test_oracle_review_schema_is_supported_by_the_sdk():
    from anthropic import transform_schema

    transformed = transform_schema(OracleReview)
    assert transformed["type"] == "object"
