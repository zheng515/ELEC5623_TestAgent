"use client";

import { useCallback, useState } from "react";
import { Home } from "../components/home";
import { NewTask } from "../components/new-task";
import { Evidence, Report, Workspace } from "../components/project-workspace";
import { Badge, Empty, ErrorNotice, Loading } from "../components/ui";
import { useResource } from "../hooks/use-resource";
import { api, downloadReport } from "../lib/api";
import { navigate, urlFor, useRoute } from "../lib/navigation";
import type { ProjectCreate } from "../lib/types";

export default function App() {
  const route = useRoute();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const load = useCallback(async () => {
    const [projects, system, recentRuns] = await Promise.all([
      api.projects(),
      api.system(),
      api.recentRuns(),
    ]);
    return { projects, system, recentRuns };
  }, []);
  const resource = useResource(`index:${revision}`, load);
  const loadRuns = useCallback(
    () => (route.projectId ? api.runs(route.projectId) : Promise.resolve([])),
    [route.projectId],
  );
  const runResource = useResource(
    `runs:${route.projectId}:${revision}`,
    loadRuns,
  );
  const data = resource.data;
  const project = data?.projects.find((p) => p.id === route.projectId);
  const runs = runResource.data ?? [];
  const run = route.runId ? runs.find((r) => r.id === route.runId) : runs[0];
  const projectView = ["workspace", "evidence", "reports"].includes(route.view);
  const refresh = () => {
    setActionError("");
    setRevision((n) => n + 1);
  };

  async function submit(form: ProjectCreate) {
    setBusy(true);
    setActionError("");
    try {
      const created = await api.createProject(form);
      let runId: string | undefined;
      try {
        runId = (await api.createRun(created.id)).id;
      } catch (e) {
        setActionError(
          `Project saved, but the analysis run could not be created. Open the workspace and retry. ${e instanceof Error ? e.message : ""}`,
        );
      }
      setRevision((n) => n + 1);
      navigate("workspace", created.id, runId);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!project) return;
    setBusy(true);
    setActionError("");
    try {
      const created = await api.createRun(project.id);
      setRevision((n) => n + 1);
      navigate("workspace", project.id, created.id);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to create a run.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!run) return;
    setBusy(true);
    setActionError("");
    try {
      await downloadReport(run.id);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to download the report.",
      );
    } finally {
      setBusy(false);
    }
  }
  const nav = [
    { view: "workspace" as const, label: "Agent workspace", icon: "◈" },
    { view: "evidence" as const, label: "Requirements & evidence", icon: "≡" },
    { view: "reports" as const, label: "Runs & reports", icon: "↗" },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href={urlFor("home")} className="brand">
          <span className="brand-mark">
            r<span>t</span>
          </span>
          reqtest<span className="brand-dot">.</span>
        </a>
        <span className="sidebar-caption">GROUP 04 / WORKSPACE</span>
        <nav aria-label="Main navigation">
          <a
            className={`nav-item ${route.view === "home" ? "active" : ""}`}
            href={urlFor("home")}
            aria-current={route.view === "home" ? "page" : undefined}
          >
            <span>◫</span>Overview
          </a>
          <a
            className={`nav-item ${route.view === "new" ? "active" : ""}`}
            href={urlFor("new")}
            aria-current={route.view === "new" ? "page" : undefined}
          >
            <span>＋</span>New task
          </a>
          {projectView && project && (
            <>
              <span className="sidebar-caption project-caption">
                CURRENT PROJECT
              </span>
              {nav.map((n) => (
                <a
                  key={n.view}
                  href={urlFor(n.view, project.id, run?.id)}
                  className={`nav-item ${route.view === n.view ? "active" : ""}`}
                  aria-current={route.view === n.view ? "page" : undefined}
                >
                  <span>{n.icon}</span>
                  {n.label}
                </a>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="eyebrow">BUILT ON EVIDENCE</span>
          <p>
            Every requirement.
            <br />
            Every decision.
            <br />A traceable outcome.
          </p>
          <span>ELEC5623 · FOUNDATION</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <a href={urlFor("home")}>Workspace</a>
            <span>/</span>
            <strong>
              {projectView
                ? (project?.name ?? "Project")
                : route.view === "new"
                  ? "New task"
                  : "Overview"}
            </strong>
          </div>
          <div className="connection">
            <span className={`status-dot ${data ? "" : "pending"}`} />
            {resource.loading
              ? "Connecting"
              : data
                ? "API connected"
                : "API offline"}
            <span className="avatar">G4</span>
          </div>
        </header>
        <main className="main-content">
          {actionError && <ErrorNotice message={actionError} />}
          {resource.error ? (
            <ErrorNotice message={resource.error} retry={refresh} />
          ) : resource.loading || !data ? (
            <Loading />
          ) : route.view === "home" ? (
            <Home {...data} />
          ) : route.view === "new" ? (
            <NewTask submit={submit} busy={busy} />
          ) : !project ? (
            <section className="panel">
              <Empty
                title="Project not found"
                action={
                  <a href={urlFor("home")} className="button primary">
                    Back to projects
                  </a>
                }
              >
                This project may no longer be available. Check the link or
                select a project from the overview.
              </Empty>
            </section>
          ) : runResource.loading ? (
            <Loading />
          ) : runResource.error ? (
            <ErrorNotice message={runResource.error} retry={refresh} />
          ) : route.runId && !run ? (
            <section className="panel">
              <Empty
                title="Run not found"
                action={
                  <a
                    href={urlFor("workspace", project.id)}
                    className="button primary"
                  >
                    Open latest run
                  </a>
                }
              >
                The selected run does not belong to this project or is no longer
                available.
              </Empty>
            </section>
          ) : (
            <>
              <div className="project-strip">
                <a href={urlFor("home")} className="text-button">
                  ← All projects
                </a>
                <div>
                  <Badge>Python / pytest</Badge>
                  <label className="run-picker">
                    <span className="sr-only">Selected run</span>
                    <select
                      value={run?.id ?? ""}
                      disabled={!runs.length || busy}
                      onChange={(e) =>
                        navigate(route.view, project.id, e.target.value)
                      }
                    >
                      {!runs.length && <option value="">No runs yet</option>}
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          Run {r.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={refresh}
                    disabled={busy}
                  >
                    Refresh ↻
                  </button>
                </div>
              </div>
              {route.view === "workspace" ? (
                <Workspace
                  project={project}
                  run={run}
                  start={start}
                  busy={busy}
                />
              ) : route.view === "evidence" ? (
                <Evidence
                  key={run?.id ?? project.id}
                  project={project}
                  run={run}
                />
              ) : (
                <Report
                  project={project}
                  run={run}
                  runs={runs}
                  download={download}
                  busy={busy}
                />
              )}
            </>
          )}
          <footer className="site-footer">
            <span>REQTEST / REQUIREMENT-AWARE VERIFICATION</span>
            <span>Understand → Measure → Improve → Re-measure</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
