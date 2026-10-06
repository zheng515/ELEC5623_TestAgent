import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import App from "../app/page";
import { Evidence } from "../components/project-workspace";
import { NewTask, sample } from "../components/new-task";
import { TestPlanDetails } from "../components/test-plan";
import { ExecutionHistory } from "../components/execution-history";
import { api, downloadHtmlReport, downloadReport } from "../lib/api";
import type { Project, VerificationRun } from "../lib/types";
import { requirementOutcomes } from "../lib/outcome-mapping";
import { runBadge } from "../components/ui";
vi.mock("../lib/api", () => ({
  api: {
    me: vi.fn(),
    logout: vi.fn(),
    projects: vi.fn(),
    system: vi.fn(),
    recentRuns: vi.fn(),
    runs: vi.fn(),
    createProject: vi.fn(),
    createRun: vi.fn(),
  },
  downloadReport: vi.fn(),
  downloadHtmlReport: vi.fn(),
}));
const project: Project = {
  ...sample,
  id: "p1",
  created_at: "2026-09-18T10:00:00Z",
};
const run: VerificationRun = {
  id: "r1",
  project_id: "p1",
  created_at: project.created_at,
  mode: "scaffold",
  status: "blocked",
  stage: "understand",
  input_sha256: "abc123",
  events: [
    {
      id: "e1",
      stage: "understand",
      created_at: project.created_at,
      message: "Project inputs recorded.",
    },
  ],
  report: {
    summary: "Setup only. No tests executed.",
    repository: null,
    requirements: [],
    generated_tests: [],
    behaviors: [],
    evidence: [],
    unresolved_issues: ["Connect requirement analysis."],
    coverage_gaps: [],
    executions: [],
    executed_tests: 0,
    execution_success_rate: null,
    requirement_coverage: null,
    semantic_coverage: null,
    mutation_score: null,
  },
};
const agentRun: VerificationRun = {
  ...run,
  mode: "baseline_b0",
  status: "completed",
  stage: "report",
  events: [
    {
      id: "e1",
      stage: "analyze",
      created_at: project.created_at,
      message: "Extracted 2 requirements.",
    },
  ],
  report: {
    ...run.report,
    summary: "B0 baseline run.",
    requirements: [
      {
        id: "R1",
        text: "An order of at least 100 dollars ships free.",
        source_quote: "Orders of at least 100 dollars ship free.",
        testable: true,
        ambiguity: null,
      },
      {
        id: "R2",
        text: "Large orders are delivered quickly.",
        source_quote: "Large orders are fast.",
        testable: false,
        ambiguity: "'large' has no stated threshold.",
      },
    ],
    generated_tests: [
      {
        id: "T1",
        requirement_ids: ["R1"],
        name: "test_free_shipping_at_threshold",
        module: "test_shipping.py",
        code: "def test_free_shipping_at_threshold():\n    assert True\n",
        rationale: "Boundary at 100.",
      },
    ],
    unresolved_issues: ["R2 is ambiguous: 'large' has no stated threshold."],
    requirement_coverage: 1,
  },
};
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.mocked(api.me).mockResolvedValue({
    id: "u1",
    name: "Test User",
    email: "test@example.com",
    created_at: project.created_at,
  });
  vi.mocked(api.logout).mockResolvedValue();
  vi.mocked(api.projects).mockResolvedValue([project]);
  vi.mocked(api.system).mockResolvedValue({
    version: "0.1.0",
    mode: "scaffold",
    integrations: [],
  });
  vi.mocked(api.recentRuns).mockResolvedValue([run]);
  vi.mocked(api.runs).mockResolvedValue([run]);
  vi.mocked(api.createProject).mockResolvedValue(project);
  vi.mocked(api.createRun).mockResolvedValue(run);
  vi.mocked(downloadReport).mockResolvedValue();
  vi.mocked(downloadHtmlReport).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("uses English interface text across every first-release page", async () => {
  render(<App />);
  await screen.findByText("Projects");
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
  for (const [hash, heading] of [
    ["view=new", "New verification task"],
    ["view=workspace&project=p1&run=r1", "Agent workspace"],
    ["view=evidence&project=p1&run=r1", "Requirements & evidence"],
    ["view=reports&project=p1&run=r1", "Runs & reports"],
  ]) {
    await go(hash);
    await screen.findByRole("heading", { name: heading });
    expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
  }
});
async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
it("creates a project and setup run in one submission, then opens the blocked workspace", async () => {
  render(<App />);
  await screen.findByText("Projects");
  await go("view=new");
  fireEvent.click(screen.getByText("Use shipping example"));
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  await screen.findByRole("heading", { name: "Agent workspace" });
  expect(api.createProject).toHaveBeenCalledWith(sample);
  expect(api.createRun).toHaveBeenCalledWith("p1");
  expect(screen.getByText("Blocked · Integration required")).toBeTruthy();
  expect(screen.getAllByText("Not evaluated")).toHaveLength(1);
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
});
it("retains the saved project when run creation fails, allowing a retry", async () => {
  vi.mocked(api.createRun).mockRejectedValueOnce(
    new Error("Temporary failure"),
  );
  render(<App />);
  await screen.findByText("Projects");
  await go("view=new");
  fireEvent.click(screen.getByText("Use shipping example"));
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  await screen.findByText(/Project saved, but/);
  expect(api.createProject).toHaveBeenCalledTimes(1);
  await screen.findByRole("heading", { name: "Agent workspace" });
  fireEvent.click(
    screen.getByRole("button", { name: /Create another setup run/ }),
  );
  await waitFor(() => expect(api.createRun).toHaveBeenCalledTimes(2));
  expect(api.createProject).toHaveBeenCalledTimes(1);
});
it("restores a report from its URL and downloads the selected run", async () => {
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Runs & reports" });
  fireEvent.click(screen.getByRole("button", { name: "Download JSON ↓" }));
  await waitFor(() => expect(downloadReport).toHaveBeenCalledWith("r1"));
  expect(
    screen.getByText("Setup only · no executed verification"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Download HTML ↓" }));
  await waitFor(() => expect(downloadHtmlReport).toHaveBeenCalledWith("r1"));
});
it("does not substitute the latest run for an invalid deep link", async () => {
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=missing");
  render(<App />);
  await screen.findByText("Run not found");
  expect(screen.queryByRole("button", { name: "Download JSON ↓" })).toBeNull();
});
it("recovers from an API connection failure", async () => {
  vi.mocked(api.projects).mockRejectedValueOnce(new Error("API unavailable"));
  render(<App />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Try again ↻"));
  await screen.findByText("Projects");
});
it("imports a text requirement file into the editable form", async () => {
  render(<NewTask busy={false} submit={vi.fn()} />);
  expect(screen.getByText("No file selected")).toBeTruthy();
  const file = new File(["R1: Return zero."], "requirements.txt", {
    type: "text/plain",
  });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve("R1: Return zero."),
  });
  fireEvent.change(screen.getByLabelText("Import .txt or .md"), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/Requirement text/) as HTMLTextAreaElement).value,
    ).toBe("R1: Return zero."),
  );
  expect(screen.getByText("requirements.txt")).toBeTruthy();
});
it("uses English application validation instead of browser-localized messages", async () => {
  const submit = vi.fn();
  render(<NewTask busy={false} submit={submit} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Enter a project name.",
  );
  expect(submit).not.toHaveBeenCalled();
});
it("rejects unsupported requirement documents without overwriting the text", async () => {
  render(<NewTask busy={false} submit={vi.fn()} />);
  fireEvent.click(screen.getByText("Use shipping example"));
  fireEvent.change(screen.getByLabelText("Import .txt or .md"), {
    target: { files: [new File(["pdf"], "test.pdf")] },
  });
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText(/Requirement text/) as HTMLTextAreaElement).value,
  ).toBe(sample.requirements_text);
});
it("filters structured behaviors and reveals their evidence instead of inventing it", () => {
  const populated: VerificationRun = {
    ...run,
    report: {
      ...run.report,
      behaviors: [
        {
          id: "B1",
          requirement_id: "R1",
          description: "Threshold boundary",
          source_quote: "At least 10,000 cents.",
          expected_result: "Zero fee",
          verification_status: "Unverified",
          code_refs: ["shipping.py:18"],
          test_refs: [],
          evidence_refs: [],
        },
        {
          id: "B2",
          requirement_id: "R2",
          description: "Negative amount",
          source_quote: "Negative amounts raise ValueError.",
          expected_result: "ValueError",
          verification_status: "Uncertain",
          code_refs: [],
          test_refs: [],
          evidence_refs: [],
        },
      ],
    },
  };
  render(<Evidence project={project} run={populated} />);
  expect(screen.getByText("shipping.py:18")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Filter verification status"), {
    target: { value: "Uncertain" },
  });
  expect(screen.queryByText("shipping.py:18")).toBeNull();
  expect(screen.getByText("Negative amounts raise ValueError.")).toBeTruthy();
});

it("shows generated tests and their requirement links, without claiming execution", async () => {
  vi.mocked(api.runs).mockResolvedValue([agentRun]);
  vi.mocked(api.recentRuns).mockResolvedValue([agentRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Agent workspace" });

  expect(screen.getByText("Tests generated · not executed")).toBeTruthy();
  expect(screen.getByText("B0 baseline mode")).toBeTruthy();
  expect(screen.getByText("test_shipping.py")).toBeTruthy();
  expect(screen.getByText("Boundary at 100.")).toBeTruthy();
  expect(
    screen.getByText(/They have not been executed, so none of them is known/),
  ).toBeTruthy();
  // Inspection, execution and refinement are all unconnected, and the UI says so.
  expect(screen.getAllByText("Not connected")).toHaveLength(3);
});

it("reports a failed run as failed instead of showing an empty result", async () => {
  const failed: VerificationRun = {
    ...agentRun,
    status: "failed",
    stage: "analyze",
    report: {
      ...run.report,
      summary: "Run failed during the analyze stage.",
      unresolved_issues: ["The model API could not be reached."],
    },
  };
  vi.mocked(api.runs).mockResolvedValue([failed]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Agent workspace" });

  expect(
    screen.getByText("The run failed before it produced a result."),
  ).toBeTruthy();
  expect(screen.getByText("The model API could not be reached.")).toBeTruthy();
  expect(screen.queryByText("Tests generated · not executed")).toBeNull();
});

const executedRun: VerificationRun = {
  ...agentRun,
  report: {
    ...agentRun.report,
    repository: {
      root: "/repos/shipping",
      modules: [
        {
          module: "shipping",
          path: "shipping.py",
          docstring: "Shipping fees.",
          constants: ["FREE_THRESHOLD_CENTS"],
          functions: ["fee(amount_cents: int) -> int"],
          classes: [],
        },
      ],
      skipped: [],
      truncated: false,
      sha256: "abc123",
    },
    executions: [
      {
        test_id: "T1",
        module: "test_shipping.py",
        name: "test_free_shipping_at_threshold",
        outcome: "error",
        duration_seconds: 0.01,
        message: "ModuleNotFoundError: No module named 'shipping'",
      },
    ],
    executed_tests: 1,
    execution_success_rate: 0,
  },
};

const refinedRun: VerificationRun = {
  ...executedRun,
  mode: "baseline_b2",
  events: [
    ...executedRun.events,
    {
      id: "e2",
      stage: "improve",
      created_at: project.created_at,
      message: "Refined 1 invalid test from execution evidence.",
    },
    {
      id: "e3",
      stage: "re_measure",
      created_at: project.created_at,
      message: "Re-executed the refined test.",
    },
  ],
  report: {
    ...executedRun.report,
    diagnoses: [
      {
        test_id: "T1",
        classification: "invalid_test",
        explanation: "The test could not execute and required repair.",
      },
    ],
    refinement_iterations: 1,
  },
};

it("shows the bounded B2 diagnosis and refinement result", async () => {
  vi.mocked(api.runs).mockResolvedValue([refinedRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Failure diagnosis" });

  expect(screen.getByText("B2 closed-loop mode")).toBeTruthy();
  expect(screen.getByText("invalid test")).toBeTruthy();
  expect(screen.getByText("Complete · 1 iteration")).toBeTruthy();
  expect(screen.getByText("Tests refined")).toBeTruthy();
  expect(screen.getByText("Tests re-executed")).toBeTruthy();
});

it("shows each executed outcome without turning a green test into verification", async () => {
  vi.mocked(api.runs).mockResolvedValue([executedRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Agent workspace" });

  expect(screen.getByText("error")).toBeTruthy();
  expect(screen.getByText(/A passing test is not verification/)).toBeTruthy();
  // Inspection, analysis, generation and execution are done; refinement is not.
  expect(screen.getAllByText("Not connected")).toHaveLength(1);
  expect(screen.getAllByText("Complete")).toHaveLength(4);
});

it("reports execution evidence and a success rate in the report", async () => {
  vi.mocked(api.runs).mockResolvedValue([executedRun]);
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Runs & reports" });

  expect(
    screen.getByRole("heading", { name: "05 / Execution evidence" }),
  ).toBeTruthy();
  expect(screen.getByText("Execution success rate")).toBeTruthy();
  expect(
    screen.getByText("ModuleNotFoundError: No module named 'shipping'"),
  ).toBeTruthy();
  expect(
    screen.getByText("test_shipping.py::test_free_shipping_at_threshold"),
  ).toBeTruthy();
});

it("shows only the interfaces the agent was allowed to see", async () => {
  vi.mocked(api.runs).mockResolvedValue([executedRun]);
  window.history.replaceState({}, "", "/#view=evidence&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Requirements & evidence" });

  expect(screen.getByText("Inspected interfaces")).toBeTruthy();
  expect(screen.getByText("shipping")).toBeTruthy();
  expect(screen.getByText(/def fee\(amount_cents: int\) -> int/)).toBeTruthy();
  expect(
    screen.getByText(/Only public interfaces were sent to the model/),
  ).toBeTruthy();
});

const plannedRun: VerificationRun = {
  ...executedRun,
  report: {
    ...executedRun.report,
    test_plan: {
      scenarios: [
        {
          id: "S1",
          requirement_ids: ["R1"],
          title: "Free shipping at the exact threshold",
          category: "boundary",
          preconditions: ["Shipping module is available."],
          inputs: ["amount_cents = 10000"],
          steps: ["Call shipping.fee(10000)."],
          expected_result: "The shipping fee is zero.",
          evidence_refs: ["requirement:R1", "repository:shipping.py"],
          assumptions: ["Amounts use integer cents."],
        },
      ],
      notes: "No threshold was stated for large orders.",
    },
    generated_tests: executedRun.report.generated_tests.map((test) => ({
      ...test,
      scenario_ids: ["S1"],
    })),
    planning_gaps: ["R3: Refunds follow the original payment method."],
    uncovered_scenarios: [],
  },
};

it("traces a scenario through its source, generated test, and execution outcome", () => {
  render(<TestPlanDetails report={plannedRun.report} />);
  fireEvent.click(screen.getByText(/Free shipping at the exact threshold/));
  expect(screen.getByText("amount_cents = 10000")).toBeTruthy();
  expect(screen.getByText("The shipping fee is zero.")).toBeTruthy();
  expect(screen.getByText("Amounts use integer cents.")).toBeTruthy();
  expect(
    screen.getByText("Orders of at least 100 dollars ship free."),
  ).toBeTruthy();
  expect(
    screen.getByText(/shipping: fee\(amount_cents: int\) -> int/),
  ).toBeTruthy();
  expect(screen.getByText("T1 (test_shipping.py)")).toBeTruthy();
  expect(
    screen.getByText("test_free_shipping_at_threshold: error"),
  ).toBeTruthy();
  expect(screen.getByText("Requirements without scenarios")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
});

it("shows missing scenario implementations separately from execution results", () => {
  render(
    <TestPlanDetails
      report={{
        ...plannedRun.report,
        generated_tests: [],
        uncovered_scenarios: ["S1: Free shipping at the exact threshold"],
      }}
    />,
  );
  expect(screen.getByText("No generated test")).toBeTruthy();
  expect(screen.getByText("Not executed")).toBeTruthy();
  expect(
    screen.getByText("Scenarios without validated implementations"),
  ).toBeTruthy();
  expect(
    screen.queryByText("test_free_shipping_at_threshold: error"),
  ).toBeNull();
});

it("keeps legacy runs readable without inferring a test plan", () => {
  render(<TestPlanDetails report={agentRun.report} />);
  expect(screen.getByText("No test plan recorded for this run.")).toBeTruthy();
  expect(screen.queryByText("Expected result")).toBeNull();
});

it("displays the saved test plan in both the workspace and report", async () => {
  vi.mocked(api.runs).mockResolvedValue([plannedRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Test plan" });
  expect(screen.getByText("Plan tests")).toBeTruthy();
  expect(screen.getByText("1 scenario")).toBeTruthy();
  await go("view=reports&project=p1&run=r1");
  await screen.findByRole("heading", { name: "Test plan" });
  expect(screen.getByText(/Free shipping at the exact threshold/)).toBeTruthy();
});

it("retains analyzed requirements when planning fails", async () => {
  const failed: VerificationRun = {
    ...agentRun,
    status: "failed",
    stage: "plan",
    report: {
      ...agentRun.report,
      generated_tests: [],
      summary: "Run failed during the plan stage.",
      unresolved_issues: ["Planning model unavailable."],
    },
  };
  vi.mocked(api.runs).mockResolvedValue([failed]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByText("Planning model unavailable.");
  expect(
    screen.getByText("Plan tests").closest(".stage")?.textContent,
  ).toContain("Failed");
  expect(
    screen.getByText("Analyze requirements").closest(".stage")?.textContent,
  ).toContain("Complete");
  expect(screen.getByText("No test plan recorded for this run.")).toBeTruthy();
  await go("view=evidence&project=p1&run=r1");
  await screen.findByText("An order of at least 100 dollars ships free.");
});

it("restores active work from its URL, polls without hiding it, and stops after completion", async () => {
  vi.useFakeTimers();
  const queued: VerificationRun = {
    ...run,
    mode: "baseline_b0",
    status: "queued",
    report: { ...run.report, summary: "Run queued." },
  };
  const generating: VerificationRun = {
    ...plannedRun,
    status: "running",
    stage: "generate",
    report: {
      ...plannedRun.report,
      summary: "Generating pytest tests.",
      generated_tests: [],
      executions: [],
      executed_tests: 0,
    },
  };
  vi.mocked(api.runs).mockResolvedValue([queued]);
  vi.mocked(api.recentRuns).mockResolvedValue([queued]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  await act(async () => {
    render(<App />);
  });
  expect(screen.getByRole("heading", { name: "Agent workspace" })).toBeTruthy();
  expect(screen.getByText("Waiting for the worker")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Run in progress" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(api.createRun).not.toHaveBeenCalled();

  vi.mocked(api.runs).mockResolvedValue([generating]);
  vi.mocked(api.recentRuns).mockResolvedValue([generating]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(
    screen.getByText("Generate tests").closest(".stage")?.textContent,
  ).toContain("Running");
  expect(screen.getByText(/Free shipping at the exact threshold/)).toBeTruthy();
  const scenario = screen
    .getByText(/Free shipping at the exact threshold/)
    .closest("details")!;
  scenario.setAttribute("open", "");
  vi.mocked(api.runs).mockRejectedValueOnce(
    new Error("Connection temporarily unavailable."),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText("Connection temporarily unavailable.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Agent workspace" })).toBeTruthy();
  expect(scenario.hasAttribute("open")).toBe(true);

  vi.mocked(api.runs).mockResolvedValue([plannedRun]);
  vi.mocked(api.recentRuns).mockResolvedValue([plannedRun]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByText("Connection temporarily unavailable.")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Run verification again ↗" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(scenario.hasAttribute("open")).toBe(true);
  const count = vi.mocked(api.runs).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(api.runs).toHaveBeenCalledTimes(count);
});

it("preserves original test evidence beside a repaired attempt that timed out", () => {
  render(
    <ExecutionHistory
      report={{
        ...agentRun.report,
        executions: [],
        executed_tests: 0,
        execution_gaps: ["T1: test_shipping.py"],
        execution_attempts: [
          {
            number: 1,
            stage: "measure",
            created_at: project.created_at,
            tests: agentRun.report.generated_tests,
            result: {
              executions: executedRun.report.executions,
              exit_code: 1,
              timed_out: false,
              stderr_excerpt: "Initial attempt diagnostic.",
            },
            diagnoses: [],
          },
          {
            number: 2,
            stage: "re_measure",
            created_at: project.created_at,
            tests: agentRun.report.generated_tests,
            result: {
              executions: [],
              exit_code: -1,
              timed_out: true,
              stderr_excerpt: "Repair exceeded the execution limit.",
            },
            diagnoses: [],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText(/Attempt 1 · Initial execution/)).toBeTruthy();
  expect(screen.getByText(/Attempt 2 · After repair/)).toBeTruthy();
  expect(screen.getByText("Timed out")).toBeTruthy();
  expect(
    screen.getByText("ModuleNotFoundError: No module named 'shipping'"),
  ).toBeTruthy();
  expect(
    screen.getByText("Tests without final execution outcomes"),
  ).toBeTruthy();
  expect(screen.getAllByText(/Artifact T1/)).toHaveLength(2);
});

it("distinguishes a claimed scenario link from validated code and preserves review reasons", () => {
  render(
    <TestPlanDetails
      report={{
        ...plannedRun.report,
        validation_version: 3,
        generated_tests: plannedRun.report.generated_tests.map((test) => ({
          ...test,
          validation_status: "needs_review",
          validation_issues: [
            "S1: no check matches the planned inputs and oracle.",
          ],
          validated_checks: [],
        })),
      }}
    />,
  );
  expect(
    screen.getByText("Needs review; not counted as implemented"),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "No structured contract recorded; automatic validation is unavailable.",
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText("test_free_shipping_at_threshold: error"),
  ).toBeNull();
  expect(screen.getByText("Not executed")).toBeTruthy();
});

it("shows the planned contract and validated call location without claiming adequacy", () => {
  const contract = {
    target: "shipping.fee",
    arguments: [10000],
    keyword_arguments: [],
    operator: "equals" as const,
    expected_value: 0,
    exception_type: null,
  };
  render(
    <TestPlanDetails
      report={{
        ...plannedRun.report,
        validation_version: 3,
        test_plan: {
          ...plannedRun.report.test_plan!,
          scenarios: plannedRun.report.test_plan!.scenarios.map((scenario) => ({
            ...scenario,
            assumptions: [],
            preconditions: [],
            check: contract,
          })),
        },
        generated_tests: plannedRun.report.generated_tests.map((test) => ({
          ...test,
          validation_status: "validated",
          validation_issues: [],
          validated_checks: [
            {
              scenario_id: "S1",
              function_name: "test_free_shipping_at_threshold",
              target: "shipping.fee",
              call_line: 4,
              assertion_line: 4,
            },
          ],
        })),
      }}
    />,
  );
  expect(screen.getByText("Contract matched")).toBeTruthy();
  expect(screen.getByText(/"target": "shipping.fee"/)).toBeTruthy();
  expect(screen.getByText(/This does not prove/)).toBeTruthy();
  expect(
    screen.getByText("test_free_shipping_at_threshold: error"),
  ).toBeTruthy();
});

it("shows excluded artifacts and their reasons in the workspace without implying successful verification", async () => {
  const rejected: VerificationRun = {
    ...plannedRun,
    report: {
      ...plannedRun.report,
      validation_version: 3,
      executions: [],
      executed_tests: 0,
      requirement_coverage: 0,
      generated_tests: plannedRun.report.generated_tests.map((test) => ({
        ...test,
        validation_status: "needs_review",
        validated_checks: [],
        validation_issues: [
          "S1: no check matches the planned inputs and oracle.",
        ],
      })),
    },
  };
  vi.mocked(api.runs).mockResolvedValue([rejected]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByText(
    "S1: no check matches the planned inputs and oracle.",
  );
  expect(
    screen.getByText(
      "Excluded from validated coverage and automatic execution.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Validated requirement links")).toBeTruthy();
  expect(screen.getByText("Excluded by validation")).toBeTruthy();
  expect(screen.getByText("Review needed · tests excluded")).toBeTruthy();
  expect(
    screen.queryByText(
      /Historical coverage and conclusions have not been revalidated/,
    ),
  ).toBeNull();
});

it.each([undefined, 1, 2])(
  "flags historical validation version %s without changing saved evidence",
  async (version) => {
    const historical: VerificationRun = {
      ...plannedRun,
      report: {
        ...plannedRun.report,
        validation_version: version,
        requirement_coverage: 1,
      },
    };
    vi.mocked(api.runs).mockResolvedValue([historical]);
    window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
    render(<App />);
    await screen.findByText(
      /This run predates the current code-to-plan checks/,
    );
    expect(screen.getByText("Requirement coverage")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  },
);

it("attributes requirement table outcomes to independent functions in the same artifact", async () => {
  const base = plannedRun.report.generated_tests[0];
  const report = {
    ...plannedRun.report,
    validation_version: 3,
    outcome_mapping_version: 1,
    test_plan: {
      ...plannedRun.report.test_plan!,
      scenarios: [
        plannedRun.report.test_plan!.scenarios[0],
        {
          ...plannedRun.report.test_plan!.scenarios[0],
          id: "S2",
          requirement_ids: ["R2"],
        },
      ],
    },
    generated_tests: [
      {
        ...base,
        requirement_ids: ["R1", "R2"],
        scenario_ids: ["S1", "S2"],
        validation_status: "validated" as const,
        validated_checks: [
          {
            scenario_id: "S1",
            function_name: "test_free",
            target: "shipping.fee",
            call_line: 3,
            assertion_line: 3,
          },
          {
            scenario_id: "S2",
            function_name: "test_paid",
            target: "shipping.fee",
            call_line: 6,
            assertion_line: 6,
          },
        ],
      },
    ],
    executions: [
      {
        ...plannedRun.report.executions[0],
        test_id: base.id,
        module: base.module,
        name: "test_free",
        outcome: "passed" as const,
      },
      {
        ...plannedRun.report.executions[0],
        test_id: base.id,
        module: base.module,
        name: "test_paid",
        outcome: "failed" as const,
      },
    ],
  };
  expect(requirementOutcomes(report, "R1").map((item) => item.name)).toEqual([
    "test_free",
  ]);
  expect(requirementOutcomes(report, "R2").map((item) => item.name)).toEqual([
    "test_paid",
  ]);
  expect(
    requirementOutcomes(
      {
        ...report,
        executions: report.executions.map((item) => ({
          ...item,
          module: "test_wrong.py",
        })),
      },
      "R1",
    ),
  ).toEqual([]);
  vi.mocked(api.runs).mockResolvedValue([{ ...plannedRun, report }]);
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Runs & reports" });
  const table = screen.getByText(
    "03 / Requirement to test mapping",
  ).parentElement!;
  const firstRow = within(table).getByText("R1").closest("tr")!;
  const secondRow = within(table).getByText("R2").closest("tr")!;
  expect(within(firstRow).getByText("test_free: passed")).toBeTruthy();
  expect(within(firstRow).queryByText(/test_paid/)).toBeNull();
  expect(within(secondRow).getByText("test_paid: failed")).toBeTruthy();
  expect(within(secondRow).queryByText(/test_free/)).toBeNull();
  expect(screen.queryByText(/This run predates function-level/)).toBeNull();
});

it("warns that historical requirement conclusions have not been remapped", async () => {
  vi.mocked(api.runs).mockResolvedValue([plannedRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByText(
    /This run predates function-level requirement outcome mapping/,
  );
});

it("does not claim tests were generated when a completed run produced none", () => {
  const empty: VerificationRun = {
    ...plannedRun,
    status: "completed",
    report: { ...plannedRun.report, generated_tests: [], executed_tests: 0 },
  };
  expect(runBadge(empty).label).toBe("No tests generated");
  const blocked: VerificationRun = {
    ...empty,
    report: {
      ...empty.report,
      test_plan: {
        ...empty.report.test_plan!,
        scenarios: empty.report.test_plan!.scenarios.map((scenario) => ({
          ...scenario,
          oracle_grounding: {
            version: 1,
            status: "needs_review",
            verdict: "insufficient",
            rationale: "The source does not specify the fee.",
            citations: [],
            issues: ["Missing source support."],
            scenario_sha256: "scenario",
            source_sha256: "source",
          },
        })),
      },
    },
  };
  expect(runBadge(blocked).label).toBe("Review needed · no tests generated");
  expect(runBadge(blocked).tone).toBe("amber");
});
