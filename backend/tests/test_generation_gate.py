"""Do not spend a generation request on scenarios that cannot execute."""

import pytest
from test_agent import ANALYSIS, PLAN, PROJECT, REPOSITORY, FakeLLM

from app.schemas import ScenarioCheck
from app.services.generator import generate_tests
from app.services.oracle_review import review_oracles


@pytest.mark.parametrize("reason", ["missing", "rejected", "changed"])
def test_no_current_support_skips_template_generation(reason):
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
    result = generate_tests(
        ANALYSIS.requirements,
        REPOSITORY,
        plan=PLAN.model_copy(update={"scenarios": [scenario]}),
    )
    assert result.tests == []
    assert "generation was skipped" in result.notes
    assert "S1" in result.notes


def test_mixed_plan_only_renders_supported_scenarios():
    rejected = PLAN.scenarios[0].model_copy(
        update={
            "id": "S2",
            "title": "Unsupported oracle",
            "oracle_grounding": None,
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [*PLAN.scenarios, rejected]})
    result = generate_tests(ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert len(result.tests) == 1
    assert result.tests[0].validation_status == "validated"
    assert result.tests[0].scenario_ids == ["S1"]
    assert "S2" in result.notes
    assert len(plan.scenarios) == 2


@pytest.mark.parametrize(
    "literal",
    [None, True, False, 0, -3, 2.75, "quote'\\newline\n中文", [], [None, True, -3, 2.75, "x"]],
)
def test_equals_template_preserves_all_supported_literal_types(literal):
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee",
                arguments=[literal],
                keyword_arguments={"amount": literal},
                operator="equals",
                expected_value=literal,
            ),
        }
    )
    plan = review_oracles(
        FakeLLM(),
        PROJECT,
        ANALYSIS.requirements,
        PLAN.model_copy(update={"scenarios": [scenario]}),
        REPOSITORY,
    )
    suite = generate_tests(ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert suite.tests[0].validation_status == "validated"
    assert suite.tests[0].validated_checks[0].target == "shipping.fee"


@pytest.mark.parametrize(
    "exception",
    [
        "ValueError",
        "TypeError",
        "KeyError",
        "RuntimeError",
        "IndexError",
        "ZeroDivisionError",
        "OverflowError",
        "Exception",
    ],
)
def test_raises_template_preserves_each_currently_supported_exception(exception):
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee", arguments=[-1], operator="raises", exception_type=exception
            ),
        }
    )
    plan = review_oracles(
        FakeLLM(),
        PROJECT,
        ANALYSIS.requirements,
        PLAN.model_copy(update={"scenarios": [scenario]}),
        REPOSITORY,
    )
    suite = generate_tests(ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert suite.tests[0].validation_status == "validated"
    assert f"pytest.raises({exception})" in suite.tests[0].code


@pytest.mark.parametrize(
    "exception", [None, "ValueError()", "__import__('os').system('x')", "errors.CustomError"]
)
def test_unsupported_exception_expression_cannot_be_rendered_as_executable_code(exception):
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee", arguments=[-1], operator="raises", exception_type=exception
            ),
        }
    )
    plan = review_oracles(
        FakeLLM(),
        PROJECT,
        ANALYSIS.requirements,
        PLAN.model_copy(update={"scenarios": [scenario]}),
        REPOSITORY,
    )
    suite = generate_tests(ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert suite.tests == []


def test_template_keeps_unknown_target_pending_review():
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.invented", arguments=[10000], operator="equals", expected_value=0
            ),
        }
    )
    plan = review_oracles(
        FakeLLM(),
        PROJECT,
        ANALYSIS.requirements,
        PLAN.model_copy(update={"scenarios": [scenario]}),
        REPOSITORY,
    )
    suite = generate_tests(ANALYSIS.requirements, REPOSITORY, plan=plan)
    assert suite.tests[0].validation_status == "needs_review"
    assert suite.tests[0].validated_checks == []
