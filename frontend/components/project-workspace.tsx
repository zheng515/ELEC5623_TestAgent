import { useState } from "react";
import type { Behavior, Project, VerificationRun } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { Badge, Empty, formatDate, SectionTitle } from "./ui";

export function Workspace({
  project,
  run,
  start,
  busy,
}: {
  project: Project;
  run?: VerificationRun;
  start: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="workspace-heading">
        <div>
          <Badge tone="amber">
            {run ? "Blocked · Integration required" : "Ready for setup"}
          </Badge>
          <h1>Agent workspace</h1>
          <p>{project.goal}</p>
        </div>
        <button className="button primary" disabled={busy} onClick={start}>
          {busy
            ? "Creating run…"
            : run
              ? "Analyze requirements again ↗"
              : "Analyze requirements ↗"}
        </button>
      </div>
      <div className="run-context">
        <span>
          {run ? `RUN ${run.id.slice(0, 8).toUpperCase()}` : "NO RUN SELECTED"}
        </span>
        <span>{run ? formatDate(run.created_at) : "Inputs saved"}</span>
        <span>{run?.mode === "analysis" ? "Analysis mode" : "Setup mode"}</span>
      </div>
      <section className="stage-panel">
        <div>
          <span className="eyebrow">CURRENT STATE</span>
          <h2>
            {run
              ? `${run.report.behaviors.length} behavior candidates identified.`
              : "Your verification goal is ready."}
          </h2>
          <p>
            Requirement sources are traceable. Code inspection and test
            execution are waiting for integration.
          </p>
        </div>
        <div className="stages">
          {["Understand", "Measure", "Improve", "Re-measure"].map((s, i) => (
            <div key={s} className={i === 0 && run ? "stage blocked" : "stage"}>
              <span>0{i + 1}</span>
              <strong>{s}</strong>
              <small>
                {i === 0 && run ? "Analyzed" : i === 1 && run ? "Blocked" : "Not started"}
              </small>
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
                    <h3>
                      {i === 0
                        ? "Project inputs recorded"
                        : i === 1
                          ? "Requirements analyzed"
                          : "Workflow blocked"}
                    </h3>
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
              Start a run to analyze the requirement source and record its
              integration status.
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
                <span>Analyzed behaviors</span>
                <strong>{run?.report.behaviors.length || "—"}</strong>
              </div>
              <div>
                <span>Executed tests</span>
                <strong>{run?.report.executed_tests ?? "—"}</strong>
              </div>
              <div>
                <span>Semantic coverage</span>
                <strong>
                  {run?.report.semantic_coverage == null
                    ? "Not evaluated"
                    : `${run.report.semantic_coverage}%`}
                </strong>
              </div>
              <div>
                <span>Mutation score</span>
                <strong>
                  {run?.report.mutation_score == null
                    ? "Not evaluated"
                    : `${run.report.mutation_score}%`}
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
              eyebrow="WHAT IS BLOCKING THIS RUN?"
              title="Integration needed"
            />
            <p>
              These are implementation dependencies, not business questions for
              you to approve.
            </p>
            <ul>
              {(
                run?.report.unresolved_issues ?? [
                  "Connect code inspection and the isolated test runner.",
                ]
              ).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <section className="panel">
        <SectionTitle eyebrow="OUTPUTS" title="Tests & findings" />
        <div className="outputs-grid">
          <div>
            <span className="output-icon">{"{}"}</span>
            <h3>No test artifacts yet</h3>
            <p>
              Generated tests, execution results, and changes will appear after
              the test-generation and runner modules are connected.
            </p>
          </div>
          <div>
            <span className="output-icon">↗</span>
            <h3>No diagnostic findings yet</h3>
            <p>
              Requirement questions and suspected defects will be linked to
              their supporting evidence here.
            </p>
          </div>
        </div>
      </section>
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
          <small>Source code has not been inspected.</small>
        </div>
      </section>
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
                : "No behaviors analyzed"
            }
          >
            {behaviors.length
              ? "Adjust your search or status filter."
              : "Start an analysis run to create traceable behavior candidates from the requirement source."}
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
                      b.verification_status === "Verified" ? "teal" : "amber"
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
        ["Source evidence", b.evidence_refs],
      ].map(([title, refs]) => (
        <div key={title as string}>
          <h4>{title}</h4>
          {(refs as string[]).length ? (
            <ul>
              {(refs as string[]).map((ref) => (
                <li key={ref}>
                  <code>{ref}</code>
                  {title === "Source evidence" && (
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
  busy,
}: {
  project: Project;
  run?: VerificationRun;
  runs: VerificationRun[];
  download: () => void;
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
          <button
            className="button secondary"
            onClick={download}
            disabled={busy}
          >
            {busy ? "Preparing…" : "Download JSON ↓"}
          </button>
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
            Analyze the requirements to generate the first record for this project.
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
                <Badge tone="amber">Blocked</Badge>
              </a>
            ))}
          </aside>
          <article className="panel report-document">
            <div className="report-cover">
              <span className="eyebrow">VERIFICATION REPORT</span>
              <h2>{project.name}</h2>
              <p>{run.report.summary}</p>
              <Badge tone="amber">Setup only · no executed verification</Badge>
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
                  <strong>{run.report.executed_tests}</strong>
                  <span>Executed tests</span>
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
                An em dash means not evaluated. No verification claims are made
                without execution evidence.
              </p>
            </section>
            <section>
              <h3>03 / Unresolved dependencies</h3>
              <ul className="issue-list">
                {run.report.unresolved_issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>04 / Activity record</h3>
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
