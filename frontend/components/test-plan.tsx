import type { VerificationReport } from "../lib/types";
import { Badge } from "./ui";

export function TestPlanDetails({ report }: { report?: VerificationReport }) {
  const plan = report?.test_plan;
  if (!plan)
    return <p className="muted">No test plan recorded for this run.</p>;
  return (
    <div className="test-plan">
      <p className="small muted">
        Scenarios describe intended checks. Linked tests and recorded outcomes
        show how each scenario progressed.
      </p>
      {!plan.scenarios.length && (
        <p>
          No executable scenarios were planned. Review the requirements and
          planning notes.
        </p>
      )}
      {plan.scenarios.map((scenario) => {
        const tests = (report?.generated_tests ?? []).filter((test) =>
          test.scenario_ids?.includes(scenario.id),
        );
        const outcomes = (report?.executions ?? []).filter((item) =>
          tests.some((test) => test.id === item.test_id),
        );
        return (
          <details className="scenario-card" key={scenario.id}>
            <summary>
              <span>
                <code>{scenario.id}</code> · {scenario.title}
              </span>
              <span className="test-tags">
                <Badge>{scenario.category}</Badge>
                <Badge>{scenario.requirement_ids.join(", ")}</Badge>
              </span>
            </summary>
            <dl className="scenario-fields">
              <dt>Preconditions</dt>
              <dd>
                <Items values={scenario.preconditions} />
              </dd>
              <dt>Inputs</dt>
              <dd>
                <Items values={scenario.inputs} />
              </dd>
              <dt>Steps</dt>
              <dd>
                <ol>
                  {scenario.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </dd>
              <dt>Expected result</dt>
              <dd>{scenario.expected_result}</dd>
              <dt>Assumptions</dt>
              <dd>
                <Items values={scenario.assumptions} />
              </dd>
              <dt>Source evidence</dt>
              <dd>
                {scenario.evidence_refs.map((ref) => {
                  const requirement = report?.requirements.find(
                    (item) => ref === `requirement:${item.id}`,
                  );
                  const sourceModule = report?.repository?.modules.find(
                    (item) => ref === `repository:${item.path}`,
                  );
                  return (
                    <div key={ref} className="scenario-source">
                      <code>{ref}</code>
                      {requirement && (
                        <blockquote>{requirement.source_quote}</blockquote>
                      )}
                      {sourceModule && (
                        <p>
                          {sourceModule.module}:{" "}
                          {[
                            ...sourceModule.functions,
                            ...sourceModule.classes,
                          ].join("; ") || "Module interface"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </dd>
              <dt>Generated tests</dt>
              <dd>
                {tests.length
                  ? tests
                      .map((test) => `${test.id} (${test.module})`)
                      .join(", ")
                  : "No generated test"}
              </dd>
              <dt>Execution outcomes</dt>
              <dd>
                {outcomes.length
                  ? outcomes.map((item, index) => (
                      <Badge
                        key={index}
                        tone={item.outcome === "passed" ? "teal" : "amber"}
                      >
                        {item.name}: {item.outcome}
                      </Badge>
                    ))
                  : "Not executed"}
              </dd>
            </dl>
          </details>
        );
      })}
      {plan.notes && (
        <div className="planning-note">
          <strong>Planning notes</strong>
          <p>{plan.notes}</p>
        </div>
      )}
      {!!report?.planning_gaps?.length && (
        <div className="planning-note">
          <strong>Requirements without scenarios</strong>
          <Items values={report.planning_gaps} />
        </div>
      )}
      {!!report?.uncovered_scenarios?.length && (
        <div className="planning-note">
          <strong>Scenarios without generated tests</strong>
          <Items values={report.uncovered_scenarios} />
        </div>
      )}
    </div>
  );
}

function Items({ values }: { values: string[] }) {
  return values.length ? (
    <ul>
      {values.map((value, index) => (
        <li key={index}>{value}</li>
      ))}
    </ul>
  ) : (
    <>None specified</>
  );
}
