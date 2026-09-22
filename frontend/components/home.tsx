import { useState } from "react";
import type { Project, SystemInfo, VerificationRun } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { Badge, Empty, formatDate, SectionTitle } from "./ui";

export function Home({
  projects,
  recentRuns,
  system,
}: {
  projects: Project[];
  recentRuns: VerificationRun[];
  system: SystemInfo;
}) {
  const [search, setSearch] = useState("");
  const filtered = projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">FROM REQUIREMENTS TO EVIDENCE</span>
          <h1>
            Give your agent
            <br />a verification goal.
          </h1>
          <p>
            One goal. A traceable path from intended behavior
            <br className="desktop-break" /> to stronger tests and explainable
            results.
          </p>
          <a className="button primary" href={urlFor("new")}>
            New verification task <span>↗</span>
          </a>
          <div className="hero-note">
            Python + pytest <span>·</span> Requirement-aware verification
          </div>
        </div>
        <div
          className="hero-loop"
          aria-label="Planned autonomous verification loop"
        >
          <span className="loop-caption">THE AGENT LOOP</span>
          {["Understand", "Measure", "Improve", "Re-measure"].map((s, i) => (
            <div className="loop-row" key={s}>
              <span>0{i + 1}</span>
              <strong>{s}</strong>
              <span aria-hidden="true">{i === 3 ? "↺" : "↓"}</span>
            </div>
          ))}
          <span className="loop-note">
            Execution modules are not connected yet.
          </span>
        </div>
      </section>
      <div className="readiness">
        <span className="status-dot" />
        <strong>Workspace ready</strong>
          <span>
          Requirement analysis is ready. Code inspection and test execution are
          pending integration.
        </span>
        <Badge>Analysis release</Badge>
      </div>
      <section className="panel">
        <SectionTitle
          eyebrow="YOUR WORKSPACE"
          title="Projects"
          action={
            <label className="search">
              <span className="sr-only">Search projects</span>
              <input
                type="search"
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          }
        />
        {!filtered.length ? (
          <Empty
            title={
              projects.length
                ? "No matching projects"
                : "Start with your first requirement"
            }
          >
            {projects.length
              ? "Try a different project name."
              : "Add requirements and a repository reference to establish your verification workspace."}
          </Empty>
        ) : (
          <div className="project-grid">
            {filtered.map((p) => (
              <a
                className="project-tile"
                key={p.id}
                href={urlFor("workspace", p.id)}
              >
                <div className="tile-top">
                  <span className="project-symbol">⌘</span>
                  <span>↗</span>
                </div>
                <h3>{p.name}</h3>
                <p>
                  {p.description || "Requirement-aware verification project."}
                </p>
                <div className="tile-bottom">
                  <Badge>Python / pytest</Badge>
                  <span>{formatDate(p.created_at)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
      <div className="home-bottom">
        <section className="panel">
          <SectionTitle eyebrow="RECENT ACTIVITY" title="Latest runs" />
          {recentRuns.length ? (
            recentRuns.slice(0, 5).map((run) => (
              <a
                key={run.id}
                className="activity-row"
                href={urlFor("workspace", run.project_id, run.id)}
              >
                <span className="activity-icon">↗</span>
                <div>
                  <strong>
                    {projects.find((p) => p.id === run.project_id)?.name ||
                      "Project"}
                  </strong>
                  <small>
                    Run {run.id.slice(0, 8)} · {formatDate(run.created_at)}
                  </small>
                </div>
                <Badge tone="amber">Blocked</Badge>
              </a>
            ))
          ) : (
            <p className="quiet-empty">
              No runs yet. Create a task to record your first verification
              setup.
            </p>
          )}
        </section>
        <section className="panel">
          <SectionTitle eyebrow="CAPABILITIES" title="Integration status" />
          <div className="capabilities">
            {system.integrations.map((i) => (
              <div key={i.key}>
                <span
                  className={`status-dot ${i.status === "ready" ? "" : "pending"}`}
                />
                <span>{i.name}</span>
                <small>
                  {i.status === "ready" ? "Ready" : "Not connected"}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
