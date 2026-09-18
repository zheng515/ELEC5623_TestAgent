"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api, downloadReport } from "@/lib/api";
import type {
  Project,
  ProjectCreate,
  SystemInfo,
  VerificationRun,
} from "@/lib/types";

type View = "overview" | "requirements" | "runs" | "integrations";
const views: { id: View; label: string; symbol: string }[] = [
  { id: "overview", label: "Verification Workbench", symbol: "◫" },
  { id: "requirements", label: "Requirements & Behavior", symbol: "≡" },
  { id: "runs", label: "Runs & Reports", symbol: "↗" },
  { id: "integrations", label: "Integrations", symbol: "⊞" },
];
const blank: ProjectCreate = {
  name: "",
  description: "",
  repository_ref: "",
  requirements_text: "",
};
const example: ProjectCreate = {
  name: "Shipping service",
  description: "Verify shipping rules, amount boundaries, and invalid input.",
  repository_ref: "",
  requirements_text:
    "R1: Order amount is represented as integer cents. Shipping is free when the amount is at least 10,000 cents; otherwise charge 1,000 cents.\nR2: Negative amounts must raise ValueError.",
};
const date = (value: string) =>
  new Date(value).toLocaleString("en-US", { hour12: false });
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Operation failed. Please try again.";

export default function Workbench() {
  const [view, setView] = useState<View>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [runData, setRunData] = useState<{
    projectId: string;
    revision: number;
    items: VerificationRun[];
  }>({ projectId: "", revision: 0, items: [] });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProjectCreate>(blank);
  const [activeRunId, setActiveRunId] = useState("");
  const [reload, setReload] = useState(0);
  const runsLoading =
    Boolean(selectedId) &&
    (runData.projectId !== selectedId || runData.revision !== reload);
  const runs = runsLoading ? [] : runData.items;
  const project = projects.find((item) => item.id === selectedId);
  const latest = runs[0];
  const activeRun = runs.find((run) => run.id === activeRunId) ?? latest;

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.projects(), api.system()])
      .then(([items, info]) => {
        if (cancelled) return;
        setProjects(items);
        setSystem(info);
        setSelectedId((id) =>
          items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSystem(null);
          setError(message(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    api
      .runs(selectedId)
      .then((items) => {
        if (!cancelled)
          setRunData({ projectId: selectedId, revision: reload, items });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(message(err));
          setRunData({ projectId: selectedId, revision: reload, items: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reload]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createProject(form);
      setProjects((items) => [created, ...items]);
      selectProject(created.id);
      setShowForm(false);
      setForm(blank);
      setView("overview");
      setNotice("Project and requirements saved. You can create an integration run and review the status and report trail.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function createRun() {
    if (!project) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const run = await api.createRun(project.id);
      setRunData((current) => ({
        projectId: project.id,
        revision: reload,
        items: [
          run,
          ...(current.projectId === project.id ? current.items : []),
        ],
      }));
      setActiveRunId(run.id);
      setView("runs");
      setNotice("Integration run recorded. The real verification modules are not connected yet, so the run is paused.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(run: VerificationRun) {
    setBusy(true);
    setError("");
    try {
      await downloadReport(run.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  function selectProject(id: string) {
    if (id === selectedId) return;
    setActiveRunId("");
    setSelectedId(id);
    setNotice("");
  }
  function reconnect() {
    setLoading(true);
    setActiveRunId("");
    setReload((n) => n + 1);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="ReqTest home">
          <span className="brand-mark">rt</span>
          <span>
            reqtest<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">GROUP 04 / WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {views.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small-label">REQUIREMENT → EVIDENCE</span>
          <p>
            Every verification result
            <br />
            stays traceable.
          </p>
          <span className="version">ELEC5623 · v0.1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="breadcrumb">/</span>
            {views.find((item) => item.id === view)?.label}
          </div>
          <div className="topbar-right">
            <span className={`connection ${system ? "online" : ""}`}>
              <i />
              {loading ? "Connecting" : system ? "API connected" : "API offline"}
            </span>
            <span className="avatar">G4</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">REQUIREMENT-AWARE VERIFICATION</div>
              <h1>
                {view === "overview"
                  ? "From requirements to verification."
                  : views.find((item) => item.id === view)?.label}
              </h1>
              <p className="subtitle">
                {view === "overview"
                  ? "Connect requirements, code, and tests so verification gaps are visible."
                  : view === "requirements"
                    ? "Preserve the source requirements and prepare for behavior analysis."
                    : view === "runs"
                      ? "Track each decision, evidence item, and unresolved issue."
                      : "Review framework capabilities and the verification modules still to connect."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setShowForm(true);
                setNotice("");
              }}
              disabled={loading || !system || busy}
            >
              + New Project
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={reconnect}
                disabled={loading || busy}
              >
                Reconnect
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {showForm && (
            <section
              className="panel create-panel"
              aria-labelledby="new-project-heading"
            >
              <div className="section-heading">
                <div>
                  <div className="eyebrow">NEW PROJECT</div>
                  <h2 id="new-project-heading">Create Verification Project</h2>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
              <form onSubmit={createProject}>
                <div className="form-grid">
                  <label>
                    Project Name *
                    <input
                      required
                      maxLength={100}
                      placeholder="Example: Shipping service"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Repository Reference
                    <input
                      maxLength={500}
                      placeholder="Repository URL or path (stored as a reference only)"
                      value={form.repository_ref}
                      onChange={(e) =>
                        setForm({ ...form, repository_ref: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Project Description
                  <input
                    maxLength={2000}
                    placeholder="What needs to be verified in this project?"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Source Requirements *
                  <textarea
                    required
                    rows={5}
                    maxLength={50000}
                    placeholder="Paste natural-language requirements, including rules, conditions, boundaries, and exception contracts."
                    value={form.requirements_text}
                    onChange={(e) =>
                      setForm({ ...form, requirements_text: e.target.value })
                    }
                  />
                </label>
                <div className="form-footer">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setForm(example)}
                  >
                    Fill Shipping Example
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={
                      busy ||
                      !form.name.trim() ||
                      !form.requirements_text.trim()
                    }
                  >
                    {busy ? "Saving..." : "Save Project"}
                  </button>
                </div>
              </form>
            </section>
          )}
          <div className="mode-banner">
            <span className="badge amber">Scaffold Stage</span>
            <p>
              Project and run data are saved for real. Requirement analysis, test execution, and mutation analysis are not connected yet, so all verification metrics remain unevaluated.
            </p>
          </div>
          {view !== "integrations" && (
            <div className="project-toolbar">
              <label htmlFor="project-select">Current Project</label>
              <select
                id="project-select"
                value={selectedId}
                disabled={loading || busy || !projects.length}
                onChange={(e) => selectProject(e.target.value)}
              >
                <option value="" disabled>
                  {loading ? "Loading..." : "Select a project"}
                </option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="muted">{projects.length} projects</span>
            </div>
          )}
          {loading ? (
            <section className="panel empty-state" role="status">
              <span className="spinner" />
              <h2>Connecting to Workspace</h2>
              <p>Loading projects and module status...</p>
            </section>
          ) : view === "integrations" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">SYSTEM CAPABILITIES</div>
                  <h2>Integration Status</h2>
                </div>
                <span className="badge neutral">
                  v{system?.version ?? "0.1.0"}
                </span>
              </div>
              {system?.integrations.map((item) => (
                <div className="integration-row" key={item.key}>
                  <span
                    className={`integration-icon ${item.status === "ready" ? "ready" : ""}`}
                    aria-hidden="true"
                  >
                    {item.status === "ready" ? "✓" : "○"}
                  </span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span
                    className={`badge ${item.status === "ready" ? "teal" : "neutral"}`}
                  >
                    {item.status === "ready" ? "Ready" : "Pending"}
                  </span>
                </div>
              ))}
              {!system && <p>Connect to the backend to view module status.</p>}
            </section>
          ) : !project ? (
            <section className="panel empty-state">
              <div className="empty-symbol" aria-hidden="true">
                ↗
              </div>
              <div className="eyebrow">YOUR FIRST VERIFICATION PROJECT</div>
              <h2>Give verification a clear starting point</h2>
              <p>
                Create a project and add requirements to begin linking
                <br />
                Requirement → Behavior → Test → Evidence.
              </p>
              <button
                className="button primary"
                disabled={!system || busy}
                onClick={() => setShowForm(true)}
              >
                Create First Project
              </button>
              <span className="empty-note">
                Python / pytest · Requirement-driven · Traceable evidence
              </span>
            </section>
          ) : view === "overview" ? (
            <>
              <div className="metric-grid">
                <Metric label="Behaviors Identified" value="—" detail="Waiting for requirement analysis" />
                <Metric
                  label="Semantic Requirement Coverage"
                  value="—"
                  detail="No valid execution evidence yet"
                />
                <Metric label="Mutation Score" value="—" detail="Waiting for mutation analysis" />
                <Metric
                  label="Recorded Runs"
                  value={runsLoading ? "…" : String(runs.length)}
                  detail="Scaffold integration records"
                />
              </div>
              <div className="content-grid">
                <section className="panel project-card">
                  <div className="section-heading">
                    <div className="eyebrow">PROJECT CONTEXT</div>
                    <span className="badge neutral">Python / pytest</span>
                  </div>
                  <h2>{project.name}</h2>
                  <p className="project-description">
                    {project.description || "No project description added yet."}
                  </p>
                  <div className="repository">
                    <span className="small-label">Repository Reference</span>
                    <code>{project.repository_ref || "Not provided"}</code>
                    <span className="muted">
                      Only the reference is stored; the repository is not read yet.
                    </span>
                  </div>
                  <div className="card-footer">
                    <button
                      className="text-button"
                      onClick={() => setView("requirements")}
                    >
                      View Source Requirements ↗
                    </button>
                    <span className="muted">{date(project.created_at)}</span>
                  </div>
                </section>
                <section className="panel workflow-card">
                  <div className="eyebrow">CLOSED-LOOP WORKFLOW</div>
                  <h2>Verification Loop</h2>
                  <div className="workflow">
                    {["Understand", "Measure", "Improve", "Re-measure"].map(
                      (step, i) => (
                        <div className="workflow-step" key={step}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <strong>{step}</strong>
                          <small>Pending</small>
                        </div>
                      ),
                    )}
                  </div>
                  <button
                    className="button primary full"
                    onClick={createRun}
                    disabled={busy || runsLoading || !system}
                  >
                    {busy ? "Creating..." : "Create Integration Run →"}
                  </button>
                  <p className="helper">
                    Records inputs and generates a pending report without executing code.
                  </p>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">LATEST ACTIVITY</div>
                    <h2>Latest Runs</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("runs")}
                  >
                    View All ↗
                  </button>
                </div>
                {runsLoading ? (
                  <p role="status">Loading runs...</p>
                ) : latest ? (
                  <button
                    className="run-summary"
                    onClick={() => {
                      setActiveRunId(latest.id);
                      setView("runs");
                    }}
                  >
                    <span className="run-mark">↗</span>
                    <div>
                      <strong>Integration Run · {latest.id.slice(0, 8)}</strong>
                      <small>{date(latest.created_at)}</small>
                    </div>
                    <span className="badge amber">Waiting for Modules</span>
                  </button>
                ) : (
                  <div className="inline-empty">
                    No runs recorded yet. Create an integration run to show status and reports here.
                  </div>
                )}
              </section>
            </>
          ) : view === "requirements" ? (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">SOURCE OF TRUTH</div>
                    <h2>Source Requirements</h2>
                  </div>
                  <span className="badge neutral">
                    {project.requirements_text.length} characters
                  </span>
                </div>
                <pre className="requirements-text">
                  {project.requirements_text}
                </pre>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">BEHAVIOR TRACEABILITY</div>
                    <h2>Requirement Behavior Mapping</h2>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Requirement Behavior</th>
                        <th>Code Reference</th>
                        <th>Linked Tests</th>
                        <th>Execution Evidence</th>
                        <th>Verification Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={5} className="table-empty">
                          The requirement analysis module is not connected yet, so no behavior breakdown or mapping is available.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="status-legend">
                  <span>● Verified</span>
                  <span>◐ Partially Verified</span>
                  <span>○ Unverified</span>
                  <span>? Uncertain</span>
                </div>
              </section>
            </>
          ) : (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">RUN HISTORY & EVIDENCE</div>
                  <h2>Runs & Verification Reports</h2>
                </div>
                <button
                  className="button secondary"
                  onClick={createRun}
                  disabled={busy || runsLoading || !system}
                >
                  {busy ? "Processing..." : "+ Create Integration Run"}
                </button>
              </div>
              {runsLoading ? (
                <p role="status" className="inline-empty">
                  Loading runs...
                </p>
              ) : !runs.length ? (
                <div className="inline-empty">
                  No runs yet. Create an integration run to check the frontend-backend data flow.
                </div>
              ) : (
                <div className="runs-layout">
                  <div className="run-list" aria-label="Run list">
                    {runs.map((run) => (
                      <button
                        className={`run-list-item ${activeRun?.id === run.id ? "selected" : ""}`}
                        key={run.id}
                        onClick={() => setActiveRunId(run.id)}
                        aria-pressed={activeRun?.id === run.id}
                      >
                        <strong>Run {run.id.slice(0, 8)}</strong>
                        <small>{date(run.created_at)}</small>
                        <span className="badge amber">Waiting for Modules</span>
                      </button>
                    ))}
                  </div>
                  {activeRun && (
                    <article className="report">
                      <div className="section-heading">
                        <h3>Integration Report</h3>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => exportReport(activeRun)}
                        >
                          Download JSON ↓
                        </button>
                      </div>
                      <p>{activeRun.report.summary}</p>
                      <dl className="report-facts">
                        <div>
                          <dt>Run Mode</dt>
                          <dd>Scaffold</dd>
                        </div>
                        <div>
                          <dt>Executed Tests</dt>
                          <dd>{activeRun.report.executed_tests}</dd>
                        </div>
                        <div>
                          <dt>Semantic Coverage</dt>
                          <dd>
                            {activeRun.report.semantic_coverage === null
                              ? "Not evaluated"
                              : `${activeRun.report.semantic_coverage}%`}
                          </dd>
                        </div>
                      </dl>
                      <h3>Event Log</h3>
                      <ol className="event-list">
                        {activeRun.events.map((event) => (
                          <li key={event.id}>
                            <small>
                              {date(event.created_at)} · {event.stage}
                            </small>
                            <p>{event.message}</p>
                          </li>
                        ))}
                      </ol>
                      <h3>Pending Capabilities</h3>
                      <ul className="issue-list">
                        {activeRun.report.unresolved_issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                      <details>
                        <summary>View Input Fingerprint</summary>
                        <code className="fingerprint">
                          {activeRun.input_sha256}
                        </code>
                        <p className="helper">
                          SHA-256 binds the saved project input; it is not a repository file snapshot.
                        </p>
                      </details>
                    </article>
                  )}
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>REQTEST / GROUP 04</span>
            <span>Understand → Measure → Improve → Re-measure</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
