"""Do not spend a generation request on scenarios that cannot execute."""

import pytest
from test_agent import ANALYSIS, PLAN, PROJECT, REPOSITORY, SUITE, FakeLLM

from app.services.generator import generate_tests


@pytest.mark.parametrize("reason", ["missing", "rejected", "changed"])
def test_no_current_support_skips_the_model_request(reason):
    scenario = PLAN.scenarios[0]
    if reason == "missing":
        scenario = scenario.model_copy(update={"oracle_grounding": None})
    elif reason == "rejected":
        scenario = scenario.model_copy(
            update={
                "oracle_grounding": scenario.oracle_grounding.model_copy(
                    update={"status": "needs_review"}
                )
            }
        )
    else:
        scenario = scenario.model_copy(update={"expected_result": "Changed expectation."})
    llm = FakeLLM()
    result = generate_tests(
        llm,
        PROJECT,
        ANALYSIS.requirements,
        REPOSITORY,
        plan=PLAN.model_copy(update={"scenarios": [scenario]}),
    )
    assert llm.prompts == []
    assert result.tests == []
    assert "generation was skipped" in result.notes
    assert "S1" in result.notes


def test_mixed_plan_only_sends_supported_scenarios_to_generation():
    rejected = PLAN.scenarios[0].model_copy(
        update={
            "id": "S2",
            "title": "Unsupported oracle",
            "oracle_grounding": None,
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [*PLAN.scenarios, rejected]})
    llm = FakeLLM(SUITE)
    result = generate_tests(llm, PROJECT, ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert len(result.tests) == 1
    assert result.tests[0].validation_status == "validated"
    assert "Unsupported oracle" not in llm.prompts[0]
    assert '"S2"' not in llm.prompts[0]
    assert "S2" in result.notes
    assert len(plan.scenarios) == 2
