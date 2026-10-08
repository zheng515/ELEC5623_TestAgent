import { useState } from "react";
import { TestBrowser } from "./test-browser";
import type { Behavior, Project, VerificationRun } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { ProjectSetup } from "./project-setup";
import { RepositoryVersion } from "./repository-version";
import { RepositoryChangeSummary } from "./repository-change";
import { RepositoryWatchPanel } from "./repository-watch";
import { SourceAudit } from "./source-audit";
import { TestPlanDetails } from "./test-plan";
import { isRunActive } from "../lib/types";
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

export function Workspace({
  project,
  run,
  start,
  busy,
  activeRun,
  refresh,
  validationVersion,
}: {
  project: Project;
  run?: VerificationRun;
  start: () => void;
  busy: boolean;
  activeRun?: VerificationRun;
  refresh?: () => void;
  validationVersion?: number;
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
      {run && !isRunActive(run) && (
        <p className="run-summary">{run.report.summary}</p>
      )}
      {isRunActive(run) && (
        <div className="run-live" role="status">
          <strong>
            {run?.status === "queued"
              ? "Waiting for the worker"
              : "Agent is working"}
          </strong>
          <p>{run?.report.summary}</p>
          <span>
            Current stage: {run!.stage.replace("_", " ")}. Updates automatically
            every 2 seconds.
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
      <TestBrowser key={run?.id ?? project.id} run={run} />
      <details className="technical-drawer repository-monitoring">
        <summary>Repository monitoring and changes</summary>
        <RepositoryWatchPanel project={project} onNewRun={refresh} />
        <RepositoryChangeSummary run={run} />
      </details>
      <details className="technical-drawer">
        <summary>
          Technical details · Agent activity, checks and reports
        </summary>
        <div className="run-context">
          <span>
            {run
              ? `RUN ${run.id.slice(0, 8).toUpperCase()}`
              : "NO RUN SELECTED"}
          </span>
          <span>{run ? formatDate(run.created_at) : "Inputs saved"}</span>
          <span>{modeLabel(run?.mode)}</span>
          {run && <span>Recorded stage: {run.stage.replaceAll("_", " ")}</span>}
          {run?.trigger === "watch" && <span>STARTED BY REPOSITORY WATCH</span>}
        </div>
        <div className="workspace-grid">
          <section className="panel">
            <SectionTitle
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
              <SectionTitle title="Verification snapshot" />
              <div className="snapshot">
                <div>
                  <span>Requirements analyzed</span>
                  <strong>{run ? run.report.requirements.length : "—"}</strong>
                </div>
                <div>
                  <span>Tests generated</span>
                  <strong>
                    {run ? run.report.generated_tests.length : "—"}
                  </strong>
                </div>
                <div>
                  <span>Executed tests</span>
                  <strong>{run?.report.executed_tests ?? "—"}</strong>
                  {run?.status === "completed" &&
                    !run.report.generated_tests.length && (
                      <span>Skipped · no generated tests</span>
                    )}
                </div>
                <div>
                  <span>
                    {validationVersion !== undefined &&
                    run?.report.validation_version === validationVersion
                      ? "Validated requirement links"
                      : "Requirement coverage"}
                  </span>
                  <strong>
                    {percent(run?.report.requirement_coverage) ??
                      "Not evaluated"}
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
      </details>
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
