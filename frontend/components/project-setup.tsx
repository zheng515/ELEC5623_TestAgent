import type { ProjectReadiness } from "../lib/types";
import { RuntimeEnvironment } from "./runtime-environment";
import { Badge } from "./ui";

export function ProjectSetup({
  readiness,
}: {
  readiness?: ProjectReadiness | null;
}) {
  return (
    <section className="panel">
      <h3>Project setup checks</h3>
      {!readiness ? (
        <p className="small muted">No project readiness checks recorded.</p>
      ) : (
        <>
          <Badge tone={readiness.status === "ready" ? "teal" : "amber"}>
            {readiness.status === "ready"
              ? "Supported checks passed"
              : readiness.status === "blocked"
                ? "Setup blocked"
                : "Runtime not checked"}
          </Badge>
          <p>
            Import roots: <code>{readiness.import_roots.join(", ")}</code>
          </p>
          {readiness.status === "blocked" && (
            <p>
              Planning and generation stopped before creating executable tests.
              Resolve the listed setup issues and start a new run.
            </p>
          )}
          {readiness.checks.map((check, index) => (
            <details key={index} open={check.status !== "passed"}>
              <summary>
                {check.subject} · {check.status}
              </summary>
              <p>{check.detail}</p>
            </details>
          ))}
          {readiness.notes.map((note, index) => (
            <p className="small muted" key={index}>
              {note}
            </p>
          ))}
          {readiness.environment && (
            <RuntimeEnvironment environment={readiness.environment} />
          )}
        </>
      )}
    </section>
  );
}
