"""Attribute outcomes through server-validated scenario/function links."""

from app.schemas import ExecutedTest, GeneratedTest, TestPlan

OUTCOME_MAPPING_VERSION = 1


def _checks(test, scenario_ids):
    if test.validation_status != "validated":
        return []
    return [check for check in test.validated_checks if check.scenario_id in scenario_ids]


def requirement_checks(test: GeneratedTest, requirement_id: str, plan: TestPlan | None):
    scenarios = {
        scenario.id for scenario in plan.scenarios if requirement_id in scenario.requirement_ids
    } if plan else set()
    return _checks(test, scenarios)


def matches_function(execution: ExecutedTest, test: GeneratedTest, function_name: str) -> bool:
    return (
        execution.test_id == test.id
        and execution.module == test.module
        and execution.name == function_name
    )


def _outcomes(scenario_ids, tests, executions):
    """One attribution rule; retain indices in the global execution evidence list."""
    return [
        (index, execution)
        for index, execution in enumerate(executions, start=1)
        if any(
            matches_function(execution, test, check.function_name)
            for test in tests
            for check in _checks(test, scenario_ids)
        )
    ]


def requirement_outcomes(requirement_id, tests, executions, plan):
    scenarios = {
        scenario.id for scenario in plan.scenarios if requirement_id in scenario.requirement_ids
    } if plan else set()
    return _outcomes(scenarios, tests, executions)


def scenario_evidence_refs(
    plan: TestPlan | None, tests: list[GeneratedTest], executions: list[ExecutedTest]
) -> dict[str, list[str]]:
    """Save exact scenario attribution; requirement-wide refs are never substituted."""
    return {
        scenario.id: [f"E{index}" for index, _ in _outcomes({scenario.id}, tests, executions)]
        for scenario in plan.scenarios
    } if plan else {}
