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
import { api, downloadReport } from "../lib/api";
import type { Project, VerificationRun } from "../lib/types";
vi.mock("../lib/api", () => ({
  api: {
    projects: vi.fn(),
    system: vi.fn(),
    recentRuns: vi.fn(),
    runs: vi.fn(),
    createProject: vi.fn(),
    createRun: vi.fn(),
  },
  downloadReport: vi.fn(),
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
    behaviors: [],
    evidence: [],
    unresolved_issues: ["Connect requirement analysis."],
    executed_tests: 0,
    semantic_coverage: null,
    mutation_score: null,
  },
};
beforeEach(() => {
  window.history.replaceState({}, "", "/");
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
  expect(screen.getAllByText("Not evaluated")).toHaveLength(2);
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
