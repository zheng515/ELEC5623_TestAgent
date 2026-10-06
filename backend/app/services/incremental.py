"""Grow a verified suite as watched code changes.

A baseline is the latest completed run whose requirements, plan, tests and code
snapshot are on record under the current validation rules. Its public callables are
compared with those of the new snapshot. New or changed module-level functions become
the focus for planning additional scenarios; every carried test is re-validated and
re-executed against the new code. The baseline is never rewritten: new scenario and
test ids continue its numbering, and carried tests keep their code.
"""

import re
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.schemas import ExecutedTest, GeneratedTest, VerificationRun
from app.services.outcome_mapping import OUTCOME_MAPPING_VERSION
from app.services.test_validator import VALIDATION_VERSION

FUNCTION_PREFIXES = ("def ", "async def ")


@dataclass(frozen=True)
class InterfaceDiff:
    added: list[str]
    removed: list[str]
    changed: list[str]


def diff_interfaces(before: dict[str, str], after: dict[str, str]) -> InterfaceDiff:
    shared = before.keys() & after.keys()
    return InterfaceDiff(
        added=sorted(after.keys() - before.keys()),
        removed=sorted(before.keys() - after.keys()),
        changed=sorted(name for name in shared if before[name] != after[name]),
    )


def focus_targets(diff: InterfaceDiff, after: dict[str, str]) -> list[str]:
    """New or changed module-level functions: the only targets checks support."""
    return [
        name
        for name in sorted({*diff.added, *diff.changed})
        if after[name].startswith(FUNCTION_PREFIXES)
    ]


def baseline_problem(run: VerificationRun | None, input_sha256: str) -> str | None:
    """Why a run cannot serve as the baseline, or None when it can."""
    if run is None:
        return "no completed run exists yet"
    report = run.report
    repository = report.repository
    if run.status != "completed":
        return f"it ended as {run.status}"
    if run.input_sha256 != input_sha256:
        return "its project inputs differ"
    if (
        report.validation_version != VALIDATION_VERSION
        or report.outcome_mapping_version != OUTCOME_MAPPING_VERSION
    ):
        return "it was saved under earlier validation rules"
    if repository is None or repository.artifact is None or repository.callables is None:
        return "it has no comparable code snapshot"
    if report.test_plan is None or not report.requirements or report.source_audit is None:
        return "it has no saved requirements and test plan"
    return None


def next_number(identifiers: list[str], prefix: str) -> int:
    """One past the highest `<prefix><n>` id, so new ids never reuse old ones."""
    numbers = [
        int(match.group(1))
        for identifier in identifiers
        if (match := re.fullmatch(rf"{prefix}(\d+)", identifier))
    ]
    return max(numbers, default=0) + 1


def renumber_tests(new: list[GeneratedTest], carried: list[GeneratedTest]) -> list[GeneratedTest]:
    """Give new tests ids and module files that cannot collide with carried ones."""
    used_ids = {test.id for test in carried}
    used_modules = {PurePosixPath(test.module).name for test in carried}
    number = next_number(list(used_ids), "T")
    renumbered = []
    for test in new:
        while f"T{number}" in used_ids:
            number += 1
        identifier = f"T{number}"
        used_ids.add(identifier)
        module = PurePosixPath(test.module).name
        if module in used_modules:
            module = f"{PurePosixPath(module).stem}_{identifier.lower()}.py"
        used_modules.add(module)
        renumbered.append(test.model_copy(update={"id": identifier, "module": module}))
    return renumbered


def regressions(before: list[ExecutedTest], after: list[ExecutedTest]) -> list[str]:
    passed = {(item.test_id, item.name) for item in before if item.outcome == "passed"}
    return [
        f"{item.test_id}::{item.name}: passed at the baseline, {item.outcome} now"
        for item in after
        if (item.test_id, item.name) in passed and item.outcome in {"failed", "error"}
    ]


def invalidated(before: list[GeneratedTest], after: list[GeneratedTest]) -> list[str]:
    previous = {test.id: test.validation_status for test in before}
    return [
        f"{test.id}: {test.validation_issues[0] if test.validation_issues else 'needs review'}"
        for test in after
        if previous.get(test.id) == "validated" and test.validation_status != "validated"
    ]
