import hashlib
from collections import Counter
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import uuid4

from app.core.config import Settings
from app.schemas import (
    Behavior,
    ExecutedTest,
    ExecutionResult,
    GeneratedTest,
    Project,
    RepositorySnapshot,
    RequirementItem,
    RunEvent,
    TestDiagnosis,
    VerificationReport,
    VerificationRun,
    VerificationStatus,
)
from app.services.analyzer import analyze_requirements
from app.services.generator import coverage_gaps, generate_tests, requirement_coverage
from app.services.inspector import RepositoryError, inspect_repository, repository_available
from app.services.llm import LLMError, StructuredLLM
from app.services.refiner import refine_tests
from app.services.runner import TestRunner


class Orchestrator(Protocol):
    """Replace this adapter when the real evidence-driven workflow is integrated."""

    def run(self, project: Project) -> VerificationRun: ...


class ScaffoldOrchestrator:
    """Records inputs honestly. Does not interpret requirements or execute repository code."""

    def run(self, project: Project) -> VerificationRun:
        now = datetime.now(UTC)
        digest = hashlib.sha256(project.model_dump_json().encode()).hexdigest()
        return VerificationRun(
            id=str(uuid4()),
            project_id=project.id,
            created_at=now,
            input_sha256=digest,
            events=[
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Project inputs and fingerprint recorded. Repository "
                        "reference saved; source code not read."
                    ),
                    created_at=now,
                ),
                RunEvent(
                    id=str(uuid4()),
                    stage="understand",
                    message=(
                        "Run blocked: requirement analysis, code inspection, "
                        "and isolated execution are not connected."
                    ),
                    created_at=now,
                ),
            ],
            report=VerificationReport(
                summary=(
                    "Setup report created. Requirements have not been analyzed, "
                    "source code has not been read, and no tests have been executed."
                ),
                unresolved_issues=[
                    "Connect requirement analysis and behavior decomposition.",
                    "Connect code inspection, test mapping, and gap evaluation.",
                    "Connect isolated pytest execution, failure diagnosis, and mutation testing.",
                ],
            ),
        )


class DirectLLMOrchestrator:
    """B0 generation with optional B2 execution feedback and bounded refinement.

    `mode` names the *generation* configuration, which is what the proposal's
    With no sandbox, generation remains B0. With a sandbox, invalid tests may be
    refined and re-executed once, which makes the configured workflow B2.
    """

    def __init__(
        self,
        llm: StructuredLLM,
        *,
        runner: TestRunner | None = None,
        settings: Settings | None = None,
    ):
        self._llm = llm
        self._runner = runner
        self._settings = settings or Settings()
        self._max_requirements = self._settings.max_requirements

    @property
    def executes_tests(self) -> bool:
        return self._runner is not None

    @property
    def inspects_repositories(self) -> bool:
        return repository_available(self._settings)

    @property
    def mode(self) -> str:
        return "baseline_b2" if self._runner is not None else "baseline_b0"

    def run(self, project: Project) -> VerificationRun:
        now = datetime.now(UTC)
        digest = hashlib.sha256(project.model_dump_json().encode()).hexdigest()
        events = [
            _event(
                "understand",
                "Project inputs and fingerprint recorded. Repository reference saved; "
                "source code not read.",
                now,
            )
        ]

        repository, repository_issues = self._inspect(project, events)

        try:
            analysis = analyze_requirements(
                self._llm, project, max_requirements=self._max_requirements
            )
        except LLMError as error:
            return self._failed(project, digest, events, "analyze", str(error), now)

        requirements = analysis.requirements
        ambiguous = [item for item in requirements if item.ambiguity]
        untestable = [item for item in requirements if not item.testable]
        events.append(
            _event(
                "analyze",
                f"Extracted {len(requirements)} requirements: "
                f"{len(requirements) - len(untestable)} testable, {len(untestable)} not "
                f"testable as written, {len(ambiguous)} with recorded ambiguity.",
                datetime.now(UTC),
            )
        )

        try:
            suite = generate_tests(self._llm, project, requirements, repository)
        except LLMError as error:
            return self._failed(project, digest, events, "generate", str(error), now, requirements)

        gaps = coverage_gaps(requirements, suite.tests)
        events.append(
            _event(
                "generate",
                f"Generated {len(suite.tests)} pytest tests covering "
                f"{len(requirements) - len(untestable) - len(gaps)} testable requirements.",
                datetime.now(UTC),
            )
        )

        execution = self._execute(suite.tests, repository, events)
        executions = execution.executions if execution else []
        diagnoses = _diagnose(executions)
        tests = suite.tests
        refinement_iterations = 0
        repairable = [item for item in executions if item.outcome == "error" and item.test_id]
        if repairable and repository is not None and self._runner is not None:
            try:
                refined = refine_tests(
                    self._llm, project, requirements, tests, repairable, repository
                )
                if refined.tests:
                    tests = _replace_tests(tests, refined.tests)
                    events.append(
                        _event(
                            "improve",
                            f"Refined {len(refined.tests)} invalid tests from execution evidence.",
                            datetime.now(UTC),
                        )
                    )
                    rerun = self._execute(
                        refined.tests, repository, events, stage="re_measure"
                    )
                    if rerun is not None:
                        refined_ids = {test.id for test in refined.tests}
                        executions = [
                            item for item in executions if item.test_id not in refined_ids
                        ] + rerun.executions
                    refinement_iterations = 1
            except LLMError as error:
                events.append(
                    _event(
                        "improve",
                        f"Refinement stopped after the model error: {error}",
                        datetime.now(UTC),
                    )
                )

        unresolved = [
            *repository_issues,
            *(f"{item.id} is ambiguous: {item.ambiguity}" for item in ambiguous),
            *(f"{item.id} is not testable as written: {item.text}" for item in untestable),
        ]
        if gaps:
            unresolved.append(f"{len(gaps)} testable requirements have no generated test.")
        final_execution = (
            execution.model_copy(update={"executions": executions}) if execution else None
        )
        unresolved.extend(_execution_issues(final_execution, tests))
        unresolved.extend(_diagnosis_issues(diagnoses, refinement_iterations))
        for note in (analysis.notes, suite.notes):
            if note.strip():
                unresolved.append(f"Analyst note: {note.strip()}")

        return VerificationRun(
            id=str(uuid4()),
            project_id=project.id,
            mode=self.mode,
            status="completed",
            stage="report",
            created_at=now,
            input_sha256=digest,
            events=events,
            report=VerificationReport(
                summary=(
                    f"{self.mode.replace('_', ' ').upper()} run. "
                    f"{len(requirements)} requirements extracted and "
                    f"{len(tests)} pytest tests generated with requirement links. "
                    + _execution_summary_from_items(executions, execution)
                ),
                repository=repository,
                requirements=requirements,
                generated_tests=tests,
                behaviors=_behaviors(
                    requirements, suite.tests, executions, inspected=repository is not None
                ),
                evidence=_evidence(executions),
                unresolved_issues=unresolved,
                coverage_gaps=gaps,
                executions=executions,
                diagnoses=diagnoses,
                refinement_iterations=refinement_iterations,
                executed_tests=len(executions),
                execution_success_rate=_success_rate(executions),
                requirement_coverage=requirement_coverage(requirements, suite.tests),
            ),
        )

    def _inspect(
        self, project: Project, events: list[RunEvent]
    ) -> tuple[RepositorySnapshot | None, list[str]]:
        """Read the project under test, or record why it was not read (FR4)."""
        if not project.repository_ref:
            return None, [
                "No repository was provided, so generated tests must guess the module they import."
            ]
        if not repository_available(self._settings):
            return None, [
                "Repository inspection is not configured, so the saved repository "
                "reference was not read. Set REQTEST_REPOSITORY_ROOT to enable it."
            ]
        try:
            snapshot = inspect_repository(project.repository_ref, self._settings)
        except RepositoryError as error:
            events.append(_event("inspect", f"Repository not read: {error}", datetime.now(UTC)))
            return None, [f"Repository not read: {error}"]

        events.append(
            _event(
                "inspect",
                f"Read the public interface of {len(snapshot.modules)} modules from "
                f"{snapshot.root}. File contents were not read.",
                datetime.now(UTC),
            )
        )
        issues = []
        if snapshot.truncated:
            issues.append(
                "The repository was larger than the inspection limit, so the interface "
                "list is incomplete."
            )
        if not snapshot.modules:
            issues.append("No importable Python module was found in the repository.")
        return snapshot, issues

    def _execute(
        self,
        tests: list[GeneratedTest],
        repository: RepositorySnapshot | None,
        events: list[RunEvent],
        stage: Literal["measure", "re_measure"] = "measure",
    ) -> ExecutionResult | None:
        """Run the generated tests in the sandbox, or record that it is unavailable."""
        if self._runner is None:
            events.append(
                _event(
                    stage,
                    "Test execution is not connected: no sandbox is available, so the "
                    "generated tests were not run.",
                    datetime.now(UTC),
                )
            )
            return None
        if not tests:
            return None

        result = self._runner.execute(tests, repository.root if repository else None)
        if result.timed_out:
            events.append(
                _event(
                    stage, f"Execution timed out. {result.stderr_excerpt}", datetime.now(UTC)
                )
            )
            return result

        counts = Counter(execution.outcome for execution in result.executions)
        events.append(
            _event(
                stage,
                f"Executed {len(result.executions)} tests in the sandbox: "
                f"{counts['passed']} passed, {counts['failed']} failed, "
                f"{counts['error']} errored, {counts['skipped']} skipped.",
                datetime.now(UTC),
            )
        )
        return result

    def _failed(
        self,
        project: Project,
        digest: str,
        events: list[RunEvent],
        stage: Literal["analyze", "generate"],
        message: str,
        created_at: datetime,
        requirements: list[RequirementItem] | None = None,
    ) -> VerificationRun:
        events = [*events, _event(stage, f"Run failed: {message}", datetime.now(UTC))]
        return VerificationRun(
            id=str(uuid4()),
            project_id=project.id,
            mode=self.mode,
            status="failed",
            stage=stage,
            created_at=created_at,
            input_sha256=digest,
            events=events,
            report=VerificationReport(
                summary=f"Run failed during the {stage} stage. No result was produced.",
                requirements=requirements or [],
                unresolved_issues=[message],
            ),
        )


def _event(stage: str, message: str, created_at: datetime) -> RunEvent:
    return RunEvent(id=str(uuid4()), stage=stage, message=message, created_at=created_at)


def _behaviors(
    requirements: list[RequirementItem],
    tests: list[GeneratedTest],
    executions: list[ExecutedTest],
    *,
    inspected: bool,
) -> list[Behavior]:
    """One behavior per requirement, linked to its tests and their outcomes (FR8)."""
    behaviors = []
    for requirement in requirements:
        linked = [test for test in tests if requirement.id in test.requirement_ids]
        ids = {test.id for test in linked}
        outcomes = [
            (index, execution)
            for index, execution in enumerate(executions, start=1)
            if execution.test_id in ids
        ]
        behaviors.append(
            Behavior(
                id=f"B-{requirement.id}",
                requirement_id=requirement.id,
                source_quote=requirement.source_quote,
                description=requirement.text,
                expected_result=None,
                verification_status=_status(
                    requirement, [execution for _, execution in outcomes], inspected=inspected
                ),
                test_refs=[test.module for test in linked],
                evidence_refs=[_evidence_id(index) for index, _ in outcomes],
            )
        )
    return behaviors


def _status(
    requirement: RequirementItem, outcomes: list[ExecutedTest], *, inspected: bool
) -> VerificationStatus:
    """Only evidence from running the real system can move a behavior off Unverified.

    Verified stays out of reach until test adequacy is evaluated: passing tests show
    the stated behavior held for the cases that were written, not that they were enough.
    """
    if requirement.ambiguity or not requirement.testable:
        return VerificationStatus.UNCERTAIN
    if not inspected or not outcomes:
        return VerificationStatus.UNVERIFIED
    if all(outcome.outcome == "passed" for outcome in outcomes):
        return VerificationStatus.PARTIAL
    return VerificationStatus.UNVERIFIED


def _evidence_id(index: int) -> str:
    return f"E{index}"


def _evidence(executions: list[ExecutedTest]) -> list[dict[str, str]]:
    """Execution outcomes, in the shape the evidence chain in the UI reads."""
    return [
        {
            "id": _evidence_id(index),
            "test": f"{execution.module}::{execution.name}",
            "outcome": execution.outcome,
            "duration_seconds": f"{execution.duration_seconds:.3f}",
            "message": execution.message,
        }
        for index, execution in enumerate(executions, start=1)
    ]


def _success_rate(executions: list[ExecutedTest]) -> float | None:
    """Share of executed tests that passed, or None when nothing ran."""
    if not executions:
        return None
    passed = sum(1 for execution in executions if execution.outcome == "passed")
    return round(passed / len(executions), 4)


def _diagnose(executions: list[ExecutedTest]) -> list[TestDiagnosis]:
    """Classify only what the observed outcome supports; never repair assertion failures."""
    diagnoses = []
    for execution in executions:
        if execution.outcome == "error":
            diagnoses.append(
                TestDiagnosis(
                    test_id=execution.test_id,
                    classification="invalid_test",
                    explanation=(
                        "The test could not execute. Its collection or runtime error must be "
                        "repaired before it can provide verification evidence."
                    ),
                )
            )
        elif execution.outcome == "failed":
            diagnoses.append(
                TestDiagnosis(
                    test_id=execution.test_id,
                    classification="suspected_defect",
                    explanation=(
                        "The test executed and its assertion failed. The requirement expectation "
                        "is preserved for human review rather than rewritten to match the output."
                    ),
                )
            )
        elif execution.outcome == "skipped":
            diagnoses.append(
                TestDiagnosis(
                    test_id=execution.test_id,
                    classification="inconclusive",
                    explanation="The skipped test produced no pass or fail evidence.",
                )
            )
    return diagnoses


def _replace_tests(
    original: list[GeneratedTest], refined: list[GeneratedTest]
) -> list[GeneratedTest]:
    replacements = {test.id: test for test in refined}
    return [replacements.get(test.id, test) for test in original]


def _diagnosis_issues(
    diagnoses: list[TestDiagnosis], refinement_iterations: int
) -> list[str]:
    issues = []
    suspected = sum(item.classification == "suspected_defect" for item in diagnoses)
    invalid = sum(item.classification == "invalid_test" for item in diagnoses)
    if suspected:
        issues.append(
            f"{suspected} failing tests are suspected product defects and require human review."
        )
    if invalid and not refinement_iterations:
        issues.append(
            f"{invalid} invalid tests could not be refined because repository evidence or "
            "a refinement result was unavailable."
        )
    return issues


def _execution_summary(execution: ExecutionResult | None) -> str:
    if execution is None:
        return "No test was executed, so no behavior is verified."
    if execution.timed_out:
        return "Execution timed out, so no outcome was recorded."
    counts = Counter(item.outcome for item in execution.executions)
    return (
        f"{len(execution.executions)} tests executed in the sandbox "
        f"({counts['passed']} passed, {counts['failed']} failed, {counts['error']} errored). "
        "The system under test was not inspected, so no behavior is verified."
    )


def _execution_summary_from_items(
    executions: list[ExecutedTest], original: ExecutionResult | None
) -> str:
    if original is None or original.timed_out:
        return _execution_summary(original)
    counts = Counter(item.outcome for item in executions)
    return (
        f"{len(executions)} final test outcomes recorded "
        f"({counts['passed']} passed, {counts['failed']} failed, {counts['error']} errored). "
        "Verification status remains bounded by the recorded evidence."
    )


def _execution_issues(execution: ExecutionResult | None, tests: list[GeneratedTest]) -> list[str]:
    if execution is None:
        if not tests:
            return []
        return [
            "Generated tests were not executed. Start Docker and run "
            "`bash scripts/build-sandbox.sh` to connect the sandbox."
        ]
    if execution.timed_out:
        return [f"Execution timed out: {execution.stderr_excerpt}"]

    issues = []
    counts = Counter(item.outcome for item in execution.executions)
    if counts["error"]:
        issues.append(
            f"{counts['error']} generated tests still could not run after the available "
            "diagnosis and refinement steps."
        )
    if counts["failed"]:
        issues.append(
            f"{counts['failed']} generated tests ran and failed. Their stated expectations "
            "were preserved as suspected product defects for human review."
        )
    if not execution.executions and tests:
        # 137 is SIGKILL, which in a limited container almost always means the
        # memory cap was hit. Reporting the bare exit code helps nobody diagnose it.
        killed = execution.exit_code == 137
        issues.append(
            (
                "The sandbox container was killed before it reported any result, which "
                "usually means it exceeded REQTEST_SANDBOX_MEMORY."
                if killed
                else f"The sandbox ran but collected no test. Exit code {execution.exit_code}."
            )
            + (f" {execution.stderr_excerpt}" if execution.stderr_excerpt else "")
        )
    return issues
