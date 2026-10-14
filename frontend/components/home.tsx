import { useState } from "react";
import type { Project, VerificationRun } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { Badge, Empty, formatDate, runBadge, SectionTitle } from "./ui";

export function Home({
  projects,
  recentRuns,
}: {
  projects: Project[];
  recentRuns: VerificationRun[];
}) {
  const [search, setSearch] = useState("");
  const filtered = projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Verification workspace</h1>
          <p>
            Create a verification task or review your projects and recorded
            runs.
          </p>
        </div>
        <a className="button primary" href={urlFor("new")}>
          New verification task <span>↗</span>
        </a>
      </div>
      <section className="panel">
        <SectionTitle
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
                  <h3>{p.name}</h3>
                  <span aria-hidden="true">↗</span>
                </div>
                {p.description && <p>{p.description}</p>}
                <span className="tile-date">{formatDate(p.created_at)}</span>
              </a>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <SectionTitle title="Latest runs" />
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
              <Badge tone={runBadge(run).tone}>{runBadge(run).label}</Badge>
            </a>
          ))
        ) : (
          <p className="quiet-empty">
            No runs yet. Create a task to record your first verification setup.
          </p>
        )}
      </section>
    </>
  );
}
