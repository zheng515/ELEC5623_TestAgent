import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../app/page";
import { Evidence } from "../components/project-workspace";
import { NewTask, sample } from "../components/new-task";
import { api, downloadHtmlReport, downloadReport } from "../lib/api";
import type { Project, VerificationRun } from "../lib/types";
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
  expect(screen.getByText(/File contents were not read/)).toBeTruthy();
});
