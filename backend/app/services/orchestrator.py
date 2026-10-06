import hashlib
from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import uuid4

from app.core.config import Settings
from app.schemas import (
    Behavior,
    ExecutedTest,
    ExecutionAttempt,
    ExecutionResult,
    GeneratedTest,
    Project,
    ProjectReadiness,
    RepositorySnapshot,
    RequirementItem,
    RunEvent,
    SourceAnalysisAudit,
    TestDiagnosis,
    TestPlan,
    VerificationReport,
    VerificationRun,
    VerificationStatus,
)
from app.services.analyzer import analyze_requirements
from app.services.generator import coverage_gaps, generate_tests, requirement_coverage
from app.services.inspector import RepositoryError, inspect_repository, repository_available
from app.services.llm import LLMError, StructuredLLM
from app.services.oracle_review import review_oracles
from app.services.outcome_mapping import (
    OUTCOME_MAPPING_VERSION,
    matches_function,
    requirement_checks,
    requirement_outcomes,
)
from app.services.planner import plan_tests, planning_gaps
from app.services.project_readiness import check_project_readiness
from app.services.refiner import refine_tests
from app.services.repository_snapshot import SnapshotError, verified_snapshot_root
from app.services.runner import TestRunner
from app.services.test_validator import VALIDATION_VERSION, validated_scenarios

ProgressCallback = Callable[[VerificationRun], None]


class Orchestrator(Protocol):
    """Replace this adapter when the real evidence-driven workflow is integrated."""

    def run(
        self, project: Project, *, on_progress: ProgressCallback | None = None
    ) -> VerificationRun: ...


class ScaffoldOrchestrator:
    """Records inputs honestly. Does not interpret requirements or execute repository code."""

    def run(
        self, project: Project, *, on_progress: ProgressCallback | None = None
    ) -> VerificationRun:
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

    Without a sandbox, planning and generation remain B0. With a sandbox, invalid tests may be
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

    def run(
        self, project: Project, *, on_progress: ProgressCallback | None = None
    ) -> VerificationRun:
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

        run_id = str(uuid4())
        progress_report = VerificationReport(summary="Agent run started.")

        def checkpoint(stage: str, message: str, **updates):
            nonlocal progress_report
            progress_report = progress_report.model_copy(
                update={"summary": message, **updates}, deep=True
            )
            if on_progress:
                on_progress(
                    VerificationRun(
                        id=run_id,
                        project_id=project.id,
                        created_at=now,
                        updated_at=datetime.now(UTC),
                        mode=self.mode,
                        status="running",
                        stage=stage,
                        input_sha256=digest,
                        events=list(events),
                        report=progress_report,
                    )
                )

        checkpoint("inspect", "Inspecting the available repository interfaces.")
        repository, repository_issues = self._inspect(project, events)
        checkpoint(
            "analyze",
            "Analyzing requirements and validating source quotes.",
            repository=repository,
            unresolved_issues=repository_issues,
        )

        try:
            analysis = analyze_requirements(
                self._llm, project, max_requirements=self._max_requirements
            )
        except LLMError as error:
            return self._failed(
                project, digest, events, "analyze", str(error), now, repository=repository
            )

        requirements = analysis.requirements
        ambiguous = [item for item in requirements if item.ambiguity]
        untestable = [item for item in requirements if not item.testable]
        events.append(
            _event(
                "analyze",
                f"Extracted {len(requirements)} requirements: "
                f"{len(requirements) - len(untestable)} testable, {len(untestable)} not "
                f"testable as written, {len(ambiguous)} with recorded ambiguity. "
                f"Source audit found {len(analysis.source_audit.unlinked_fragments)} unlinked "
                "text fragments. Specification completeness is not established.",
                datetime.now(UTC),
            )
        )

        checkpoint(
            "plan",
            "Checking project readiness before test planning.",
            requirements=requirements,
            source_audit=analysis.source_audit,
            unresolved_issues=[*repository_issues, *analysis.source_audit.issues],
        )

        runner = self._runner.for_run() if self._runner else None
        readiness = check_project_readiness(repository, runner, self._settings)
        checkpoint("plan", "Project readiness checked.", project_readiness=readiness)
        if repository is not None:
            events.append(
                _event("inspect", f"Project readiness: {readiness.status}.", datetime.now(UTC))
            )
        if readiness.status == "blocked":
            issues = [
                check.detail + f" ({check.subject})"
                for check in readiness.checks
                if check.status != "passed"
            ]
            return VerificationRun(
                id=run_id,
                project_id=project.id,
                mode=self.mode,
                status="blocked",
                stage="plan",
                created_at=now,
                updated_at=datetime.now(UTC),
                input_sha256=digest,
                events=events,
                report=VerificationReport(
                    summary="Project setup blocked test planning and generation. "
                    "No tests were executed.",
                    repository=repository,
                    requirements=requirements,
                    source_audit=analysis.source_audit,
                    project_readiness=readiness,
                    behaviors=_behaviors(requirements, [], [], inspected=False),
                    unresolved_issues=[
                        *repository_issues,
                        *analysis.source_audit.issues,
                        *issues,
                        *readiness.notes,
                    ],
                ),
            )

        try:
            plan = plan_tests(
                self._llm,
                project,
                requirements,
                repository,
                max_scenarios=self._settings.max_scenarios,
            )
        except LLMError as error:
            return self._failed(
                project,
                digest,
                events,
                "plan",
                str(error),
                now,
                requirements,
                repository=repository,
                source_audit=analysis.source_audit,
                project_readiness=readiness,
            )
        plan_gaps = planning_gaps(requirements, plan)
        checkpoint(
            "plan", "Reviewing planned oracles against original requirements.", test_plan=plan
        )
        plan = review_oracles(self._llm, project, requirements, plan, repository)
        review_issues = [
            f"{scenario.id}: {issue}"
            for scenario in plan.scenarios
            for issue in (scenario.oracle_grounding.issues if scenario.oracle_grounding else [])
        ]
        if review_issues:
            events.append(
                _event(
                    "plan",
                    "Some planned oracles lack source support; "
                    "their tests are excluded from automatic execution.",
                    datetime.now(UTC),
                )
            )
            plan = plan.model_copy(
                update={"notes": "\n".join([plan.notes, *review_issues]).strip()}
            )
        events.append(
            _event(
                "plan",
                f"Planned {len(plan.scenarios)} test scenarios; "
                f"{len(plan_gaps)} testable requirements have no scenario.",
                datetime.now(UTC),
            )
        )

        checkpoint(
            "generate",
            "Generating pytest tests from the saved test plan.",
            test_plan=plan,
            planning_gaps=plan_gaps,
        )

        try:
            suite = generate_tests(self._llm, project, requirements, repository, plan=plan)
        except LLMError as error:
            return self._failed(
                project,
                digest,
                events,
                "generate",
                str(error),
                now,
                requirements,
                plan=plan,
                repository=repository,
                source_audit=analysis.source_audit,
                project_readiness=readiness,
            )

        gaps = coverage_gaps(requirements, suite.tests)
        events.append(
            _event(
                "generate",
                f"Generated {len(suite.tests)} pytest tests covering "
                f"{len(requirements) - len(untestable) - len(gaps)} testable requirements.",
                datetime.now(UTC),
            )
        )

        checkpoint(
            "execute",
            "Executing generated tests in the available sandbox."
            if suite.tests
            else "No tests generated; recording gaps without sandbox execution.",
            generated_tests=suite.tests,
            validation_version=VALIDATION_VERSION,
            outcome_mapping_version=OUTCOME_MAPPING_VERSION,
            coverage_gaps=gaps,
            requirement_coverage=requirement_coverage(requirements, suite.tests),
            behaviors=_behaviors(requirements, suite.tests, [], inspected=False, plan=plan),
        )
        execution = self._execute(suite.tests, repository, events, runner=runner)
        executions = execution.executions if execution else []
        attempts = []
        if execution is not None:
            attempts.append(
                _attempt(
                    1,
                    "measure",
                    [test for test in suite.tests if test.validation_status == "validated"],
                    execution,
                )
            )
        tests = suite.tests
        refinement_iterations = 0
        refinement_notes = []
        repairable = [item for item in executions if _repairable(item) and item.test_id]
        if repairable and repository is not None and self._runner is not None:
            checkpoint(
                "improve",
                "Repairing tests with identifiable construction errors.",
                executions=executions,
                execution_attempts=attempts,
                diagnoses=_diagnose(executions),
                evidence=_evidence(executions),
            )
            try:
                refined = refine_tests(
                    self._llm, project, requirements, tests, repairable, repository, plan=plan
                )
                if refined.notes.strip():
                    refinement_notes.append(f"Refinement note: {refined.notes.strip()}")
                if not refined.tests:
                    events.append(
                        _event(
                            "improve",
                            "No safe repair was accepted. "
                            "Original tests and execution errors retained.",
                            datetime.now(UTC),
                        )
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
                    refined_ids = {test.id for test in refined.tests}
                    executions = [item for item in executions if item.test_id not in refined_ids]
                    refinement_iterations = 1
                    checkpoint(
                        "re_measure",
                        "Re-executing the repaired tests.",
                        generated_tests=tests,
                        executions=executions,
                        refinement_iterations=1,
                        execution_attempts=attempts,
                        evidence=_evidence(executions),
                    )
                    rerun = self._execute(
                        refined.tests, repository, events, stage="re_measure", runner=runner
                    )
                    if rerun is not None:
                        attempts.append(_attempt(2, "re_measure", refined.tests, rerun))
                        execution = rerun
                        executions += rerun.executions
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
            *analysis.source_audit.issues,
            *refinement_notes,
            *(f"{item.id} is ambiguous: {item.ambiguity}" for item in ambiguous),
            *(f"{item.id} is not testable as written: {item.text}" for item in untestable),
        ]
        if plan_gaps:
            unresolved.append(f"{len(plan_gaps)} testable requirements have no planned scenario.")
        implemented = {ref for test in tests for ref in validated_scenarios(test)}
        uncovered_scenarios = [
            f"{item.id}: {item.title}" for item in plan.scenarios if item.id not in implemented
        ]
        if uncovered_scenarios:
            unresolved.append(
                f"{len(uncovered_scenarios)} planned scenarios have no generated test "
                "with a validated check."
            )
        if gaps:
            unresolved.append(
                f"{len(gaps)} testable requirements have no generated test "
                "with validated scenario links."
            )
        final_execution = (
            execution.model_copy(update={"executions": executions}) if execution else None
        )
        unresolved.extend(
            _execution_issues(final_execution, tests, sandbox_available=self._runner is not None)
        )
        diagnoses = _diagnose(executions)
        unresolved.extend(_diagnosis_issues(diagnoses, refinement_iterations))
        execution_gaps = [
            f"{test.id}: {test.module}"
            for test in tests
            if not any(item.test_id == test.id for item in executions)
        ]
        for test in tests:
            if any(item.test_id == test.id for item in executions):
                execution_gaps.extend(
                    f"{test.id}::{name}: no final execution outcome"
                    for name in sorted({check.function_name for check in test.validated_checks})
                    if not any(item.test_id == test.id and item.name == name for item in executions)
                )
        if execution_gaps:
            unresolved.append(
                f"{len(execution_gaps)} generated artifacts or validated functions "
                "have no final execution outcome."
            )
        for note in (analysis.notes, plan.notes, suite.notes):
            if note.strip():
                unresolved.append(f"Analyst note: {note.strip()}")

        return VerificationRun(
            id=run_id,
            project_id=project.id,
            mode=self.mode,
            status="completed",
            stage="report",
            created_at=now,
            updated_at=datetime.now(UTC),
            input_sha256=digest,
            events=events,
            report=VerificationReport(
                validation_version=VALIDATION_VERSION,
                outcome_mapping_version=OUTCOME_MAPPING_VERSION,
                source_audit=analysis.source_audit,
                project_readiness=readiness,
                summary=(
                    f"{self.mode.replace('_', ' ').upper()} run. "
                    f"{len(requirements)} requirements extracted and "
                    f"{len(plan.scenarios)} scenarios planned. "
                    f"{len(tests)} pytest tests generated with requirement links. "
                    + _execution_summary_from_items(executions, execution)
                ),
                repository=repository,
                requirements=requirements,
                test_plan=plan,
                planning_gaps=plan_gaps,
                uncovered_scenarios=uncovered_scenarios,
                generated_tests=tests,
                behaviors=_behaviors(
                    requirements, tests, executions, inspected=repository is not None, plan=plan
                ),
                evidence=_evidence(executions),
                unresolved_issues=unresolved,
                coverage_gaps=gaps,
                executions=executions,
                execution_attempts=attempts,
                execution_gaps=execution_gaps,
                diagnoses=diagnoses,
                refinement_iterations=refinement_iterations,
                executed_tests=len(executions),
                execution_success_rate=_success_rate(executions),
                requirement_coverage=requirement_coverage(requirements, tests),
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
                f"the saved code snapshot of {snapshot.root}. "
                "Only public interfaces were sent to the model.",
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
        *,
        runner: TestRunner | None = None,
    ) -> ExecutionResult | None:
        """Run the generated tests in the sandbox, or record that it is unavailable."""
        if runner is None:
            events.append(
                _event(
                    stage,
                    "Test execution is not connected: no sandbox is available, so the "
                    "generated tests were not run.",
                    datetime.now(UTC),
                )
            )
            return None
        eligible = [test for test in tests if test.validation_status == "validated"]
        if len(eligible) != len(tests):
            events.append(
                _event(
                    stage,
                    f"{len(tests) - len(eligible)} artifacts were excluded: "
                    "scenario validation did not pass.",
                    datetime.now(UTC),
                )
            )
        if not eligible:
            return None

        result = None
        try:
            artifact = repository.artifact if repository else None
            execution_root = verified_snapshot_root(artifact, self._settings)
            result = runner.execute(eligible, str(execution_root))
            # A read-only container mount prevents test writes. Recheck host storage
            # as well: discard outcomes if another host process changed the copy.
            verified_snapshot_root(artifact, self._settings)
            result = result.model_copy(
                update={"repository_content_sha256": artifact.content_sha256}
            )
        except SnapshotError as error:
            message = f"Code snapshot verification failed: {error}"
            events.append(_event(stage, message, datetime.now(UTC)))
            return ExecutionResult(
                executions=[],
                exit_code=-1,
                timed_out=False,
                stderr_excerpt=message,
                snapshot_error=message,
                environment=result.environment if result else None,
            )
        if result.environment_error:
            events.append(_event(stage, result.environment_error, datetime.now(UTC)))
            return result
        if result.timed_out:
            events.append(
                _event(stage, f"Execution timed out. {result.stderr_excerpt}", datetime.now(UTC))
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
        stage: Literal["analyze", "plan", "generate"],
        message: str,
        created_at: datetime,
        requirements: list[RequirementItem] | None = None,
        *,
        plan: TestPlan | None = None,
        repository: RepositorySnapshot | None = None,
        source_audit: SourceAnalysisAudit | None = None,
        project_readiness: ProjectReadiness | None = None,
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
                summary=(
                    f"Run failed during the {stage} stage. Completed stage outputs are retained."
                ),
                requirements=requirements or [],
                source_audit=source_audit,
                project_readiness=project_readiness,
                test_plan=plan,
                repository=repository,
                planning_gaps=planning_gaps(requirements or [], plan) if plan else [],
                uncovered_scenarios=(
                    [f"{item.id}: {item.title}" for item in plan.scenarios] if plan else []
                ),
                unresolved_issues=[message, *(source_audit.issues if source_audit else [])],
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
    plan: TestPlan | None = None,
) -> list[Behavior]:
    """One behavior per requirement, linked to its tests and their outcomes (FR8)."""
    behaviors = []
    for requirement in requirements:
        linked = [test for test in tests if requirement.id in test.requirement_ids]
        ids = {test.id for test in linked}
        outcomes = requirement_outcomes(requirement.id, linked, executions, plan)
        planned_ids = (
            {
                scenario.id
                for scenario in plan.scenarios
                if requirement.id in scenario.requirement_ids
            }
            if plan is not None
            else set()
        )
        implemented_ids = {ref for test in linked for ref in validated_scenarios(test)}
        behaviors.append(
            Behavior(
                id=f"B-{requirement.id}",
                requirement_id=requirement.id,
                source_quote=requirement.source_quote,
                description=requirement.text,
                expected_result="; ".join(
                    scenario.expected_result
                    for scenario in plan.scenarios
                    if requirement.id in scenario.requirement_ids
                )
                if plan
                else None,
                code_refs=sorted(
                    {
                        check.target
                        for test in linked
                        for check in requirement_checks(test, requirement.id, plan)
                    }
                ),
                verification_status=_status(
                    requirement,
                    [execution for _, execution in outcomes],
                    inspected=inspected,
                    expected_ids=ids,
                    scenarios_complete=bool(planned_ids)
                    and planned_ids <= implemented_ids
                    and all(test.validation_status == "validated" for test in linked)
                    and all(
                        any(
                            matches_function(outcome, test, check.function_name)
                            for _, outcome in outcomes
                        )
                        for test in linked
                        for check in requirement_checks(test, requirement.id, plan)
                    ),
                ),
                test_refs=[test.module for test in linked],
                evidence_refs=[_evidence_id(index) for index, _ in outcomes],
            )
        )
    return behaviors


def _status(
    requirement: RequirementItem,
    outcomes: list[ExecutedTest],
    *,
    inspected: bool,
    expected_ids: set[str],
    scenarios_complete: bool,
) -> VerificationStatus:
    """Only evidence from running the real system can move a behavior off Unverified.

    Verified stays out of reach until test adequacy is evaluated: passing tests show
    the stated behavior held for the cases that were written, not that they were enough.
    """
    if requirement.ambiguity or not requirement.testable:
        return VerificationStatus.UNCERTAIN
    recorded_ids = {item.test_id for item in outcomes}
    if not inspected or not outcomes or not expected_ids <= recorded_ids or not scenarios_complete:
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
        if _repairable(execution):
            diagnoses.append(
                TestDiagnosis(
                    test_id=execution.test_id,
                    classification="invalid_test",
                    explanation=(
                        "The recorded error identifies a test construction problem. "
                        "One bounded repair may be attempted without changing its expectation."
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
        elif execution.outcome in {"skipped", "error"}:
            diagnoses.append(
                TestDiagnosis(
                    test_id=execution.test_id,
                    classification="inconclusive",
                    explanation=(
                        "The skipped test produced no pass or fail evidence."
                        if execution.outcome == "skipped"
                        else "This error may originate in the test, project, or environment. "
                        "It is not automatically classified or repaired as an invalid test."
                    ),
                )
            )
    return diagnoses


def _repairable(execution: ExecutedTest) -> bool:
    if execution.outcome != "error":
        return False
    message = execution.message
    return ("fixture '" in message and "not found" in message) or (
        execution.module in message
        and any(kind in message for kind in ("SyntaxError", "IndentationError"))
    )


def _attempt(number: int, stage: str, tests: list[GeneratedTest], result: ExecutionResult):
    return ExecutionAttempt(
        number=number,
        stage=stage,
        created_at=datetime.now(UTC),
        tests=[item.model_copy(deep=True) for item in tests],
        result=result.model_copy(deep=True),
        diagnoses=_diagnose(result.executions),
    )


def _replace_tests(
    original: list[GeneratedTest], refined: list[GeneratedTest]
) -> list[GeneratedTest]:
    replacements = {test.id: test for test in refined}
    return [replacements.get(test.id, test) for test in original]


def _diagnosis_issues(diagnoses: list[TestDiagnosis], refinement_iterations: int) -> list[str]:
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
    if original is None:
        return _execution_summary(original)
    counts = Counter(item.outcome for item in executions)
    return (
        f"{len(executions)} final test outcomes recorded "
        f"({counts['passed']} passed, {counts['failed']} failed, {counts['error']} errored). "
        + ("The latest sandbox attempt timed out. " if original.timed_out else "")
        + "Verification status remains bounded by the recorded evidence."
    )


def _execution_issues(
    execution: ExecutionResult | None, tests: list[GeneratedTest], *, sandbox_available=False
) -> list[str]:
    if execution is None:
        if not tests:
            return []
        if sandbox_available:
            return [
                "No tests were eligible for automatic execution: "
                "code-to-plan validation did not pass."
            ]
        return [
            "Generated tests were not executed. Start Docker and run "
            "`bash scripts/build-sandbox.sh` to connect the sandbox."
        ]
    if execution.timed_out:
        return [f"Execution timed out: {execution.stderr_excerpt}"]
    if execution.snapshot_error:
        return [execution.snapshot_error]
    if execution.environment_error:
        return [execution.environment_error]

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
