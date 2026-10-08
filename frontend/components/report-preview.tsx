import { useCallback } from "react";
import { useResource } from "../hooks/use-resource";
import { api } from "../lib/api";
import { urlFor } from "../lib/navigation";
import { isRunActive } from "../lib/types";
import type { Project, VerificationRun } from "../lib/types";
import { Empty, ErrorNotice, Loading } from "./ui";

export function Report({
  project,
  run,
  download,
  busy,
  revision = 0,
}: {
  project: Project;
  run?: VerificationRun;
  download: (format: "json" | "html") => void;
  busy: boolean;
  revision?: number;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Runs & reports</h1>
          <p>
            Review the saved inputs, outcomes, and unresolved issues of this
            run.
          </p>
        </div>
        {run && (
          <div className="report-downloads">
            <button
              className="button secondary"
              onClick={() => download("html")}
              disabled={busy || isRunActive(run)}
            >
              {busy ? "Preparing…" : "Download HTML ↓"}
            </button>
            <button
              className="text-button"
              onClick={() => download("json")}
              disabled={busy || isRunActive(run)}
            >
              Download JSON ↓
            </button>
          </div>
        )}
      </div>
      {run ? (
        <ReportPreview key={run.id} run={run} revision={revision} />
      ) : (
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
      )}
    </>
  );
}

function ReportPreview({
  run,
  revision,
}: {
  run: VerificationRun;
  revision: number;
}) {
  const load = useCallback(() => api.reportHtml(run.id), [run.id]);
  const updated =
    run.updated_at ??
    `${run.status}:${run.stage}:${run.events.length}:${run.report.summary}`;
  const { data, error, loading } = useResource(
    `report:${run.id}:${updated}:${revision}`,
    load,
    { retainPreviousData: true },
  );
  // The preview is read-only. Isolate report HTML from this authenticated app and
  // block scripts, forms, network resources and navigation outside the frame.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`;
  const html = data?.includes("<head>")
    ? data.replace("<head>", `<head>${policy}`)
    : policy + (data ?? "");
  return (
    <>
      {error && (
        <ErrorNotice
          message={`${error}${data !== undefined ? " The last loaded report remains visible." : ""}`}
        />
      )}
      {isRunActive(run) && (
        <p className="small muted">
          Interim report. Updates automatically as the run records results.
          Downloads are available after the run stops.
        </p>
      )}
      {data !== undefined ? (
        <iframe
          className="report-preview"
          title={`Verification report for run ${run.id}`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
        />
      ) : (
        loading && <Loading />
      )}
    </>
  );
}
