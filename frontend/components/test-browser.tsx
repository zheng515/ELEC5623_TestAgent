import { useState } from "react";
import type { VerificationRun } from "../lib/types";
import { Badge, Empty } from "./ui";
import { sourceLocation } from "../lib/source-location";

export function TestBrowser({ run }: { run?: VerificationRun }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const report = run?.report;
  const scenarios = report?.test_plan?.scenarios ?? [];
  const items = scenarios.map((scenario) => {
    const tests =
      report?.generated_tests.filter((test) =>
        test.scenario_ids?.includes(scenario.id),
      ) ?? [];
    const outcomes =
      report?.executions.filter((execution) =>
        tests.some(
          (test) =>
            test.validation_status === "validated" &&
            test.id === execution.test_id &&
            test.validated_checks?.some(
              (check) =>
                check.scenario_id === scenario.id &&
                check.function_name === execution.name,
            ),
        ),
      ) ?? [];
    // The runner records its actual filename, which can differ for duplicate modules.
    // Match recorded artifact identity and checked functions, without claiming coverage.
    const hasMissingOutcome = tests.some(
      (test) =>
        !test.validated_checks?.some(
          (check) => check.scenario_id === scenario.id,
        ) ||
        test.validated_checks.some(
          (check) =>
            check.scenario_id === scenario.id &&
            !outcomes.some(
              (execution) =>
                execution.test_id === test.id &&
                execution.name === check.function_name,
            ),
        ),
    );
    const status = outcomes.some((e) => e.outcome === "failed")
      ? "Failed"
      : outcomes.some((e) => e.outcome === "error")
        ? "Error"
        : tests.some((t) => t.validation_status === "needs_review") ||
            scenario.oracle_grounding?.status === "needs_review"
          ? "Needs review"
          : outcomes.length && hasMissingOutcome
            ? "Partially executed"
            : outcomes.length && outcomes.every((e) => e.outcome === "passed")
              ? "Passed"
              : outcomes.length
                ? "Skipped"
                : tests.length
                  ? "Not executed"
                  : "Planned";
    return { scenario, tests, outcomes, status };
  });
  const filtered = items.filter(({ scenario }) =>
    `${scenario.id} ${scenario.title}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected =
    filtered.find(({ scenario }) => scenario.id === selectedId) ??
    filtered.find(
      (item) => item.status === "Failed" || item.status === "Error",
    ) ??
    filtered[0];
  const tone = (status: string) =>
    status === "Passed"
      ? ("green" as const)
      : ["Failed", "Error", "Needs review"].includes(status)
        ? ("amber" as const)
        : ("neutral" as const);
  return (
    <section className="test-browser" aria-label="Test explorer">
      <aside className="test-browser-list">
        <div className="browser-panel-heading">
          <h2>Test cases</h2>
          <span>{scenarios.length}</span>
        </div>
        <label className="test-search">
          <span className="sr-only">Search test cases</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search test cases…"
          />
        </label>
        <div className="browser-counts">
          <span>
            {report?.executions.filter((e) => e.outcome === "passed").length ??
              0}{" "}
            passed
          </span>
          <span>
            {report?.executions.filter((e) => e.outcome === "failed").length ??
              0}{" "}
            failed
          </span>
        </div>
        <div className="test-case-items">
          {filtered.map(({ scenario, status }) => (
            <button
              key={scenario.id}
              className={`test-case-item ${selected?.scenario.id === scenario.id ? "selected" : ""}`}
              onClick={() => setSelectedId(scenario.id)}
              aria-pressed={selected?.scenario.id === scenario.id}
            >
              <span
                className={`case-indicator ${status.toLowerCase().replaceAll(" ", "-")}`}
                aria-hidden="true"
              />
              <span>
                <small>
                  {scenario.id} · {scenario.category}
                </small>
                <strong>{scenario.title}</strong>
                <small>{status}</small>
              </span>
            </button>
          ))}
          {!filtered.length && (
            <p className="browser-empty">
              {scenarios.length
                ? "No matching test cases."
                : "Test cases will appear after the agent plans them."}
            </p>
          )}
        </div>
      </aside>
      <article className="test-browser-detail">
        {selected ? (
          <>
            <div className="browser-panel-heading">
              <span>{selected.scenario.id} / Test case</span>
              <Badge tone={tone(selected.status)}>{selected.status}</Badge>
            </div>
            <h2 className="case-title">{selected.scenario.title}</h2>
            <div className="case-tabs">
              <span>Test details</span>
              <span>{selected.scenario.category}</span>
            </div>
            <div className="case-content">
              <h3>Inputs</h3>
              <ul>
                {selected.scenario.inputs.map((input, index) => (
                  <li key={index}>{input}</li>
                ))}
              </ul>
              <h3>Steps</h3>
              <ol>
                {selected.scenario.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <h3>Expected result</h3>
              <p className="expected-result">
                {selected.scenario.expected_result}
              </p>
              <h3>Execution result</h3>
              {selected.outcomes.length ? (
                selected.outcomes.map((outcome, index) => (
                  <div
                    className={`case-outcome ${outcome.outcome}`}
                    key={index}
                  >
                    <strong>{outcome.outcome.toUpperCase()}</strong>
                    <span>{outcome.duration_seconds.toFixed(3)}s</span>
                    {outcome.message && <pre>{outcome.message}</pre>}
                  </div>
                ))
              ) : (
                <p className="case-muted">
                  {selected.status === "Needs review"
                    ? "This case needs review before it can run."
                    : "No execution evidence recorded for this case."}
                </p>
              )}
              {selected.tests.map((test) => (
                <details className="case-code" key={test.id}>
                  <summary>View generated code · {test.module}</summary>
                  <pre>{test.code}</pre>
                </details>
              ))}
            </div>
          </>
        ) : (
          <Empty title="No test case selected">
            Start a verification run to generate requirement-based test cases.
          </Empty>
        )}
      </article>
      <aside className="test-browser-evidence">
        <div className="browser-panel-heading">
          <h2>Requirement context</h2>
        </div>
        {selected ? (
          <div className="evidence-content">
            <h3>Linked requirements</h3>
            {selected.scenario.requirement_ids.map((id) => {
              const requirement = report?.requirements.find(
                (item) => item.id === id,
              );
              const links =
                report?.source_audit?.links.filter((link) =>
                  link.requirement_ids.includes(id),
                ) ?? [];
              return (
                <section className="linked-requirement" key={id}>
                  <Badge>{id}</Badge>
                  <p>{requirement?.text ?? "Requirement unavailable."}</p>
                  {requirement && (
                    <details>
                      <summary>View source quote</summary>
                      <blockquote>{requirement.source_quote}</blockquote>
                      {links.map((link, index) => (
                        <small key={index}>{sourceLocation(link)}</small>
                      ))}
                    </details>
                  )}
                </section>
              );
            })}
            <h3>Review status</h3>
            <Badge
              tone={
                selected.scenario.oracle_grounding?.status === "supported"
                  ? "green"
                  : "amber"
              }
            >
              {selected.scenario.oracle_grounding?.status === "supported"
                ? "Source supported"
                : "Not approved"}
            </Badge>
            {!!selected.scenario.oracle_grounding?.issues.length && (
              <details className="review-details">
                <summary>Why this case needs review</summary>
                <ul>
                  {Array.from(
                    new Set(selected.scenario.oracle_grounding.issues),
                  ).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}
            {!!(
              selected.scenario.assumptions.length +
              selected.scenario.preconditions.length
            ) && (
              <details className="review-details">
                <summary>Setup and assumptions</summary>
                <ul>
                  {[
                    ...selected.scenario.preconditions,
                    ...selected.scenario.assumptions,
                  ].map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="case-footnote">
              Passing cases provide evidence for these inputs. They do not
              establish complete requirement coverage.
            </p>
          </div>
        ) : (
          <p className="browser-empty">
            Select a case to see its requirement sources.
          </p>
        )}
      </aside>
    </section>
  );
}
