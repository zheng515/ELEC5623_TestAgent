import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "../app/page";
import { SourceAudit } from "../components/source-audit";
import { Evidence } from "../components/project-workspace";
import { NewTask, sample } from "../components/new-task";
import { TestPlanDetails } from "../components/test-plan";
import { ExecutionHistory } from "../components/execution-history";
import { api, downloadReport } from "../lib/api";
import type { Project, VerificationRun } from "../lib/types";
import { runBadge } from "../components/ui";
vi.mock("../lib/api", () => ({
  api: {
    me: vi.fn(),
    logout: vi.fn(),
    projects: vi.fn(),
    system: vi.fn(),
    recentRuns: vi.fn(),
    reportHtml: vi.fn(),
    runs: vi.fn(),
    documentCapabilities: vi.fn(),
    importDocument: vi.fn(),
    createProject: vi.fn(),
    createRun: vi.fn(),
    watch: vi.fn(),
    setWatch: vi.fn(),
  },
  downloadReport: vi.fn(),
}));
// Arbitrary server versions prove the UI does not maintain its own policy literals.
const currentRules = { validation_version: 41, outcome_mapping_version: 7 };
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
  vi.mocked(api.documentCapabilities).mockResolvedValue({
    ocr_ready: true,
    doc_ready: true,
    ocr_languages: "eng",
    import_timeout_seconds: 120,
  });
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
    ...currentRules,
    mode: "scaffold",
    integrations: [],
  });
  vi.mocked(api.recentRuns).mockResolvedValue([run]);
  vi.mocked(api.runs).mockResolvedValue([run]);
  vi.mocked(api.reportHtml).mockResolvedValue(
    "<!doctype html><html><head></head><body><h1>Saved report</h1></body></html>",
  );
  vi.mocked(api.createProject).mockResolvedValue(project);
  vi.mocked(api.createRun).mockResolvedValue(run);
  vi.mocked(downloadReport).mockResolvedValue();
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
it("shows the saved report state for completed recent runs with zero tests", async () => {
  vi.mocked(api.recentRuns).mockResolvedValue([
    { ...agentRun, report: { ...agentRun.report, generated_tests: [] } },
  ]);
  render(<App />);
  expect(await screen.findByText("No tests generated")).toBeTruthy();
});

it("retains the historical outcome mapping warning using the server version", async () => {
  const historical = {
    ...agentRun,
    report: {
      ...agentRun.report,
      validation_version: currentRules.validation_version,
      outcome_mapping_version: currentRules.outcome_mapping_version - 1,
    },
  };
  vi.mocked(api.runs).mockResolvedValue([historical]);
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  await screen.findByText(
    /This run predates function-level requirement outcome mapping/,
  );
  expect(
    screen.queryByText(/This run predates the current code-to-plan checks/),
  ).toBeNull();
});

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
  await waitFor(() =>
    expect(downloadReport).toHaveBeenCalledWith("r1", "json"),
  );
  expect(
    screen.getByRole("option", { name: /Blocked · Integration required/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Download HTML ↓" }));
  await waitFor(() =>
    expect(downloadReport).toHaveBeenCalledWith("r1", "html"),
  );
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
  fireEvent.change(
    screen.getByLabelText("Import .txt, .md, PDF, or Word (.docx, .doc)"),
    {
      target: { files: [file] },
    },
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText(/SRS content/) as HTMLTextAreaElement).value,
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
it("accepts a GitHub URL pinned to a commit", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  const repositoryRef =
    "https://github.com/zheng515/ScheduleAgent_DOLMA/commit/44ee78d7053a8744f711fb507f9af86e258fcd75";
  render(<NewTask busy={false} submit={submit} />);
  fireEvent.click(screen.getByText("Use shipping example"));
  fireEvent.change(screen.getByLabelText(/GitHub repository URL/), {
    target: { value: repositoryRef },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ repository_ref: repositoryRef }),
    ),
  );
});
it("rejects unsupported requirement documents without overwriting the text", async () => {
  render(<NewTask busy={false} submit={vi.fn()} />);
  fireEvent.click(screen.getByText("Use shipping example"));
  fireEvent.change(
    screen.getByLabelText("Import .txt, .md, PDF, or Word (.docx, .doc)"),
    {
      target: { files: [new File(["exe"], "test.exe")] },
    },
  );
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText(/SRS content/) as HTMLTextAreaElement).value,
  ).toBe(sample.requirements_text);
});

it("prefills saved inputs when editing and offers a rerun", () => {
  render(
    <NewTask
      busy={false}
      submit={vi.fn()}
      project={sample}
      editing
      cancelHref="#view=workspace&project=p1"
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Edit inputs and rerun" }),
  ).toBeTruthy();
  expect(
    (screen.getByLabelText(/GitHub repository URL/) as HTMLInputElement).value,
  ).toBe(sample.repository_ref);
  expect(
    screen.getByRole("button", { name: "Save changes and rerun →" }),
  ).toBeTruthy();
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
  expect(screen.getByText("Recorded stage: report")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
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

  expect(screen.getByText("Run failed during the analyze stage.")).toBeTruthy();
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
    evidence: [
      {
        id: "E1",
        test: "test_shipping.py::test_free_shipping_at_threshold",
        outcome: "error",
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
  expect(screen.getByText("1 refinement iteration")).toBeTruthy();
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
  expect(screen.getByText("Recorded stage: report")).toBeTruthy();
});

it("previews the selected server report with execution evidence and isolates its HTML", async () => {
  vi.mocked(api.runs).mockResolvedValue([executedRun]);
  const html =
    "<!doctype html><html><head></head><body><h2>Execution evidence</h2><p>Execution success: 0%</p><p>test_shipping.py::test_free_shipping_at_threshold</p><p>ModuleNotFoundError: No module named 'shipping'</p></body></html>";
  vi.mocked(api.reportHtml).mockResolvedValue(html);
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  const frame = await screen.findByTitle("Verification report for run r1");
  expect(api.reportHtml).toHaveBeenCalledWith("r1");
  expect(frame.getAttribute("sandbox")).toBe("");
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  const content = frame.getAttribute("srcdoc")!;
  expect(content).toContain("default-src 'none'");
  expect(content).toContain("form-action 'none'");
  expect(content).toContain("Execution success: 0%");
  expect(content).toContain(
    "test_shipping.py::test_free_shipping_at_threshold",
  );
  expect(content).toContain("ModuleNotFoundError");
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
    scenario_evidence_refs: { S1: ["E1"] },
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
        scenario_evidence_refs: {},
        uncovered_scenarios: ["S1: Free shipping at the exact threshold"],
      }}
    />,
  );
  expect(screen.getByText("No generated test")).toBeTruthy();
  expect(screen.getByText("No attributable execution outcome")).toBeTruthy();
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
  expect(screen.getByText("Recorded stage: report")).toBeTruthy();
  expect(screen.getByText("1 scenario")).toBeTruthy();
  vi.mocked(api.reportHtml).mockResolvedValue(
    "<html><head></head><body><h2>Test plan</h2><p>Free shipping at the exact threshold</p></body></html>",
  );
  await go("view=reports&project=p1&run=r1");
  const frame = await screen.findByTitle("Verification report for run r1");
  expect(frame.getAttribute("srcdoc")).toContain(
    "Free shipping at the exact threshold",
  );
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
  expect(screen.getByText("Recorded stage: plan")).toBeTruthy();
  expect(screen.getByText("Run failed during the plan stage.")).toBeTruthy();
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
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByText(/Current stage: understand/)).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Run in progress" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(api.createRun).not.toHaveBeenCalled();
  expect(api.recentRuns).toHaveBeenCalledTimes(1);

  vi.mocked(api.runs).mockResolvedValue([generating]);
  vi.mocked(api.recentRuns).mockResolvedValue([generating]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText(/Current stage: generate/)).toBeTruthy();
  expect(screen.getByText("Running")).toBeTruthy();
  expect(api.recentRuns).toHaveBeenCalledTimes(1);
  expect(api.system).toHaveBeenCalledTimes(1);
  expect(api.projects).toHaveBeenCalledTimes(1);
  expect(
    screen.getAllByText(/Free shipping at the exact threshold/).length,
  ).toBeGreaterThan(0);
  const scenario = within(
    document.querySelector(".technical-drawer:not(.repository-monitoring)")!,
  )
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
  await go("view=home");
  expect(api.recentRuns).toHaveBeenCalledTimes(2);
  expect(api.projects).toHaveBeenCalledTimes(2);
  expect(api.system).toHaveBeenCalledTimes(2);
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
        scenario_evidence_refs: {},
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
  expect(screen.getByText("No attributable execution outcome")).toBeTruthy();
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
      validation_version: currentRules.validation_version,
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
  expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
  expect(screen.getByText("Review needed · tests excluded")).toBeTruthy();
  expect(
    screen.queryByText(
      /Historical coverage and conclusions have not been revalidated/,
    ),
  ).toBeNull();
});

it.each([undefined, 1, 2, 3])(
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

it("displays saved server outcome associations without rejudging raw test links", async () => {
  const base = plannedRun.report.generated_tests[0];
  const report = {
    ...plannedRun.report,
    ...currentRules,
    behaviors: [
      {
        id: "B-R1",
        requirement_id: "R1",
        description: "Free shipping",
        source_quote: "Free shipping at threshold.",
        expected_result: "Zero fee",
        verification_status: "Partially Verified" as const,
        code_refs: ["shipping.fee"],
        test_refs: [base.module],
        evidence_refs: ["E1", "missing"],
      },
      {
        id: "B-R2",
        requirement_id: "R2",
        description: "Paid shipping",
        source_quote: "Paid shipping below threshold.",
        expected_result: "Paid fee",
        verification_status: "Unverified" as const,
        code_refs: ["shipping.fee"],
        test_refs: [base.module],
        evidence_refs: ["E2"],
      },
    ],
    evidence: [
      { id: "E1", test: `${base.module}::test_free`, outcome: "passed" },
      { id: "E2", test: `${base.module}::test_paid`, outcome: "failed" },
      { id: "E3", test: "test_unmatched.py::test_other", outcome: "passed" },
    ],
    // These raw links differ from the saved decisions. Rendering must not reattribute them.
    test_plan: {
      ...plannedRun.report.test_plan!,
      scenarios: plannedRun.report.test_plan!.scenarios.map((scenario) => ({
        ...scenario,
        requirement_ids: ["R2"],
      })),
    },
    executions: plannedRun.report.executions.map((item) => ({
      ...item,
      module: "test_wrong.py",
      name: "test_other",
      outcome: "passed" as const,
    })),
  };
  vi.mocked(api.runs).mockResolvedValue([{ ...plannedRun, report }]);
  const savedHtml =
    "<html><head></head><body><p>R1 test_free: passed</p><p>R2 test_paid: failed</p></body></html>";
  vi.mocked(api.reportHtml).mockResolvedValue(savedHtml);
  window.history.replaceState({}, "", "/#view=reports&project=p1&run=r1");
  render(<App />);
  const frame = await screen.findByTitle("Verification report for run r1");
  expect(frame.getAttribute("srcdoc")).toContain("R1 test_free: passed");
  expect(frame.getAttribute("srcdoc")).toContain("R2 test_paid: failed");
  expect(frame.getAttribute("srcdoc")).not.toContain("test_other");
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

const importedDocument = {
  id: "document-1",
  filename: "spec.pdf",
  format: "pdf" as const,
  sha256: "a".repeat(64),
  text: "Return zero.",
  segments: [
    {
      filename: "spec.pdf",
      kind: "page" as const,
      number: 2,
      start: 0,
      end: 12,
    },
  ],
  warnings: ["OCR text may contain recognition errors."],
};

function uploadPdf() {
  const file = new File(["pdf"], "spec.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  fireEvent.change(
    screen.getByLabelText("Import .txt, .md, PDF, or Word (.docx, .doc)"),
    { target: { files: [file] } },
  );
}

it("imports a PDF with a visible page preview and submits its server source ID", async () => {
  vi.mocked(api.importDocument).mockResolvedValueOnce(importedDocument);
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<NewTask busy={false} submit={submit} />);
  uploadPdf();
  await screen.findByText("Imported source: spec.pdf");
  expect(api.importDocument).toHaveBeenCalledWith("spec.pdf", "AQID", 135000);
  expect(screen.getByText("page 2")).toBeTruthy();
  expect(
    screen.getByText("OCR text may contain recognition errors."),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Project name/), {
    target: { value: "Task" },
  });
  fireEvent.change(screen.getByLabelText(/GitHub repository URL/), {
    target: { value: sample.repository_ref },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements_text: "Return zero.",
        requirement_document_id: "document-1",
      }),
    ),
  );
});

it("clears original file locations when imported text is edited", async () => {
  vi.mocked(api.importDocument).mockResolvedValueOnce(importedDocument);
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<NewTask busy={false} submit={submit} />);
  uploadPdf();
  await screen.findByText("Imported source: spec.pdf");
  fireEvent.change(screen.getByLabelText(/SRS content/), {
    target: { value: "Edited rule." },
  });
  expect(screen.queryByText("Imported source: spec.pdf")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "Original file locations were cleared",
  );
  fireEvent.change(screen.getByLabelText(/Project name/), {
    target: { value: "Task" },
  });
  fireEvent.change(screen.getByLabelText(/GitHub repository URL/), {
    target: { value: sample.repository_ref },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create verification task →" }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ requirement_document_id: null }),
    ),
  );
});

it("keeps previous requirements and source metadata when another import fails", async () => {
  vi.mocked(api.importDocument)
    .mockResolvedValueOnce(importedDocument)
    .mockRejectedValueOnce(
      new Error("No extractable text. OCR found no readable words."),
    );
  render(<NewTask busy={false} submit={vi.fn()} />);
  uploadPdf();
  await screen.findByText("Imported source: spec.pdf");
  uploadPdf();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No extractable text",
  );
  expect(screen.getByText("Imported source: spec.pdf")).toBeTruthy();
  expect(
    (screen.getByLabelText(/SRS content/) as HTMLTextAreaElement).value,
  ).toBe("Return zero.");
});

it("shows original file positions for analyzed quote links and for setup-only runs", () => {
  const audit = {
    version: 1,
    extraction_limit: 40,
    limit_reached: false,
    returned_requirements: 1,
    retained_requirements: 1,
    semantic_completeness: "not_established" as const,
    issues: [],
    ambiguous_requirement_ids: [],
    unlinked_fragments: [],
    links: [
      {
        text: "Return zero.",
        start: 0,
        end: 12,
        line: 1,
        requirement_ids: ["R1"],
        locations: [{ filename: "spec.pdf", kind: "page" as const, number: 2 }],
      },
    ],
  };
  const { rerender } = render(
    <SourceAudit
      report={{
        ...run.report,
        requirement_document: importedDocument,
        source_audit: audit,
      }}
    />,
  );
  expect(screen.getByText("R1 · spec.pdf · page 2")).toBeTruthy();
  rerender(
    <SourceAudit
      report={{
        ...run.report,
        requirement_document: importedDocument,
        source_audit: null,
      }}
    />,
  );
  expect(screen.getByText("Imported source: spec.pdf")).toBeTruthy();
  expect(screen.getByText("page 2")).toBeTruthy();
  expect(screen.getByText(/No source audit recorded/)).toBeTruthy();
});

it("edits saved document inputs without submitting server-only project fields", async () => {
  const saved = {
    ...project,
    requirement_document_id: importedDocument.id,
    requirement_document: importedDocument,
    requirements_text: importedDocument.text,
  };
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<NewTask busy={false} submit={submit} project={saved} editing />);
  expect(screen.getByText("Imported source: spec.pdf")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Save changes and rerun/ }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalled());
  const payload = submit.mock.calls[0][0];
  expect(payload.requirement_document_id).toBe(importedDocument.id);
  expect(payload).not.toHaveProperty("id");
  expect(payload).not.toHaveProperty("created_at");
  expect(payload).not.toHaveProperty("requirement_document");
});

it("previews source segments after supplementary Unicode characters without shifting offsets", () => {
  const unicodeDocument = {
    ...importedDocument,
    text: "First 🧪.\n\nSecond rule.",
    segments: [
      {
        filename: "spec.pdf",
        kind: "page" as const,
        number: 2,
        start: 10,
        end: 22,
      },
    ],
  };
  render(
    <SourceAudit
      report={{ ...run.report, requirement_document: unicodeDocument }}
    />,
  );
  expect(screen.getByText("Second rule.")).toBeTruthy();
});

it("accepts legacy Word files without requiring manual conversion", async () => {
  const legacyDocument = {
    ...importedDocument,
    filename: "legacy.doc",
    format: "doc" as const,
    segments: [
      {
        filename: "legacy.doc",
        kind: "paragraph" as const,
        number: 1,
        start: 0,
        end: 12,
        method: "converted" as const,
      },
    ],
    warnings: ["Paragraph numbers refer to the converted body."],
  };
  vi.mocked(api.importDocument).mockResolvedValueOnce(legacyDocument);
  render(<NewTask busy={false} submit={vi.fn()} />);
  const file = new File(["doc"], "legacy.doc", { type: "application/msword" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  fireEvent.change(
    screen.getByLabelText("Import .txt, .md, PDF, or Word (.docx, .doc)"),
    { target: { files: [file] } },
  );
  await screen.findByText("Imported source: legacy.doc");
  expect(screen.getByText("converted paragraph 1")).toBeTruthy();
  expect(
    screen.getByText("Paragraph numbers refer to the converted body."),
  ).toBeTruthy();
});

it("labels OCR pages and source links without implying transcription accuracy", () => {
  const ocrDocument = {
    ...importedDocument,
    segments: [
      {
        ...importedDocument.segments[0],
        method: "ocr" as const,
        confidence: 58,
      },
    ],
  };
  render(
    <SourceAudit
      report={{
        ...run.report,
        requirement_document: ocrDocument,
        source_audit: {
          version: 1,
          extraction_limit: 40,
          limit_reached: false,
          returned_requirements: 1,
          retained_requirements: 1,
          semantic_completeness: "not_established",
          ambiguous_requirement_ids: [],
          issues: [],
          unlinked_fragments: [],
          links: [
            {
              text: "Return zero.",
              start: 0,
              end: 12,
              line: 1,
              requirement_ids: ["R1"],
              locations: ocrDocument.segments,
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("page 2 · OCR (score 58/100)")).toBeTruthy();
  expect(
    screen.getByText("R1 · spec.pdf · page 2 · OCR (score 58/100)"),
  ).toBeTruthy();
});

it("shows missing document tools while keeping ordinary import available", async () => {
  vi.mocked(api.documentCapabilities).mockResolvedValueOnce({
    ocr_ready: false,
    doc_ready: false,
    ocr_languages: "eng",
    import_timeout_seconds: 120,
  });
  render(<NewTask busy={false} submit={vi.fn()} />);
  expect(
    (await screen.findByText(/OCR unavailable on this server/)).textContent,
  ).toContain("Legacy Word conversion unavailable");
  expect(
    (
      screen.getByLabelText(
        "Import .txt, .md, PDF, or Word (.docx, .doc)",
      ) as HTMLInputElement
    ).disabled,
  ).toBe(false);
});

it("does not attribute raw scenario outcomes when the saved historical mapping is missing", () => {
  render(
    <TestPlanDetails
      report={{ ...plannedRun.report, scenario_evidence_refs: null }}
    />,
  );
  expect(
    screen.getByText(/No saved scenario outcome attribution/),
  ).toBeTruthy();
  expect(
    screen.queryByText("test_free_shipping_at_threshold: error"),
  ).toBeNull();
  expect(screen.getByText(/Free shipping at the exact threshold/)).toBeTruthy();
});

it("renders saved scenario evidence without reassigning changed raw test links", () => {
  render(
    <TestPlanDetails
      report={{
        ...plannedRun.report,
        generated_tests: [],
        executions: [],
        scenario_evidence_refs: { S1: ["E1"] },
      }}
    />,
  );
  expect(
    screen.getByText("test_free_shipping_at_threshold: error"),
  ).toBeTruthy();
  expect(screen.getByText("No generated test")).toBeTruthy();
});

it("retains reviewed-out cases, zero tests and skipped execution without fabricated stages", async () => {
  const empty: VerificationRun = {
    ...plannedRun,
    mode: "baseline_b2",
    status: "completed",
    stage: "report",
    report: {
      ...plannedRun.report,
      generated_tests: [],
      executions: [],
      evidence: [],
      scenario_evidence_refs: {},
      execution_attempts: [],
      executed_tests: 0,
      test_plan: {
        ...plannedRun.report.test_plan!,
        scenarios: plannedRun.report.test_plan!.scenarios.map((scenario) => ({
          ...scenario,
          oracle_grounding: {
            version: 1,
            status: "needs_review",
            verdict: "insufficient",
            rationale: "Setup is not established.",
            citations: [],
            issues: ["Setup is not established."],
            scenario_sha256: "scenario",
            source_sha256: "source",
          },
        })),
      },
    },
  };
  vi.mocked(api.runs).mockResolvedValue([empty]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Agent workspace" });
  const explorer = screen.getByRole("region", { name: "Test explorer" });
  expect(within(explorer).getAllByText("Needs review").length).toBeGreaterThan(
    0,
  );
  expect(within(explorer).getByText("Setup is not established.")).toBeTruthy();
  expect(
    screen.getByText("Tests generated").closest("div")?.textContent,
  ).toContain("0");
  expect(
    screen.getByText("Executed tests").closest("div")?.textContent,
  ).toContain("0");
  expect(screen.getByText("Skipped · no generated tests")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(document.querySelector(".stages")).toBeNull();
});

it("keeps diagnostics collapsed and lets users search the compact test browser", async () => {
  vi.mocked(api.runs).mockResolvedValue([plannedRun]);
  window.history.replaceState({}, "", "/#view=workspace&project=p1&run=r1");
  render(<App />);
  await screen.findByRole("heading", { name: "Agent workspace" });
  const drawer = document.querySelector(
    ".technical-drawer:not(.repository-monitoring)",
  )!;
  expect(drawer.hasAttribute("open")).toBe(false);
  const explorer = screen.getByRole("region", { name: "Test explorer" });
  fireEvent.change(
    within(explorer).getByRole("textbox", { name: "Search test cases" }),
    { target: { value: "no-match-xyz" } },
  );
  expect(within(explorer).getByText("No matching test cases.")).toBeTruthy();
  fireEvent.change(
    within(explorer).getByRole("textbox", { name: "Search test cases" }),
    { target: { value: "" } },
  );
  expect(
    within(explorer).getByRole("heading", { name: "Requirement context" }),
  ).toBeTruthy();
});
