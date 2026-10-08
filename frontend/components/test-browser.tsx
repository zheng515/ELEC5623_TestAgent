import { useState } from "react";
import type { GeneratedTest, VerificationRun } from "../lib/types";
import { Badge, Empty } from "./ui";
import { sourceLocation } from "../lib/source-location";

export function TestBrowser({ run }: { run?: VerificationRun }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const report = run?.report;
  const scenarios = report?.test_plan?.scenarios ?? [];
  const attributedRefs = new Set(
    Object.values(report?.scenario_evidence_refs ?? {}).flat(),
  );
  const unassignedEvidence = (report?.evidence ?? []).filter(
    (item) => !attributedRefs.has(item.id),
  );
  const items = scenarios.map((scenario) => {
    const tests =
      report?.generated_tests.filter((test) =>
        test.scenario_ids?.includes(scenario.id),
      ) ?? [];
    // The server saves attribution once. Never assign raw executions to scenarios here.
    const savedRefs = report?.scenario_evidence_refs;
    const refs = new Set(savedRefs?.[scenario.id] ?? []);
    const outcomes = (report?.evidence ?? []).filter((item) =>
      refs.has(item.id),
    );
    const expectedChecks = tests.reduce(
      (count, test) =>
        count +
        (test.validation_status === "validated"
          ? new Set(
              test.validated_checks
                ?.filter((check) => check.scenario_id === scenario.id)
                .map((check) => check.function_name) ?? [],
            ).size
          : 0),
      0,
    );
    const incomplete =
      outcomes.length < refs.size || outcomes.length < expectedChecks;
    const status = outcomes.some((item) => item.outcome === "failed")
      ? "Failed"
      : outcomes.some((item) => item.outcome === "error")
        ? "Error"
        : tests.some((test) => test.validation_status === "needs_review") ||
            scenario.oracle_grounding?.status === "needs_review"
          ? "Needs review"
          : savedRefs == null
            ? run?.status === "running" || run?.status === "queued"
              ? "Awaiting execution evidence"
              : "Outcome attribution unavailable"
            : incomplete
              ? outcomes.length
                ? "Partially executed"
                : "Outcome attribution unavailable"
              : outcomes.length &&
                  outcomes.every((item) => item.outcome === "passed")
                ? "Passed"
                : outcomes.some((item) => item.outcome === "passed")
                  ? "Partially executed"
                  : outcomes.length &&
                      outcomes.every((item) => item.outcome === "skipped")
                    ? "Skipped"
                    : outcomes.length
                      ? "Outcome attribution unavailable"
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
      ? ("teal" as const)
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
            {items.filter((item) => item.status === "Passed").length} passed
          </span>
          <span>
            {items.filter((item) => item.status === "Failed").length} failed
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
                    {outcome.duration_seconds !== undefined && (
                      <span>{outcome.duration_seconds}s</span>
                    )}
                    <p>
                      <code>
                        {outcome.id}: {outcome.test}
                      </code>
                    </p>
                    {outcome.message && <pre>{outcome.message}</pre>}
                  </div>
                ))
              ) : (
                <p className="case-muted">
                  {selected.status === "Needs review"
                    ? "This case needs review before it can run."
                    : report?.scenario_evidence_refs == null
                      ? "No saved scenario outcome attribution. Raw outcomes are not reassigned here."
                      : "No attributable execution outcome recorded for this case."}
                </p>
              )}
              {selected.tests.map((test) => (
                <TestArtifact key={test.id} test={test} />
              ))}
            </div>
          </>
        ) : (
          <Empty title="No test case selected">
            {scenarios.length
              ? "Select a case from the list."
              : "No executable scenarios recorded. Review the planning notes and saved artifacts below."}
          </Empty>
        )}
        {report?.generated_tests
          .filter(
            (test) =>
              !scenarios.some((scenario) =>
                test.scenario_ids?.includes(scenario.id),
              ),
          )
          .map((test) => (
            <TestArtifact key={test.id} test={test} />
          ))}
        {!!report?.generated_tests.length && !report.executed_tests && (
          <p className="case-content">
            These tests were generated from the requirements and available test
            plan. They have not been executed, so none of them is known to run
            or pass.
          </p>
        )}
        {!!unassignedEvidence.length && (
          <details className="case-code raw-evidence">
            <summary>
              Unattributed execution records · {unassignedEvidence.length}
            </summary>
            <p>
              These saved execution records have no saved scenario attribution.
              They are not counted as passed cases.
            </p>
            {unassignedEvidence.map((item) => (
              <div className="case-outcome" key={item.id}>
                <Badge tone={item.outcome === "passed" ? "teal" : "amber"}>
                  {item.outcome}
                </Badge>
                <p>
                  <code>
                    {item.id}: {item.test}
                  </code>
                </p>
                {item.message && <pre>{item.message}</pre>}
              </div>
            ))}
            <p>
              A passing test is not verification of test adequacy; review source
              links and coverage gaps.
            </p>
          </details>
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
                  ? "teal"
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

function TestArtifact({ test }: { test: GeneratedTest }) {
  return (
    <details className="case-code">
      <summary>
        View generated code · <code>{test.module}</code>
      </summary>
      <p>{test.rationale || test.name}</p>
      <p>
        Claimed requirement links: {test.requirement_ids.join(", ") || "None"}
      </p>
      <Badge tone={test.validation_status === "validated" ? "teal" : "amber"}>
        {test.validation_status === "validated"
          ? "Plan contract matched"
          : test.validation_status === "needs_review"
            ? "Needs review"
            : "Links not checked"}
      </Badge>
      <p>
        {test.validation_status === "validated"
          ? "Code matches the plan contract. This does not prove test adequacy."
          : test.validation_status === "needs_review"
            ? "Excluded from validated coverage and automatic execution."
            : "This artifact has no code-to-plan validation record."}
      </p>
      {!!test.validation_issues?.length && (
        <ul>
          {test.validation_issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
      {!!test.validated_checks?.length && (
        <ul>
          {test.validated_checks.map((check, index) => (
            <li key={index}>
              {check.scenario_id}: {check.function_name} → {check.target} (call
              line {check.call_line}, assertion line {check.assertion_line})
            </li>
          ))}
        </ul>
      )}
      <pre>{test.code}</pre>
    </details>
  );
}
