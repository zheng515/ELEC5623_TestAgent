"""Attribute final outcomes through server-validated scenario/function links."""

from app.schemas import ExecutedTest, GeneratedTest, TestPlan

OUTCOME_MAPPING_VERSION = 1


def requirement_checks(test: GeneratedTest, requirement_id: str, plan: TestPlan | None):
    if plan is None or test.validation_status != "validated":
        return []
    scenarios = {
        scenario.id for scenario in plan.scenarios if requirement_id in scenario.requirement_ids
    }
    return [check for check in test.validated_checks if check.scenario_id in scenarios]


def matches_function(execution: ExecutedTest, test: GeneratedTest, function_name: str) -> bool:
    return (
        execution.test_id == test.id
        and execution.module == test.module
        and execution.name == function_name
    )


def requirement_outcomes(requirement_id, tests, executions, plan):
    """Retain original evidence indices; unrelated outcomes stay in global evidence."""
    return [
        (index, execution)
        for index, execution in enumerate(executions, start=1)
        if any(
            matches_function(execution, test, check.function_name)
            for test in tests
            for check in requirement_checks(test, requirement_id, plan)
        )
    ]
