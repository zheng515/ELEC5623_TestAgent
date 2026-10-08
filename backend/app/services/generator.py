"""Render persisted, source-supported scenario contracts as pytest modules."""

import ast

from app.schemas import (
    GeneratedTest,
    GeneratedTestSuite,
    RepositorySnapshot,
    RequirementItem,
    TestPlan,
    TestScenario,
)
from app.services.oracle_review import has_current_oracle_support
from app.services.test_validator import validate_test


def generate_tests(
    requirements: list[RequirementItem],
    repository: RepositorySnapshot | None = None,
    *,
    plan: TestPlan,
) -> GeneratedTestSuite:
    testable = {requirement.id for requirement in requirements if requirement.testable}
    tests, notes = [], []
    for position, scenario in enumerate(plan.scenarios, 1):
        if not has_current_oracle_support(scenario):
            notes.append(f"Skipped scenario {scenario.id}: no current original-source support.")
            continue
        if not scenario.requirement_ids or any(
            ref not in testable for ref in scenario.requirement_ids
        ):
            notes.append(f"Skipped scenario {scenario.id}: requirement links are not testable.")
            continue
        try:
            test = _render(scenario, position)
        except ValueError as error:
            notes.append(f"Skipped scenario {scenario.id}: {error}")
            continue
        checked = validate_test(test, plan, repository)
        tests.append(checked)
        notes.extend(
            f"Test validation {checked.id}: {issue}" for issue in checked.validation_issues
        )
    if not tests:
        notes.insert(0, "No supported testable scenario was rendered; test generation was skipped.")
    return GeneratedTestSuite(tests=tests, notes="\n".join(notes))


def _render(scenario: TestScenario, position: int) -> GeneratedTest:
    check = scenario.check
    if check is None:
        raise ValueError("no structured check contract was recorded.")
    module, function = check.target.rsplit(".", 1)
    arguments = [repr(argument) for argument in check.arguments]
    arguments.extend(f"{item.name}={item.value!r}" for item in check.keyword_arguments)
    call = f"project_call({', '.join(arguments)})"
    name = f"test_scenario_{position}"
    imports = f"from {module} import {function} as project_call\n"
    if check.operator == "equals":
        body = f"    assert {call} == {check.expected_value!r}\n"
    else:
        # A name is data here; reject code expressions before interpolating it.
        try:
            exception = ast.parse(check.exception_type or "", mode="eval").body
        except SyntaxError as error:
            raise ValueError("a precise exception name is required.") from error
        if not isinstance(exception, ast.Name):
            raise ValueError("a precise exception name is required.")
        imports = "import pytest\n" + imports
        body = f"    with pytest.raises({exception.id}):\n        {call}\n"
    return GeneratedTest(
        id=f"T{position}",
        scenario_ids=[scenario.id],
        requirement_ids=list(dict.fromkeys(scenario.requirement_ids)),
        name=name,
        module=f"test_generated_{position}.py",
        code=f"{imports}\n\ndef {name}():\n{body}",
        rationale=f"Implements the saved contract for {scenario.id}: {scenario.title}.",
    )


def _covered_requirements(tests: list[GeneratedTest]) -> set[str]:
    return {
        ref
        for test in tests
        if test.validation_status == "validated" and test.validated_checks
        for ref in test.requirement_ids
    }


def coverage_gaps(requirements: list[RequirementItem], tests: list[GeneratedTest]) -> list[str]:
    """Testable requirements that no generated test references (FR14)."""
    covered = _covered_requirements(tests)
    return [
        f"{requirement.id}: {requirement.text}"
        for requirement in requirements
        if requirement.testable and requirement.id not in covered
    ]


def requirement_coverage(
    requirements: list[RequirementItem], tests: list[GeneratedTest]
) -> float | None:
    """Share of testable requirements linked to at least one test, or None if none are."""
    testable = [requirement for requirement in requirements if requirement.testable]
    if not testable:
        return None
    covered = _covered_requirements(tests)
    return round(len([r for r in testable if r.id in covered]) / len(testable), 4)
