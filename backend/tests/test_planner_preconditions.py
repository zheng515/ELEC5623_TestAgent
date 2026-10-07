"""Known declarations are not runtime setup; genuine prerequisites still fail closed."""

import pytest
from test_agent import ANALYSIS, PLAN, PROJECT, REPOSITORY, SUITE, FakeLLM, inspecting_agent

from app.services.oracle_review import has_current_oracle_support, review_oracles
from app.services.planner import plan_tests
from app.services.test_validator import validate_test


def planned(preconditions, *, repository=REPOSITORY, assumptions=None, target=None):
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "preconditions": preconditions,
            "assumptions": assumptions or [],
        }
    )
    if target:
        scenario = scenario.model_copy(
            update={
                "check": scenario.check.model_copy(update={"target": target}),
            }
        )
    raw = PLAN.model_copy(update={"scenarios": [scenario]})
    return plan_tests(FakeLLM(raw), PROJECT, ANALYSIS.requirements, repository)


@pytest.mark.parametrize(
    "condition",
    [
        "The shipping.fee function is available.",
        "The function shipping.fee is available.",
        "shipping.fee is available.",
        "The shipping.fee function exists.",
        "The function shipping.fee exists.",
        "shipping.fee exists.",
        "  The shipping.fee function is available.  ",
    ],
)
def test_known_function_declaration_does_not_block_generation(condition):
    plan = planned([condition])
    scenario = plan.scenarios[0]
    assert scenario.preconditions == []
    assert "Removed 1 redundant declaration precondition" in plan.notes
    assert "Runtime imports and dependencies" in plan.notes
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert has_current_oracle_support(reviewed.scenarios[0])
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "validated"


@pytest.mark.parametrize(
    "condition",
    [
        "An account exists.",
        "The database contains an order.",
        "The shipping.fee function is importable.",
        "The shipping.fee function is available in the sandbox.",
        "The shipping.fee function is available and the account exists.",
        "The function is available.",
        "The shipping.missing function is available.",
    ],
)
def test_real_or_ambiguous_prerequisites_remain_blocked(condition):
    plan = planned([condition])
    assert plan.scenarios[0].preconditions == [condition]
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert not has_current_oracle_support(reviewed.scenarios[0])
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "needs_review"


def test_mixed_setup_and_assumptions_are_preserved():
    plan = planned(
        ["The shipping.fee function is available.", "An account exists."],
        assumptions=["The account is active."],
    )
    assert plan.scenarios[0].preconditions == ["An account exists."]
    assert plan.scenarios[0].assumptions == ["The account is active."]
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert reviewed.scenarios[0].oracle_grounding.status == "needs_review"


def test_declared_function_does_not_resolve_business_assumptions():
    plan = planned(["The shipping.fee function is available."], assumptions=["Currency unknown."])
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert reviewed.scenarios[0].oracle_grounding.status == "needs_review"


def test_missing_repository_cannot_confirm_function_declaration():
    condition = "The shipping.fee function is available."
    assert planned([condition], repository=None).scenarios[0].preconditions == [condition]


def test_unknown_target_cannot_be_confirmed_by_another_function():
    condition = "The shipping.missing function is available."
    assert planned([condition], target="shipping.missing").scenarios[0].preconditions == [condition]


def test_missing_contract_cannot_resolve_declaration():
    raw = PLAN.model_copy(
        update={
            "scenarios": [
                PLAN.scenarios[0].model_copy(
                    update={
                        "check": None,
                        "preconditions": ["The shipping.fee function is available."],
                    }
                )
            ]
        }
    )
    plan = plan_tests(FakeLLM(raw), PROJECT, ANALYSIS.requirements, REPOSITORY)
    assert plan.scenarios[0].preconditions == ["The shipping.fee function is available."]


def test_pipeline_generates_code_after_removing_known_declaration():
    raw = PLAN.model_copy(
        update={
            "scenarios": [
                PLAN.scenarios[0].model_copy(
                    update={
                        "preconditions": ["The shipping.fee function is available."],
                    }
                )
            ]
        }
    )
    run = inspecting_agent(ANALYSIS, raw, SUITE).run(PROJECT)
    assert len(run.report.generated_tests) == 1
    assert run.report.generated_tests[0].validation_status == "validated"
    assert run.report.test_plan.scenarios[0].preconditions == []
    assert run.report.executed_tests == 0


RUNTIME_CAVEAT = (
    "The module can be imported when the scenario is executed; "
    "the supplied interface declaration does not establish runtime importability."
)


def test_generic_runtime_caveat_is_recorded_separately_from_business_assumptions():
    plan = planned([], assumptions=[RUNTIME_CAVEAT])
    assert plan.scenarios[0].assumptions == []
    assert RUNTIME_CAVEAT in plan.notes
    assert "Import success is not established" in plan.notes
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert has_current_oracle_support(reviewed.scenarios[0])
    assert validate_test(SUITE.tests[0], reviewed, REPOSITORY).validation_status == "validated"


def test_runtime_caveat_does_not_remove_real_business_assumptions():
    plan = planned([], assumptions=[RUNTIME_CAVEAT, "Currency unknown."])
    assert plan.scenarios[0].assumptions == ["Currency unknown."]
    reviewed = review_oracles(FakeLLM(), PROJECT, ANALYSIS.requirements, plan, REPOSITORY)
    assert not has_current_oracle_support(reviewed.scenarios[0])


@pytest.mark.parametrize("repository, target", [(None, None), (REPOSITORY, "shipping.missing")])
def test_runtime_caveat_is_not_moved_without_a_known_target(repository, target):
    plan = planned([], repository=repository, target=target, assumptions=[RUNTIME_CAVEAT])
    assert plan.scenarios[0].assumptions == [RUNTIME_CAVEAT]
