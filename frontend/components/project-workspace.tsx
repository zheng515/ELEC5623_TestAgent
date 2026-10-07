import { useState } from "react";
import type { Behavior, Project, VerificationRun } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { requirementOutcomes } from "../lib/outcome-mapping";
import { ProjectSetup } from "./project-setup";
import { RepositoryVersion } from "./repository-version";
import { RepositoryChangeSummary } from "./repository-change";
import { RepositoryWatchPanel } from "./repository-watch";
import { SourceAudit } from "./source-audit";
import { TestPlanDetails } from "./test-plan";
import { isRunActive, VALIDATION_VERSION } from "../lib/types";
import { ExecutionHistory } from "./execution-history";
import {
  Badge,
  Empty,
  formatDate,
  modeLabel,
  percent,
  runBadge,
  SectionTitle,
  ErrorNotice,
} from "./ui";

const RUN_STAGES = [
  "understand",
  "inspect",
  "analyze",
  "plan",
  "generate",
  "execute",
  "improve",
  "re_measure",
  "report",
] as const;

function runProgress(run: VerificationRun) {
  if (run.status === "queued") return 5;
  if (run.status === "completed" || run.status === "blocked") return 100;
  const index = RUN_STAGES.indexOf(run.stage);
  return Math.max(10, Math.round(((index + 1) / RUN_STAGES.length) * 100));
}

function outcomesFor(run: VerificationRun | undefined, testId: string) {
  return (run?.report.executions ?? [])
    .filter((execution) => execution.test_id === testId)
    .map((execution) => execution.outcome);
}
function outcomeTone(outcome: string) {
  return outcome === "passed"
    ? "teal"
    : outcome === "skipped"
      ? "neutral"
      : "amber";
}

const EVENT_TITLES: Record<string, string> = {
  queue: "Run queued",
  interrupt: "Run interrupted",
  understand: "Project inputs recorded",
  inspect: "Repository inspected",
  analyze: "Requirements analyzed",
  plan: "Test plan created",
  generate: "Tests generated",
  measure: "Tests executed",
  improve: "Tests refined",
  re_measure: "Tests re-executed",
};
function eventTitle(stage: string, index: number) {
  return (
    EVENT_TITLES[stage] ?? (index === 0 ? "Run started" : "Workflow event")
  );
}

/** Stages of the proposed closed loop, with the state this run actually reached. */
function stageStates(run?: VerificationRun) {
  const analysed =
    run?.status === "completed" ||
    run?.stage === "generate" ||
    run?.stage === "plan" ||
    !!run?.events.some((event) => event.stage === "analyze");
  const stages = [
    {
      name: "Inspect repository",
      state: run?.report.repository
        ? "Complete"
        : run?.status === "completed"
          ? "Not connected"
          : "Not started",
    },
    {
      name: "Analyze requirements",
      state: !run
        ? "Not started"
        : run.mode === "scaffold"
          ? "Blocked"
          : analysed ||
              run.status === "completed" ||
              run.report.generated_tests.length > 0
            ? "Complete"
            : "Failed",
    },
    {
      name: "Plan tests",
      state: run?.report.test_plan
        ? "Complete"
        : run?.stage === "plan" && run.status === "failed"
          ? "Failed"
          : run?.report.project_readiness?.status === "blocked"
            ? "Blocked by project setup"
            : run?.mode === "scaffold"
              ? "Blocked"
              : "Not recorded",
    },
    {
      name: "Generate tests",
      state: !run
        ? "Not started"
        : run.mode === "scaffold"
          ? "Blocked"
          : run.report.project_readiness?.status === "blocked"
            ? "Blocked by project setup"
            : run.status === "completed" ||
                run.report.generated_tests.length > 0
              ? "Complete"
              : run.stage === "generate"
                ? "Failed"
                : "Not started",
    },
    {
      name: "Execute tests",
      state:
        run?.report.generated_tests.length &&
        run.report.generated_tests.every(
          (test) => test.validation_status === "needs_review",
        )
          ? "Excluded by validation"
          : run?.report.execution_attempts?.at(-1)?.result.timed_out
            ? "Timed out"
            : run?.report.executions.length
              ? "Complete"
              : run?.report.execution_attempts?.length
                ? "No outcomes recorded"
                : "Not connected",
    },
    {
      name: "Diagnose & refine",
      state: run?.report.refinement_iterations
        ? `Complete · ${run.report.refinement_iterations} iteration`
        : run?.report.diagnoses?.length
          ? "Diagnosed · no safe repair"
          : run?.mode === "baseline_b2"
            ? "Ready · not needed"
            : "Not connected",
    },
  ];
  if (!isRunActive(run)) return stages;
  const current = {
    understand: 0,
    inspect: 0,
    analyze: 1,
    plan: 2,
    generate: 3,
    execute: 4,
    improve: 5,
    re_measure: 5,
    report: 6,
  }[run!.stage];
  return stages.map((stage, index) => ({
    ...stage,
    state:
      run?.status === "queued"
        ? index === 0
          ? "Queued"
          : "Not started"
        : index === current
          ? "Running"
          : index > current
            ? "Not started"
            : index === 0 && !run?.report.repository
              ? "Not available"
              : "Complete",
  }));
}

export function Workspace({
  project,
  run,
  start,
  busy,
  activeRun,
  refresh,
}: {
  project: Project;
  run?: VerificationRun;
  start: () => void;
  busy: boolean;
  activeRun?: VerificationRun;
  refresh?: () => void;
}) {
  return (
    <>
      <div className="workspace-heading">
        <div>
          <Badge tone={runBadge(run).tone}>{runBadge(run).label}</Badge>
          <h1>Agent workspace</h1>
          <p>{project.goal}</p>
        </div>
        <div className="workspace-actions">
          <a
            className="button secondary"
            href={urlFor("edit", project.id, run?.id)}
            aria-disabled={busy || !!activeRun || isRunActive(run)}
            onClick={(event) => {
              if (busy || activeRun || isRunActive(run)) event.preventDefault();
            }}
          >
            Edit inputs
          </a>
          <button
            className="button primary"
            disabled={busy || !!activeRun || isRunActive(run)}
            onClick={start}
          >
            {busy
              ? "Creating run…"
              : activeRun || isRunActive(run)
                ? "Run in progress"
                : run && run.mode !== "scaffold"
                  ? "Run verification again ↗"
                  : run
                    ? "Create another setup run ↗"
                    : "Create setup run ↗"}
          </button>
        </div>
      </div>
      {isRunActive(run) && (
        <div className="run-live" role="status">
          <strong>
            {run?.status === "queued"
              ? "Waiting for the worker"
              : "Agent is working"}
          </strong>
          <p>{run?.report.summary}</p>
          <div
            className="run-progress"
            role="progressbar"
            aria-label="Verification run progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={runProgress(run!)}
          >
            <span style={{ width: `${runProgress(run!)}%` }} />
          </div>
          <span>
            {runProgress(run!)}% · Current stage: {run!.stage.replace("_", " ")}
            . Updates automatically every 2 seconds.
          </span>
        </div>
      )}
      {run?.status === "failed" && (
        <ErrorNotice
          message={`${run.report.summary} ${run.report.unresolved_issues.at(-1) ?? "Review the activity log, then edit the inputs or retry the run."}`}
          retry={start}
        />
      )}
      {activeRun && activeRun.id !== run?.id && (
        <p>
          <a href={urlFor("workspace", project.id, activeRun.id)}>
            Open the active run →
          </a>
        </p>
      )}
      <div className="run-context">
        <span>
          {run ? `RUN ${run.id.slice(0, 8).toUpperCase()}` : "NO RUN SELECTED"}
        </span>
        <span>{run ? formatDate(run.created_at) : "Inputs saved"}</span>
        <span>{modeLabel(run?.mode)}</span>
        {run?.trigger === "watch" && <span>STARTED BY REPOSITORY WATCH</span>}
      </div>
      <RepositoryWatchPanel project={project} onNewRun={refresh} />
      <RepositoryChangeSummary run={run} />
      <section className="stage-panel">
        <div>
          <span className="eyebrow">CURRENT STATE</span>
          <h2>
            {!run
              ? "Your verification goal is ready."
              : run.status === "completed"
                ? `${run.report.requirements.length} requirements analyzed, ${run.report.generated_tests.length} tests generated.`
                : isRunActive(run)
                  ? run.report.summary
                  : run.status === "failed"
                    ? run.report.requirements.length || run.report.test_plan
                      ? "The run stopped. Completed stage outputs are retained."
                      : "The run failed before it produced a result."
                    : "Inputs recorded. Waiting for agent integration."}
          </h2>
          <p>
            {run?.report.executed_tests
              ? "Review recorded execution evidence and remaining gaps. Passing tests alone do not establish complete verification."
              : run?.report.requirements.length
                ? "Review the saved requirements, test plan, and gaps. No execution evidence has been recorded."
                : isRunActive(run)
                  ? "Results will appear as the agent completes each stage."
                  : "No requirement analysis or test execution has taken place."}
          </p>
        </div>
        <div className="stages">
          {stageStates(run).map((stage, i) => (
            <div
              key={stage.name}
              className={
                stage.state === "Complete"
                  ? "stage complete"
                  : stage.state === "Running"
                    ? "stage running"
                    : stage.state === "Not started"
                      ? "stage"
                      : "stage blocked"
              }
            >
              <span>0{i + 1}</span>
              <strong>{stage.name}</strong>
              <small>{stage.state}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="workspace-grid">
        <section className="panel">
          <SectionTitle
            eyebrow="OBSERVABLE ACTIONS"
            title="Agent activity"
            action={<Badge>{run?.events.length ?? 0} recorded events</Badge>}
          />
          {run ? (
            <ol className="timeline">
              {run.events.map((event, i) => (
                <li key={event.id}>
                  <div className="timeline-dot">{i + 1}</div>
                  <div>
                    <span className="event-time">
                      {formatDate(event.created_at)} · {event.stage}
                    </span>
                    <h3>{eventTitle(event.stage, i)}</h3>
                    <p>{event.message}</p>
                    <details>
                      <summary>View record</summary>
                      <dl className="key-values">
                        <dt>Event ID</dt>
                        <dd>
                          <code>{event.id}</code>
                        </dd>
                        <dt>Evidence type</dt>
                        <dd>Workflow record · not test execution evidence</dd>
                      </dl>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="No actions recorded yet">
              Create a setup run to record the project inputs and integration
              status.
            </Empty>
          )}
        </section>
        <div>
          <section className="panel">
            <SectionTitle
              eyebrow="EVIDENCE FIRST"
              title="Verification snapshot"
            />
            <div className="snapshot">
              <div>
                <span>Requirements analyzed</span>
                <strong>{run?.report.requirements.length || "—"}</strong>
              </div>
              <div>
                <span>Tests generated</span>
                <strong>{run?.report.generated_tests.length || "—"}</strong>
              </div>
              <div>
                <span>Executed tests</span>
                <strong>{run?.report.executed_tests ?? "—"}</strong>
              </div>
              <div>
                <span>
                  {run?.report.validation_version === VALIDATION_VERSION
                    ? "Validated requirement links"
                    : "Requirement coverage"}
                </span>
                <strong>
                  {percent(run?.report.requirement_coverage) ?? "Not evaluated"}
                </strong>
              </div>
            </div>
            <a
              className="text-button"
              href={urlFor("evidence", project.id, run?.id)}
            >
              Explore requirements & evidence →
            </a>
          </section>
          <section className="panel blocker-panel">
            <SectionTitle
              eyebrow="WHAT NEEDS ATTENTION?"
              title={
                run?.status === "completed"
                  ? "Unresolved issues"
                  : "Integration needed"
              }
            />
            <p>
              Ambiguous requirements, coverage gaps, and missing integrations.
              Nothing here is a verification claim.
            </p>
            <ul>
              {(
                run?.report.unresolved_issues ?? [
                  "Connect the requirement analyzer and isolated test runner.",
                ]
              ).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <section className="panel">
        <SectionTitle
          eyebrow="REQUIREMENT → SCENARIO → TEST"
          title="Test plan"
          action={
            <Badge>
              {run?.report.test_plan?.scenarios.length ?? 0}{" "}
              {run?.report.test_plan?.scenarios.length === 1
                ? "scenario"
                : "scenarios"}
            </Badge>
          }
        />
        <ProjectSetup readiness={run?.report.project_readiness} />
        <RepositoryVersion repository={run?.report.repository} />
        <SourceAudit report={run?.report} />
        <TestPlanDetails report={run?.report} />
      </section>
      <section className="panel">
        <SectionTitle
          eyebrow="OUTPUTS"
          title="Generated tests"
          action={
            <Badge>{run?.report.generated_tests.length ?? 0} tests</Badge>
          }
        />
        {run?.report.generated_tests.length ? (
          <>
            <ul className="test-list">
              {run.report.generated_tests.map((test) => (
                <li key={test.id}>
                  <div className="test-heading">
                    <code>{test.module}</code>
                    <span className="test-tags">
                      <Badge>
                        {test.requirement_ids.length
                          ? test.requirement_ids.join(", ")
                          : "No linked requirement"}
                      </Badge>
                      {!!test.scenario_ids?.length && (
                        <Badge>{test.scenario_ids.join(", ")}</Badge>
                      )}
                      {outcomesFor(run, test.id).map((outcome, index) => (
                        <Badge key={index} tone={outcomeTone(outcome)}>
                          {outcome}
                        </Badge>
                      ))}
                    </span>
                  </div>
                  <p>{test.rationale || test.name}</p>
                  <Badge
                    tone={
                      test.validation_status === "validated" ? "teal" : "amber"
                    }
                  >
                    {test.validation_status === "validated"
                      ? "Plan contract matched"
                      : test.validation_status === "needs_review"
                        ? "Needs review"
                        : "Links not checked"}
                  </Badge>
                  <p className="small muted">
                    {test.validation_status === "validated"
                      ? "Code matches the plan contract. This does not prove test adequacy."
                      : test.validation_status === "needs_review"
                        ? "Excluded from validated coverage and automatic execution."
                        : "This artifact has no code-to-plan validation record."}
                  </p>
                  {!!test.validation_issues?.length && (
                    <ul>
                      {test.validation_issues.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {!!test.validated_checks?.length && (
                    <ul>
                      {test.validated_checks.map((check, index) => (
                        <li key={index}>
                          {check.scenario_id}: {check.function_name} →{" "}
                          {check.target} (call line {check.call_line}, assertion
                          line {check.assertion_line})
                        </li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary>View generated code</summary>
                    <pre className="test-code">{test.code}</pre>
                  </details>
                </li>
              ))}
            </ul>
            <p className="small muted">
              {run.report.executed_tests
                ? "Outcomes come from a sandboxed pytest run. A passing test is not verification of test adequacy; review source links and coverage gaps."
                : "These tests were generated from the requirements and available test plan. They have not been executed, so none of them is known to run or pass."}
            </p>
          </>
        ) : (
          <Empty title="No test artifacts yet">
            Generated tests appear here after the generation stage. Execution
            results follow when the sandboxed runner is connected.
          </Empty>
        )}
      </section>
      {!!run?.report.execution_attempts?.length && (
        <section className="panel">
          <SectionTitle
            title="Execution history"
            eyebrow="ORIGINAL AND REPAIRED TEST ARTIFACTS"
          />
          <ExecutionHistory report={run.report} />
        </section>
      )}
      {!!run?.report.diagnoses?.length && (
        <section className="panel">
          <SectionTitle
            eyebrow="EXECUTION FEEDBACK"
            title="Failure diagnosis"
            action={
              <Badge>
                {run.report.refinement_iterations ?? 0} refinement iteration
              </Badge>
            }
          />
          <ul className="issue-list">
            {run.report.diagnoses.map((diagnosis, index) => (
              <li key={`${diagnosis.test_id}-${index}`}>
                <strong>{diagnosis.test_id || "Unmatched test"}</strong>{" "}
                <Badge tone="amber">
                  {diagnosis.classification.replaceAll("_", " ")}
                </Badge>
                <p>{diagnosis.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function Evidence({
  project,
  run,
}: {
  project: Project;
  run?: VerificationRun;
}) {
  const [status, setStatus] = useState("All statuses");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const behaviors = run?.report.behaviors ?? [];
  const filtered = behaviors.filter(
    (b) =>
      (status === "All statuses" || b.verification_status === status) &&
      `${b.id} ${b.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = filtered.find((b) => b.id === selectedId) ?? filtered[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            REQUIREMENT → BEHAVIOR → TEST → EVIDENCE
          </span>
          <h1>Requirements & evidence</h1>
          <p>
            Inspect what should be verified, and what actually supports each
            conclusion.
          </p>
        </div>
      </div>
      <section className="panel">
        <SectionTitle
          title="Original requirements"
          action={<Badge>Saved input</Badge>}
        />
        <pre className="requirement-source">{project.requirements_text}</pre>
        <div className="source-footer">
          <span>Repository reference</span>
          <code>{project.repository_ref || "Not provided"}</code>
          <small>
            {run?.report.repository
              ? `Read the public interface of ${run.report.repository.modules.length} modules. Only public interfaces were sent to the model.`
              : "Source code has not been inspected."}
          </small>
        </div>
      </section>
      <ProjectSetup readiness={run?.report.project_readiness} />
      <RepositoryVersion repository={run?.report.repository} />
      <SourceAudit report={run?.report} />
      {!behaviors.length && !!run?.report.requirements.length && (
        <section className="panel">
          <SectionTitle
            title="Analyzed requirements"
            action={<Badge>Retained outputs</Badge>}
          />
          {run.report.requirements.map((requirement) => (
            <div className="scenario-card" key={requirement.id}>
              <strong>{requirement.id}</strong>
              <p>{requirement.text}</p>
              <Badge>
                {requirement.testable ? "Testable" : "Not testable as written"}
              </Badge>
              <blockquote>{requirement.source_quote}</blockquote>
              {requirement.ambiguity && (
                <p>Ambiguity: {requirement.ambiguity}</p>
              )}
            </div>
          ))}
        </section>
      )}
      {run?.report.repository && (
        <section className="panel">
          <SectionTitle
            eyebrow="WHAT THE AGENT COULD SEE"
            title="Inspected interfaces"
            action={
              <Badge>{run.report.repository.modules.length} modules</Badge>
            }
          />
          <ul className="module-list">
            {run.report.repository.modules.map((module) => (
              <li key={module.module}>
                <div className="test-heading">
                  <code>{module.module}</code>
                  <small className="muted">{module.path}</small>
                </div>
                {module.docstring && <p>{module.docstring}</p>}
                <pre className="test-code">
                  {[
                    ...module.constants,
                    ...module.functions.map((f) => `def ${f}`),
                    ...module.classes.map((c) => `class ${c}`),
                  ].join("\n") || "No public interface."}
                </pre>
              </li>
            ))}
          </ul>
          {run.report.repository.truncated && (
            <p className="small muted">
              The repository was larger than the inspection limit, so this list
              is incomplete.
            </p>
          )}
        </section>
      )}
      <section className="panel">
        <SectionTitle
          eyebrow="BEHAVIOR-LEVEL TRACEABILITY"
          title="Verification coverage"
          action={<Badge>{behaviors.length} behaviors</Badge>}
        />
        <div className="filters">
          <label>
            <span className="sr-only">Filter verification status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                "All statuses",
                "Verified",
                "Partially Verified",
                "Unverified",
                "Uncertain",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Search behaviors</span>
            <input
              type="search"
              placeholder="Search behaviors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {!filtered.length ? (
          <Empty
            title={
              behaviors.length
                ? "No matching behaviors"
                : run?.report.requirements.length
                  ? "No behavior results recorded"
                  : "Behavior analysis is not connected"
            }
          >
            {behaviors.length
              ? "Adjust your search or status filter."
              : run?.report.requirements.length
                ? "Analyzed requirements are retained above. This run did not produce a behavior-to-test mapping."
                : "Your requirements are saved. Behaviors and evidence links will appear when the analyzer returns structured results."}
          </Empty>
        ) : (
          <div className="evidence-grid">
            <div className="behavior-list">
              {filtered.map((b) => (
                <button
                  key={b.id}
                  className={`behavior-item ${b.id === selected?.id ? "selected" : ""}`}
                  aria-pressed={b.id === selected?.id}
                  onClick={() => setSelectedId(b.id)}
                >
                  <small>
                    {b.requirement_id} / {b.id}
                  </small>
                  <strong>{b.description}</strong>
                  <Badge
                    tone={
                      b.verification_status === "Verified" ||
                      b.verification_status === "Partially Verified"
                        ? "teal"
                        : "amber"
                    }
                  >
                    {b.verification_status}
                  </Badge>
                </button>
              ))}
            </div>
            {selected && <BehaviorDetail behavior={selected} run={run} />}
          </div>
        )}
        <div className="status-legend">
          {["Verified", "Partially Verified", "Unverified", "Uncertain"].map(
            (s) => (
              <span key={s}>○ {s}</span>
            ),
          )}
        </div>
      </section>
    </>
  );
}
function BehaviorDetail({
  behavior: b,
  run,
}: {
  behavior: Behavior;
  run?: VerificationRun;
}) {
  return (
    <article className="evidence-detail" aria-live="polite">
      <span className="eyebrow">EVIDENCE CHAIN / {b.id}</span>
      <h3>{b.description}</h3>
      <h4>Requirement source</h4>
      <blockquote>{b.source_quote}</blockquote>
      <h4>Expected result</h4>
      <p>{b.expected_result || "Not specified"}</p>
      {[
        ["Implementation", b.code_refs],
        ["Tests", b.test_refs],
        ["Execution evidence", b.evidence_refs],
      ].map(([title, refs]) => (
        <div key={title as string}>
          <h4>{title}</h4>
          {(refs as string[]).length ? (
            <ul>
              {(refs as string[]).map((ref) => (
                <li key={ref}>
                  <code>{ref}</code>
                  {title === "Execution evidence" && (
                    <pre>
                      {JSON.stringify(
                        run?.report.evidence.find((e) => e.id === ref) ?? {
                          note: "Evidence detail not available in this report.",
                        },
                        null,
                        2,
                      )}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No linked evidence.</p>
          )}
        </div>
      ))}
    </article>
  );
}

export function Report({
  project,
  run,
  runs,
  download,
  downloadHtml,
  busy,
}: {
  project: Project;
  run?: VerificationRun;
  runs: VerificationRun[];
  download: () => void;
  downloadHtml: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A TRACEABLE RECORD</span>
          <h1>Runs & reports</h1>
          <p>Review the scope, outcomes, and unresolved issues of each run.</p>
        </div>
        {run && (
          <div className="report-downloads">
            <button
              className="button secondary"
              onClick={downloadHtml}
              disabled={busy || isRunActive(run)}
            >
              {busy ? "Preparing…" : "Download HTML ↓"}
            </button>
            <button
              className="text-button"
              onClick={download}
              disabled={busy || isRunActive(run)}
            >
              Download JSON ↓
            </button>
          </div>
        )}
      </div>
      {!run ? (
        <section className="panel">
          <Empty
            title="No reports yet"
            action={
              <a
                className="button primary"
                href={urlFor("workspace", project.id)}
              >
                Open agent workspace →
              </a>
            }
          >
            Create a setup run to generate the first record for this project.
          </Empty>
        </section>
      ) : (
        <div className="report-layout">
          <aside className="panel run-history">
            <SectionTitle title="Run history" />
            {runs.map((r) => (
              <a
                key={r.id}
                className={`history-item ${r.id === run.id ? "selected" : ""}`}
                href={urlFor("reports", project.id, r.id)}
                aria-current={r.id === run.id ? "page" : undefined}
              >
                <strong>Run {r.id.slice(0, 8)}</strong>
                <small>{formatDate(r.created_at)}</small>
                <Badge tone={runBadge(r).tone}>
                  {isRunActive(r)
                    ? r.status === "queued"
                      ? "Queued"
                      : "Running"
                    : r.status === "blocked"
                      ? "Blocked"
                      : r.status === "failed"
                        ? "Failed"
                        : "Generated"}
                </Badge>
              </a>
            ))}
          </aside>
          <article className="panel report-document">
            <div className="report-cover">
              <span className="eyebrow">VERIFICATION REPORT</span>
              <h2>{project.name}</h2>
              <p>{run.report.summary}</p>
              <Badge tone={runBadge(run).tone}>
                {run.status === "completed"
                  ? run.report.generated_tests.some(
                      (test) => test.validation_status === "needs_review",
                    )
                    ? "Review needed · test validation incomplete"
                    : run.report.executed_tests
                      ? "Execution evidence recorded"
                      : "Tests generated · not executed"
                  : isRunActive(run)
                    ? "Run in progress · interim results"
                    : run.status === "failed"
                      ? "Run failed · review retained outputs"
                      : "Setup only · no executed verification"}
              </Badge>
            </div>
            <section>
              <h3>01 / Scope & goal</h3>
              <p>{project.goal}</p>
              <dl className="key-values">
                <dt>Run ID</dt>
                <dd>
                  <code>{run.id}</code>
                </dd>
                <dt>Recorded</dt>
                <dd>{formatDate(run.created_at)} (Sydney)</dd>
                <dt>Repository</dt>
                <dd>{project.repository_ref || "Not provided"}</dd>
                <dt>Input fingerprint</dt>
                <dd>
                  <code>{run.input_sha256}</code>
                </dd>
              </dl>
              <p className="small muted">
                The fingerprint identifies the saved input. It is not a
                source-code snapshot.
              </p>
            </section>
            <section>
              <h3>02 / Verification results</h3>
              <div className="report-metrics">
                <div>
                  <strong>{run.report.generated_tests.length}</strong>
                  <span>Generated tests</span>
                </div>
                <div>
                  <strong>{run.report.executed_tests}</strong>
                  <span>Executed tests</span>
                </div>
                <div>
                  <strong>
                    {percent(run.report.requirement_coverage) ?? "—"}
                  </strong>
                  <span>
                    {run?.report.validation_version === VALIDATION_VERSION
                      ? "Validated requirement links"
                      : "Requirement coverage"}
                  </span>
                </div>
                <div>
                  <strong>
                    {percent(run.report.execution_success_rate) ?? "—"}
                  </strong>
                  <span>Execution success rate</span>
                </div>
                <div>
                  <strong>
                    {run.report.semantic_coverage == null
                      ? "—"
                      : `${run.report.semantic_coverage}%`}
                  </strong>
                  <span>Semantic coverage</span>
                </div>
                <div>
                  <strong>
                    {run.report.mutation_score == null
                      ? "—"
                      : `${run.report.mutation_score}%`}
                  </strong>
                  <span>Mutation score</span>
                </div>
              </div>
              <p className="small muted">
                Requirement coverage measures generated links, not execution or
                test adequacy. An em dash means not evaluated. Active runs show
                interim results; downloads become available when the run stops.
              </p>
            </section>
            <section>
              <h3>Test plan</h3>
              <ProjectSetup readiness={run.report.project_readiness} />
              <RepositoryVersion repository={run.report.repository} />
              <RepositoryChangeSummary run={run} />
              <SourceAudit report={run.report} />
              <TestPlanDetails report={run.report} />
            </section>
            {!!run.report.execution_attempts?.length && (
              <section>
                <h3>Execution history</h3>
                <ExecutionHistory report={run.report} />
              </section>
            )}
            <section>
              <h3>03 / Requirement to test mapping</h3>
              {run.report.requirements.length ? (
                <>
                  <table className="trace-table">
                    <thead>
                      <tr>
                        <th>Requirement</th>
                        <th>Testable</th>
                        <th>Generated tests</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.report.requirements.map((requirement) => {
                        const tests = run.report.generated_tests.filter((t) =>
                          t.requirement_ids.includes(requirement.id),
                        );
                        return (
                          <tr key={requirement.id}>
                            <td>
                              <code>{requirement.id}</code> {requirement.text}
                              {requirement.ambiguity && (
                                <small className="muted">
                                  {" "}
                                  Ambiguity: {requirement.ambiguity}
                                </small>
                              )}
                            </td>
                            <td>{requirement.testable ? "Yes" : "No"}</td>
                            <td>
                              {tests.length
                                ? tests.map((t) => t.module).join(", ")
                                : "—"}
                            </td>
                            <td>
                              {requirementOutcomes(run.report, requirement.id)
                                .map((e) => `${e.name}: ${e.outcome}`)
                                .join(", ") || "No attributable outcome"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="small muted">
                    Outcomes follow validated scenario and test function links.
                    A function shared by multiple requirements supplies the same
                    outcome to each; individual assertion outcomes are not
                    recorded.
                  </p>
                </>
              ) : (
                <p className="muted">
                  No structured requirements were produced by this run.
                </p>
              )}
            </section>
            <section>
              <h3>04 / Unresolved issues</h3>
              <ul className="issue-list">
                {run.report.unresolved_issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
            {run.report.executions.length > 0 && (
              <section>
                <h3>05 / Execution evidence</h3>
                <table className="trace-table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Outcome</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.report.executions.map((execution, index) => (
                      <tr key={index}>
                        <td>
                          <code>
                            {execution.module}::{execution.name}
                          </code>
                        </td>
                        <td>{execution.outcome}</td>
                        <td>{execution.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="small muted">
                  Recorded from a sandboxed pytest run with no network access. A
                  passing test shows the test ran green, not that the
                  requirement is satisfied by the real system.
                </p>
              </section>
            )}
            <section>
              <h3>
                {run.report.executions.length ? "06" : "05"} / Activity record
              </h3>
              {run.events.map((e) => (
                <div className="report-event" key={e.id}>
                  <span>{e.stage}</span>
                  <p>{e.message}</p>
                </div>
              ))}
            </section>
            <footer>
              ReqTest · Requirement-aware verification · {run.id.slice(0, 8)}
            </footer>
          </article>
        </div>
      )}
    </>
  );
}
