"""Do not accept a scenario id as proof that generated code implements its oracle."""

import pytest
from test_agent import (
    ANALYSIS,
    PLAN,
    PROJECT,
    REPOSITORY,
    SUITE,
    FakeRunner,
    execution,
    inspecting_agent,
)

from app.schemas import GeneratedTestSuite, ScenarioCheck
from app.services.test_validator import validate_test


@pytest.mark.parametrize(
    "code",
    [
        "def test_shipping():\n    assert True\n",
        "from shipping import fee\ndef test_shipping():\n    assert 1 == 1\n",
        "from shipping import fee\ndef test_shipping():\n    fee(10000)\n    assert True\n",
        SUITE.tests[0].code.replace("10000", "9999"),
        SUITE.tests[0].code.replace("== 0", "== 1000"),
        SUITE.tests[0].code.replace("== 0", ">= 0"),
        SUITE.tests[0].code.replace("assert fee(10000) == 0", "pass"),
        SUITE.tests[0].code.replace("assert fee", "return\n    assert fee"),
        SUITE.tests[0].code.replace("assert fee", "if False:\n        assert fee"),
        SUITE.tests[0].code.replace(
            "assert fee(10000) == 0",
            "try:\n        assert fee(10000) == 0\n    except AssertionError:\n        pass",
        ),
        SUITE.tests[0].code.replace("def test_", "import pytest\n@pytest.mark.skip\ndef test_"),
        SUITE.tests[0].code.replace("from shipping import fee", "from shipping import invented"),
        SUITE.tests[0].code.replace("from shipping import fee", "from fake_shipping import fee"),
        SUITE.tests[0].code.replace("def test_", "fee = lambda value: 0\ndef test_"),
        SUITE.tests[0].code.replace("at_threshold():", "at_threshold(fee):"),
        SUITE.tests[0].code.replace(
            "assert fee(10000) == 0",
            "amount = 10000\n    amount = 9999\n    assert fee(amount) == 0",
        ),
        SUITE.tests[0].code.replace(
            "assert fee(10000) == 0", "result = fee(10000)\n    result = 0\n    assert result == 0"
        ),
        "invalid Python(",
        "from shipping import fee\ndef helper():\n    return fee(10000)\n"
        "def test_shipping():\n    assert helper() == 0\n",
        SUITE.tests[0].code.replace("assert fee(10000) == 0", "assert eval('fee(10000)') == 0"),
        SUITE.tests[0].code.replace("fee(10000)", "fee(True)"),
        SUITE.tests[0].code.replace("== 0", "== False"),
    ],
)
def test_invalid_claim_is_retained_but_excluded_from_execution_and_coverage(code):
    suite = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={
                        "code": code,
                        "validation_status": "validated",
                        "validated_checks": [],
                    }
                )
            ]
        }
    )
    runner = FakeRunner(execution("passed"))
    run = inspecting_agent(ANALYSIS, PLAN, suite, runner=runner).run(PROJECT)
    test = run.report.generated_tests[0]
    assert test.code == code
    assert test.scenario_ids == ["S1"]  # Preserve the claim for inspection.
    assert test.validation_status == "needs_review"
    assert test.validation_issues
    assert test.validated_checks == []
    assert run.report.requirement_coverage == 0
    assert run.report.uncovered_scenarios == ["S1: Free shipping at threshold"]
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert runner.received == []
    assert run.report.executed_tests == 0
    assert "excluded" in run.events[-1].message


@pytest.mark.parametrize(
    "code",
    [
        SUITE.tests[0].code,
        "import shipping as s\ndef test_shipping():\n    assert s.fee(10000) == 0\n",
        "from shipping import fee as calculate\ndef test_shipping():\n"
        "    amount = 10000\n    expected = 0\n    result = calculate(amount)\n"
        "    assert result == expected\n",
    ],
)
def test_exact_call_input_and_oracle_establish_a_validated_link(code):
    checked = validate_test(SUITE.tests[0].model_copy(update={"code": code}), PLAN, REPOSITORY)
    assert checked.validation_status == "validated"
    assert checked.validation_issues == []
    assert checked.validated_checks[0].scenario_id == "S1"
    assert checked.validated_checks[0].target == "shipping.fee"
    assert checked.validated_checks[0].call_line > 0
    assert checked.validated_checks[0].assertion_line > 0


def test_precise_exception_input_and_type_must_match():
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee",
                arguments=[-1],
                operator="raises",
                exception_type="ValueError",
            )
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [scenario]})
    code = (
        "import pytest\nfrom shipping import fee\ndef test_negative():\n"
        "    with pytest.raises(ValueError):\n        fee(-1)\n"
    )
    assert (
        validate_test(
            SUITE.tests[0].model_copy(update={"code": code}), plan, REPOSITORY
        ).validation_status
        == "validated"
    )
    for wrong in [
        code.replace("ValueError", "Exception"),
        code.replace("fee(-1)", "fee(1)"),
        code.replace("fee(-1)", "pass"),
        code.replace("with pytest", "ValueError = fee(1)\n    with pytest"),
    ]:
        assert (
            validate_test(
                SUITE.tests[0].model_copy(update={"code": wrong}), plan, REPOSITORY
            ).validation_status
            == "needs_review"
        )


def test_missing_contract_and_setup_assumptions_are_not_automatic_coverage():
    for scenario in [
        PLAN.scenarios[0].model_copy(update={"check": None}),
        PLAN.scenarios[0].model_copy(update={"assumptions": ["Currency unknown."]}),
        PLAN.scenarios[0].model_copy(update={"preconditions": ["Account exists."]}),
    ]:
        checked = validate_test(
            SUITE.tests[0], PLAN.model_copy(update={"scenarios": [scenario]}), REPOSITORY
        )
        assert checked.validation_status == "needs_review"
        assert checked.validation_issues
    assert validate_test(SUITE.tests[0], PLAN, None).validation_status == "needs_review"


def test_each_claimed_scenario_needs_its_own_matching_oracle():
    second = PLAN.scenarios[0].model_copy(
        update={
            "id": "S2",
            "check": ScenarioCheck(
                target="shipping.fee", arguments=[9999], operator="equals", expected_value=1000
            ),
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [*PLAN.scenarios, second]})
    test = SUITE.tests[0].model_copy(update={"scenario_ids": ["S1", "S2"]})
    checked = validate_test(test, plan, REPOSITORY)
    assert checked.validation_status == "needs_review"
    assert checked.validated_checks == []
    assert any("S2" in issue for issue in checked.validation_issues)


def test_actual_test_function_outcome_is_required_not_just_a_module_outcome():
    suite = SUITE.model_copy(
        update={
            "tests": [
                SUITE.tests[0].model_copy(
                    update={
                        "code": SUITE.tests[0].code
                        + "\ndef test_second():\n    assert fee(10000) == 0\n"
                    }
                )
            ]
        }
    )
    run = inspecting_agent(ANALYSIS, PLAN, suite, runner=FakeRunner(execution("passed"))).run(
        PROJECT
    )
    assert len(run.report.generated_tests[0].validated_checks) == 2
    assert run.report.requirement_coverage == 1
    assert run.report.behaviors[0].verification_status == "Unverified"
    results = execution("passed", "passed")
    results.executions[1].name = "test_second"
    complete = inspecting_agent(ANALYSIS, PLAN, suite, runner=FakeRunner(results)).run(PROJECT)
    assert complete.report.behaviors[0].verification_status == "Partially Verified"


def test_partial_batch_executes_only_validated_artifacts_and_archives_only_executed_code():
    invalid = SUITE.tests[0].model_copy(
        update={"id": "T2", "module": "test_fake.py", "code": "def test_fake():\n    assert True\n"}
    )
    suite = GeneratedTestSuite(tests=[SUITE.tests[0], invalid], notes="")
    runner = FakeRunner(execution("passed"))
    run = inspecting_agent(ANALYSIS, PLAN, suite, runner=runner).run(PROJECT)
    assert [test.id for test in runner.received[0]] == ["T1"]
    assert [test.id for test in run.report.execution_attempts[0].tests] == ["T1"]
    assert [test.id for test in run.report.generated_tests] == ["T1", "T2"]
    assert run.report.behaviors[0].verification_status == "Unverified"


def test_legacy_artifact_has_no_automatic_validation_evidence():
    old = SUITE.tests[0].model_dump(
        exclude={"validation_status", "validated_checks", "validation_issues"}
    )
    from app.schemas import GeneratedTest

    assert GeneratedTest.model_validate(old).validation_status == "not_checked"


def test_json_types_are_not_coerced_and_keyword_arguments_match_exactly():
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee",
                keyword_arguments={"amount_cents": 10000},
                operator="equals",
                expected_value=0,
            )
        }
    )
    plan = PLAN.model_copy(update={"scenarios": [scenario]})
    code = SUITE.tests[0].code.replace("fee(10000)", "fee(amount_cents=10000)")
    assert (
        validate_test(
            SUITE.tests[0].model_copy(update={"code": code}), plan, REPOSITORY
        ).validation_status
        == "validated"
    )
    for wrong in [code.replace("10000", "10000.0"), code.replace("amount_cents=10000", "10000")]:
        assert (
            validate_test(
                SUITE.tests[0].model_copy(update={"code": wrong}), plan, REPOSITORY
            ).validation_status
            == "needs_review"
        )


def test_html_preserves_rejected_code_and_its_explanation_without_fabricating_execution():
    from app.services.report_renderer import render_html_report

    bad = SUITE.tests[0].model_copy(
        update={"code": "# <script>alert(1)</script>\ndef test_bad():\n    assert True\n"}
    )
    runner = FakeRunner(execution("passed"))
    run = inspecting_agent(
        ANALYSIS, PLAN, GeneratedTestSuite(tests=[bad], notes=""), runner=runner
    ).run(PROJECT)
    html = render_html_report(PROJECT, run)
    assert "Code-to-plan validation" in html
    assert "needs_review" in html
    assert "Structured check contract" in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>alert(1)</script>" not in html
    assert "No tests executed." in html
    assert not any("Start Docker" in issue for issue in run.report.unresolved_issues)


def test_planner_contract_is_compatible_with_the_real_sdk_schema_transform():
    from anthropic import transform_schema

    from app.schemas import TestPlan as ScenarioPlan

    transformed = transform_schema(ScenarioPlan)
    assert transformed["type"] == "object"
    assert "ScenarioCheck" in transformed["$defs"]
    assert "KeywordArgument" in transformed["$defs"]
    assert transformed["$defs"]["KeywordArgument"]["additionalProperties"] is False


def test_duplicate_keyword_contract_does_not_earn_coverage():
    scenario = PLAN.scenarios[0].model_copy(
        update={
            "check": ScenarioCheck(
                target="shipping.fee",
                arguments=[10000],
                operator="equals",
                expected_value=0,
                keyword_arguments=[{"name": "amount", "value": 1}, {"name": "amount", "value": 2}],
            )
        }
    )
    checked = validate_test(
        SUITE.tests[0], PLAN.model_copy(update={"scenarios": [scenario]}), REPOSITORY
    )
    assert checked.validation_status == "needs_review"
    assert any("duplicate keyword" in issue for issue in checked.validation_issues)
