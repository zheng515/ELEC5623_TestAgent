"""Unsafe model replacements must not turn construction errors into false passes."""

import pytest
from test_agent import (
    ANALYSIS,
    INVALID_SUITE,
    PLAN,
    PROJECT,
    REPOSITORY,
    SUITE,
    SequenceRunner,
    execution,
    inspecting_agent,
)

from app.schemas import GeneratedTestSuite
from app.services.repair_guard import UnsafeRepair, validate_repair


@pytest.mark.parametrize(
    "code",
    [
        "def test_free_shipping_at_threshold():\n    assert True\n",
        SUITE.tests[0].code.replace("assert fee(10000) == 0", "assert 1 == 1"),
        SUITE.tests[0].code.replace("assert fee(10000) == 0", "pass"),
        SUITE.tests[0].code.replace("== 0", ">= 0"),
        SUITE.tests[0].code.replace("fee(10000)", "fee(20000)"),
        SUITE.tests[0].code.replace("fee(10000)", "0"),
        SUITE.tests[0].code.replace("assert fee", "return\n    assert fee"),
        SUITE.tests[0].code.replace("assert fee", "if False:\n        assert fee"),
        SUITE.tests[0].code.replace(
            "assert fee(10000) == 0",
            "try:\n        assert fee(10000) == 0\n    except AssertionError:\n        pass",
        ),
        SUITE.tests[0].code.replace("def test_", "import pytest\n@pytest.mark.skip\ndef test_"),
        SUITE.tests[0].code.replace("from shipping import fee", "from fake_shipping import fee"),
        SUITE.tests[0].code.replace("def test_", "fee = lambda value: 0\ndef test_"),
        SUITE.tests[0].code.replace("def test_", "def fee(value):\n    return 0\ndef test_"),
        SUITE.tests[0].code.replace("at_threshold", "renamed"),
        "invalid Python(",
    ],
)
def test_unsafe_repair_preserves_original_error_and_is_never_executed(code):
    candidate = SUITE.model_copy(
        update={"tests": [SUITE.tests[0].model_copy(update={"code": code})]}
    )
    runner = SequenceRunner(execution("error"), execution("passed"))
    run = inspecting_agent(ANALYSIS, PLAN, INVALID_SUITE, candidate, runner=runner).run(PROJECT)
    assert len(runner.received) == 1
    assert run.report.generated_tests[0].code == INVALID_SUITE.tests[0].code
    assert run.report.executions[0].outcome == "error"
    assert run.report.behaviors[0].verification_status == "Unverified"
    assert run.report.refinement_iterations == 0
    assert len(run.report.execution_attempts) == 1
    assert any("Rejected repair T1:" in note for note in run.report.unresolved_issues)
    assert "No safe repair was accepted" in run.events[-1].message


def test_safe_repair_preserves_assertions_calls_and_all_original_metadata():
    validate_repair(
        INVALID_SUITE.tests[0], SUITE.tests[0], execution("error").executions, REPOSITORY
    )


@pytest.mark.parametrize(
    "original_code",
    [
        "def test_shipping(missing_fixture):\n    assert True\n",
        "def test_shipping(missing_fixture):\n    assert 1 == 1\n",
        "def test_shipping(missing_fixture):\n    assert True\n(",
        "def test_shipping(missing_fixture):\n    assert something() == 0\n",
        (
            "from shipping import fee\ndef test_shipping(missing_fixture):\n"
            "    assert missing_fixture(fee) == 0\n"
        ),
        (
            "from shipping import fee\ndef test_shipping(missing_fixture):\n"
            "    if 'missing_fixture' in locals():\n        assert fee(10000) == 0\n"
        ),
    ],
)
def test_no_safe_baseline_or_used_fixture_is_rejected(original_code):
    original = SUITE.tests[0].model_copy(update={"code": original_code})
    replacement = original.model_copy(
        update={"code": original_code.replace("missing_fixture):", "):")}
    )
    with pytest.raises(UnsafeRepair):
        validate_repair(original, replacement, execution("error").executions, REPOSITORY)


def test_removing_unreported_fixture_is_rejected():
    original = INVALID_SUITE.tests[0].model_copy(
        update={"code": INVALID_SUITE.tests[0].code.replace("missing_fixture", "another_fixture")}
    )
    with pytest.raises(UnsafeRepair):
        validate_repair(original, SUITE.tests[0], execution("error").executions, REPOSITORY)


def test_second_test_cannot_be_removed_from_the_module():
    extra = "\ndef test_negative():\n    assert fee(-1) == 0\n"
    original = INVALID_SUITE.tests[0].model_copy(
        update={"code": INVALID_SUITE.tests[0].code + extra}
    )
    with pytest.raises(UnsafeRepair):
        validate_repair(original, SUITE.tests[0], execution("error").executions, REPOSITORY)


def test_partial_safe_batch_keeps_other_original_artifacts_and_records_rejection():
    from test_agent import FakeLLM

    from app.services.refiner import refine_tests

    second = INVALID_SUITE.tests[0].model_copy(update={"id": "T2", "module": "test_second.py"})
    replacement = second.model_copy(update={"code": "def test_second():\n    assert True\n"})
    errors = execution("error").executions
    errors.append(errors[0].model_copy(update={"test_id": "T2"}))
    result = refine_tests(
        FakeLLM(GeneratedTestSuite(tests=[SUITE.tests[0], replacement], notes="")),
        PROJECT,
        ANALYSIS.requirements,
        [INVALID_SUITE.tests[0], second],
        errors,
        REPOSITORY,
        plan=PLAN,
    )
    assert [test.id for test in result.tests] == ["T1"]
    assert "Rejected repair T2:" in result.notes


def test_exception_oracle_is_preserved_by_a_safe_fixture_repair():
    code = (
        "import pytest\nfrom shipping import fee\n"
        "def test_negative(missing_fixture):\n"
        "    with pytest.raises(ValueError):\n        fee(-1)\n"
    )
    original = SUITE.tests[0].model_copy(update={"code": code})
    repaired = original.model_copy(update={"code": code.replace("(missing_fixture)", "()")})
    validate_repair(original, repaired, execution("error").executions, REPOSITORY)
    weakened = repaired.model_copy(
        update={"code": repaired.code.replace("ValueError", "Exception")}
    )
    with pytest.raises(UnsafeRepair):
        validate_repair(original, weakened, execution("error").executions, REPOSITORY)


def test_used_fixture_parameter_cannot_be_removed():
    code = (
        "from shipping import fee\n"
        "def test_shipping(missing_fixture):\n    assert fee(missing_fixture) == 0\n"
    )
    original = SUITE.tests[0].model_copy(update={"code": code})
    candidate = original.model_copy(
        update={"code": code.replace("test_shipping(missing_fixture)", "test_shipping()")}
    )
    with pytest.raises(UnsafeRepair):
        validate_repair(original, candidate, execution("error").executions, REPOSITORY)
