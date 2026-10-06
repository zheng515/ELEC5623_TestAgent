import type { VerificationReport } from "../lib/types";
import { RuntimeEnvironment } from "./runtime-environment";
import { Badge } from "./ui";

export function ExecutionHistory({ report }: { report: VerificationReport }) {
  return (
    <div>
      <p className="small muted">
        Each attempt preserves the exact generated artifacts and recorded
        outcomes. Final metrics use the latest attempt for each test.
      </p>
      {(report.execution_attempts ?? []).map((attempt) => (
        <details className="scenario-card" key={attempt.number}>
          <summary>
            Attempt {attempt.number} ·{" "}
            {attempt.stage === "measure" ? "Initial execution" : "After repair"}{" "}
            <Badge tone={attempt.result.timed_out ? "amber" : "neutral"}>
              {attempt.result.timed_out
                ? "Timed out"
                : `Exit code ${attempt.result.exit_code}`}
            </Badge>
          </summary>
          <p className="small muted">
            Executed code fingerprint:{" "}
            <code>
              {attempt.result.repository_content_sha256 ?? "Not recorded"}
            </code>
          </p>
          <RuntimeEnvironment
            environment={attempt.result.environment}
            error={attempt.result.environment_error}
          />
          {attempt.result.stderr_excerpt && (
            <pre className="test-code">{attempt.result.stderr_excerpt}</pre>
          )}
          <ul>
            {attempt.result.executions.map((item, index) => (
              <li key={index}>
                <code>
                  {item.test_id ?? "Unmatched"} / {item.name}
                </code>
                : {item.outcome}
                {item.message && (
                  <pre className="test-code">{item.message}</pre>
                )}
              </li>
            ))}
          </ul>
          {!attempt.result.executions.length && (
            <p>No execution outcomes were recorded in this attempt.</p>
          )}
          {attempt.diagnoses.map((item, index) => (
            <p key={index}>
              {item.test_id}: {item.classification} · {item.explanation}
            </p>
          ))}
          {attempt.tests.map((test) => (
            <details key={test.id}>
              <summary>
                Artifact {test.id} · {test.module}
              </summary>
              <pre className="test-code">{test.code}</pre>
            </details>
          ))}
        </details>
      ))}
      {!!report.execution_gaps?.length && (
        <>
          <strong>Tests without final execution outcomes</strong>
          <ul>
            {report.execution_gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
