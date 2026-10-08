import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { TestBrowser } from "../components/test-browser";
import type { VerificationRun } from "../lib/types";

afterEach(cleanup);
const scenario = {
  id: "S1",
  requirement_ids: ["R1"],
  title: "Free shipping at threshold",
  category: "boundary" as const,
  preconditions: [],
  inputs: ["10000 cents"],
  steps: ["Call fee"],
  expected_result: "0",
  evidence_refs: ["requirement:R1"],
  assumptions: [],
};
const check = {
  scenario_id: "S1",
  function_name: "test_fee",
  target: "shipping.fee",
  call_line: 2,
  assertion_line: 3,
};
const run: VerificationRun = {
  id: "run1",
  project_id: "project1",
  created_at: "2026-10-08T00:00:00Z",
  mode: "baseline_b2",
  status: "completed",
  stage: "report",
  input_sha256: "input",
  events: [],
  report: {
    summary: "One saved result",
    repository: null,
    requirements: [
      {
        id: "R1",
        text: "Orders of at least 100 dollars ship free.",
        source_quote: "Orders of at least 100 dollars ship free.",
        testable: true,
        ambiguity: null,
      },
    ],
    test_plan: { scenarios: [scenario], notes: "" },
    generated_tests: [
      {
        id: "T1",
        requirement_ids: ["R1"],
        scenario_ids: ["S1"],
        name: "test_fee",
        module: "test_fee.py",
        code: "def test_fee(): pass",
        rationale: "Boundary",
        validation_status: "validated",
        validated_checks: [check],
      },
    ],
    evidence: [
      {
        id: "E1",
        test: "test_fee.py::test_fee",
        outcome: "passed",
        duration_seconds: "0.010",
        message: "Saved success",
      },
    ],
    scenario_evidence_refs: { S1: ["E1"] },
    behaviors: [],
    executions: [],
    unresolved_issues: [],
    coverage_gaps: [],
    executed_tests: 1,
    execution_success_rate: 1,
    requirement_coverage: 1,
  },
};

it("shows saved scenario evidence even when raw executions and artifacts change", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          generated_tests: [],
          executions: [
            {
              test_id: "wrong",
              module: "unrelated.py",
              name: "test_fee",
              outcome: "failed",
              duration_seconds: 1,
              message: "Unrelated failure",
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("Saved success")).toBeTruthy();
  expect(screen.getByText("E1: test_fee.py::test_fee")).toBeTruthy();
  expect(screen.getByText("1 passed")).toBeTruthy();
  expect(screen.queryByText("Unrelated failure")).toBeNull();
});

it.each([undefined, null])(
  "does not assign historical raw outcomes without saved attribution (%s)",
  (refs) => {
    render(
      <TestBrowser
        run={{
          ...run,
          report: {
            ...run.report,
            scenario_evidence_refs: refs,
            executions: [
              {
                test_id: "T1",
                module: "test_fee.py",
                name: "test_fee",
                outcome: "passed",
                duration_seconds: 1,
                message: "Raw success",
              },
            ],
          },
        }}
      />,
    );
    expect(
      screen.getAllByText("Outcome attribution unavailable").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/No saved scenario outcome attribution/),
    ).toBeTruthy();
    expect(screen.getByText("0 passed")).toBeTruthy();
    expect(
      document.querySelector(".test-browser-detail > .case-content")
        ?.textContent,
    ).not.toContain("Saved success");
    expect(
      screen.getByText(
        /These saved execution records have no saved scenario attribution/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Raw success")).toBeNull();
  },
);

it("does not treat a raw execution from another module as saved scenario evidence", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          scenario_evidence_refs: { S1: [] },
          executions: [
            {
              test_id: "T1",
              module: "test_fee_2.py",
              name: "test_fee",
              outcome: "passed",
              duration_seconds: 1,
              message: "Different module",
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("0 passed")).toBeTruthy();
  expect(screen.getByText(/No attributable execution outcome/)).toBeTruthy();
  expect(screen.queryByText("Different module")).toBeNull();
});

it("retains the server's recorded artifact filename and selects its failed case", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          test_plan: {
            scenarios: [
              { ...scenario, id: "S0", title: "Unexecuted case" },
              scenario,
            ],
            notes: "",
          },
          evidence: [
            {
              ...run.report.evidence[0],
              test: "test_fee_2.py::test_fee",
              outcome: "failed",
              message: "assert 1000 == 0",
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: scenario.title })).toBeTruthy();
  expect(screen.getByText("E1: test_fee_2.py::test_fee")).toBeTruthy();
  expect(screen.getByText("assert 1000 == 0")).toBeTruthy();
  expect(screen.getByText("1 failed")).toBeTruthy();
});

it("keeps a pending oracle review from displaying Passed despite saved execution success", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          test_plan: {
            scenarios: [
              {
                ...scenario,
                oracle_grounding: {
                  version: 1,
                  status: "needs_review",
                  verdict: "insufficient",
                  rationale: "Missing setup",
                  citations: [],
                  issues: ["Missing setup"],
                  scenario_sha256: "scenario",
                  source_sha256: "source",
                },
              },
            ],
            notes: "",
          },
        },
      }}
    />,
  );
  expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
  expect(screen.getByText("Missing setup")).toBeTruthy();
  expect(screen.getByText("Saved success")).toBeTruthy();
  expect(screen.getByText("0 passed")).toBeTruthy();
});

it("shows partial execution when a validated planned check has no saved outcome", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          generated_tests: run.report.generated_tests.map((test) => ({
            ...test,
            validated_checks: [
              check,
              { ...check, function_name: "test_other_input" },
            ],
          })),
        },
      }}
    />,
  );
  expect(screen.getAllByText("Partially executed").length).toBeGreaterThan(0);
  expect(screen.getByText("0 passed")).toBeTruthy();
  expect(screen.getByText("Saved success")).toBeTruthy();
});

it("does not report Passed if a saved evidence reference is missing", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          scenario_evidence_refs: { S1: ["E1", "missing"] },
        },
      }}
    />,
  );
  expect(screen.getAllByText("Partially executed").length).toBeGreaterThan(0);
  expect(screen.getByText("0 passed")).toBeTruthy();
});

it.each([
  [["skipped"], "Skipped"],
  [["passed", "skipped"], "Partially executed"],
] as const)("shows saved mixed or skipped results (%s)", (outcomes, status) => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          evidence: outcomes.map((outcome, index) => ({
            ...run.report.evidence[0],
            id: `E${index + 1}`,
            outcome,
          })),
          scenario_evidence_refs: {
            S1: outcomes.map((_, index) => `E${index + 1}`),
          },
        },
      }}
    />,
  );
  expect(screen.getAllByText(status).length).toBeGreaterThan(0);
  expect(screen.getByText("0 passed")).toBeTruthy();
});

it("searches and selects cases without losing their requirement source", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          test_plan: {
            scenarios: [
              scenario,
              { ...scenario, id: "S2", title: "Negative amount" },
            ],
            notes: "",
          },
        },
      }}
    />,
  );
  const region = screen.getByRole("region", { name: "Test explorer" });
  fireEvent.change(
    within(region).getByRole("textbox", { name: "Search test cases" }),
    { target: { value: "missing" } },
  );
  expect(within(region).getByText("No matching test cases.")).toBeTruthy();
  fireEvent.change(
    within(region).getByRole("textbox", { name: "Search test cases" }),
    { target: { value: "" } },
  );
  fireEvent.click(
    within(region).getByRole("button", { name: /S2.*Negative amount/ }),
  );
  expect(
    within(region).getByRole("heading", { name: "Negative amount" }),
  ).toBeTruthy();
  const source = region.querySelector(".linked-requirement")!;
  expect(source.querySelector("p")?.textContent).toBe(
    run.report.requirements[0].text,
  );
  expect(source.querySelector("blockquote")?.textContent).toBe(
    run.report.requirements[0].source_quote,
  );
});

it("counts a function with repeated validated checks as one recorded test result", () => {
  render(
    <TestBrowser
      run={{
        ...run,
        report: {
          ...run.report,
          generated_tests: run.report.generated_tests.map((test) => ({
            ...test,
            validated_checks: [check, { ...check, assertion_line: 5 }],
          })),
        },
      }}
    />,
  );
  expect(screen.getByText("1 passed")).toBeTruthy();
  expect(screen.queryByText("Partially executed")).toBeNull();
  expect(screen.getByText("Saved success")).toBeTruthy();
});
