"""Propose the single supported repair and retain both safety checks (FR12)."""

from app.schemas import (
    ExecutedTest,
    GeneratedTest,
    GeneratedTestSuite,
    RepositorySnapshot,
    TestPlan,
)
from app.services.repair_guard import UnsafeRepair, propose_repair, validate_repair
from app.services.test_validator import validate_test


def refine_tests(
    tests: list[GeneratedTest],
    errors: list[ExecutedTest],
    repository: RepositorySnapshot,
    *,
    plan: TestPlan,
) -> GeneratedTestSuite:
    error_ids = {item.test_id for item in errors if item.test_id}
    replacements, notes = [], []
    for original in tests:
        if original.id not in error_ids:
            continue
        try:
            candidate = propose_repair(original, errors, repository)
            validate_repair(original, candidate, errors, repository)
        except UnsafeRepair as error:
            notes.append(f"Rejected repair {original.id}: {error}")
            continue
        checked = validate_test(candidate, plan, repository)
        if checked.validation_status != "validated":
            notes.append(f"Rejected repair {original.id}: scenario validation did not pass.")
            continue
        replacements.append(checked)
    return GeneratedTestSuite(tests=replacements, notes="\n".join(notes))
