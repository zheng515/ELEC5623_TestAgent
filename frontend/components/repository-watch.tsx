import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../hooks/use-resource";
import { api } from "../lib/api";
import { urlFor } from "../lib/navigation";
import type { Project, RepositoryWatch } from "../lib/types";
import { Badge, ErrorNotice, SectionTitle, formatDate } from "./ui";

const GITHUB =
  /^(https?:\/\/(www\.)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)/i;
const watching = (watch: RepositoryWatch) => watch.enabled;

export function RepositoryWatchPanel({
  project,
  onNewRun,
}: {
  project: Project;
  onNewRun?: () => void;
}) {
  if (!GITHUB.test(project.repository_ref.trim())) return null;
  return <WatchControls project={project} onNewRun={onNewRun} />;
}

function WatchControls({
  project,
  onNewRun,
}: {
  project: Project;
  onNewRun?: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const load = useCallback(() => api.watch(project.id), [project.id]);
  const { data: watch, error } = useResource(
    `watch:${project.id}:${revision}`,
    load,
    { pollIntervalMs: 15000, shouldPoll: watching },
  );
  // A run the watcher queued is not in the page's run list yet; ask for a reload.
  const seenRun = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!watch) return;
    const latest = watch.last_run_id ?? null;
    if (seenRun.current !== undefined && latest && latest !== seenRun.current)
      onNewRun?.();
    seenRun.current = latest;
  }, [watch, onNewRun]);

  async function toggle() {
    if (!watch) return;
    setBusy(true);
    setActionError("");
    try {
      await api.setWatch(project.id, !watch.enabled);
      setRevision((n) => n + 1);
    } catch (problem) {
      setActionError(
        problem instanceof Error
          ? problem.message
          : "The watch could not be changed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const minutes = watch ? Math.round(watch.interval_seconds / 60) : 0;
  return (
    <section className="panel">
      <SectionTitle
        eyebrow="CONTINUOUS VERIFICATION"
        title="Repository watch"
        action={
          <button
            className="button secondary"
            disabled={busy || !watch}
            onClick={toggle}
          >
            {watch?.enabled ? "Stop watching" : "Watch for new commits"}
          </button>
        }
      />
      {watch?.enabled ? (
        <p>
          <Badge tone={watch.active ? "teal" : "amber"}>
            {watch.active ? "Watching" : "Paused"}
          </Badge>{" "}
          {watch.active
            ? `Checked every ${minutes} minutes. Each new commit adds tests for new or changed functions and re-runs the existing tests.`
            : "Watching is unavailable on the server right now, so no commit is checked."}
        </p>
      ) : (
        <p>
          Check the GitHub repository for new commits. Each new commit adds
          tests for new or changed functions that the requirements describe and
          re-runs the existing tests to catch regressions.
        </p>
      )}
      {watch?.enabled && (
        <p className="small muted">
          Last check:{" "}
          {watch.last_checked_at
            ? formatDate(watch.last_checked_at)
            : "not yet"}
          {watch.last_commit && (
            <>
              {" "}
              · last commit <code>{watch.last_commit.slice(0, 12)}</code>
            </>
          )}
          {watch.last_run_id && (
            <>
              {" "}
              ·{" "}
              <a href={urlFor("workspace", project.id, watch.last_run_id)}>
                latest watch run
              </a>
            </>
          )}
        </p>
      )}
      {watch?.last_error && <p className="small">{watch.last_error}</p>}
      {(actionError || (!watch && error)) && (
        <ErrorNotice message={actionError || error || ""} />
      )}
    </section>
  );
}
