import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RepositoryWatchPanel } from "../components/repository-watch";
import { RepositoryChangeSummary } from "../components/repository-change";
import { api } from "../lib/api";
import type { Project, RepositoryWatch, VerificationRun } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: { watch: vi.fn(), setWatch: vi.fn() },
}));

const project: Project = {
  id: "p1",
  name: "Shipping",
  description: "",
  repository_ref: "https://github.com/example/shipping/tree/main",
  requirements_text: "Orders of at least 100 dollars ship free.",
  goal: "Check the rules.",
  created_at: "2026-10-06T00:00:00Z",
};
const idle: RepositoryWatch = {
  project_id: "p1",
  enabled: false,
  active: false,
  interval_seconds: 600,
};
const watching: RepositoryWatch = {
  ...idle,
  enabled: true,
  active: true,
  last_checked_at: "2026-10-06T01:00:00Z",
  last_commit: "abcdef1234567890",
  last_run_id: "r2",
};

beforeEach(() => vi.mocked(api.watch).mockResolvedValue(idle));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("offers watching only for GitHub repositories", () => {
  render(
    <RepositoryWatchPanel
      project={{ ...project, repository_ref: "shipping" }}
    />,
  );
  expect(screen.queryByText("Repository watch")).toBeNull();
  expect(api.watch).not.toHaveBeenCalled();
});

it("starts watching and shows what the last check found", async () => {
  vi.mocked(api.setWatch).mockResolvedValue(watching);
  render(<RepositoryWatchPanel project={project} />);
  const start = await screen.findByRole("button", {
    name: "Watch for new commits",
  });
  vi.mocked(api.watch).mockResolvedValue(watching);

  fireEvent.click(start);

  await screen.findByRole("button", { name: "Stop watching" });
  expect(api.setWatch).toHaveBeenCalledWith("p1", true);
  expect(screen.getByText("Watching")).toBeTruthy();
  expect(screen.getByText(/Checked every 10 minutes/)).toBeTruthy();
  expect(screen.getByText("abcdef123456")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "latest watch run" }).getAttribute("href"),
  ).toContain("run=r2");
});

it("says when an enabled watch is paused and reports check errors", async () => {
  vi.mocked(api.watch).mockResolvedValue({
    ...watching,
    active: false,
    last_error: "GitHub's API rate limit was reached.",
  });
  render(<RepositoryWatchPanel project={project} />);

  expect(await screen.findByText("Paused")).toBeTruthy();
  expect(screen.getByText(/unavailable on the server/)).toBeTruthy();
  expect(screen.getByText("GitHub's API rate limit was reached.")).toBeTruthy();
});

it("shows the server's reason when a watch cannot start", async () => {
  vi.mocked(api.setWatch).mockRejectedValue(
    new Error("A commit URL never changes."),
  );
  render(<RepositoryWatchPanel project={project} />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Watch for new commits" }),
  );

  expect(await screen.findByText("A commit URL never changes.")).toBeTruthy();
});

it("asks for a reload when the watcher queues a new run", async () => {
  const onNewRun = vi.fn();
  vi.mocked(api.watch).mockResolvedValue({ ...watching, last_run_id: "r1" });
  vi.mocked(api.setWatch).mockResolvedValue(watching);
  render(<RepositoryWatchPanel project={project} onNewRun={onNewRun} />);
  await screen.findByText("Watching");
  expect(onNewRun).not.toHaveBeenCalled();

  // The next load (normally the 15-second poll) sees a newer run.
  vi.mocked(api.watch).mockResolvedValue(watching);
  fireEvent.click(screen.getByRole("button", { name: "Stop watching" }));

  await waitFor(() => expect(onNewRun).toHaveBeenCalledTimes(1));
});

const run: VerificationRun = {
  id: "r2",
  project_id: "p1",
  trigger: "watch",
  mode: "baseline_b2",
  status: "completed",
  stage: "report",
  created_at: "2026-10-06T01:00:00Z",
  input_sha256: "0",
  events: [],
  report: {
    summary: "Incremental run.",
    repository: null,
    requirements: [],
    generated_tests: [],
    behaviors: [],
    evidence: [],
    unresolved_issues: [],
    coverage_gaps: [],
    executions: [],
    executed_tests: 0,
    execution_success_rate: null,
    requirement_coverage: null,
    semantic_coverage: null,
    mutation_score: null,
    change: {
      baseline_run_id: "r1",
      baseline_commit: "1111111111111111",
      commit: "2222222222222222",
      content_changed: true,
      added: ["shipping.refund", "shipping.discount"],
      removed: [],
      changed: [],
      new_scenario_ids: ["S2"],
      new_test_ids: ["T2"],
      carried_test_ids: ["T1"],
      untraced: ["shipping.discount"],
      invalidated_tests: [],
      regressions: ["T1::test_fee: passed at the baseline, failed now"],
    },
  },
};

it("summarizes how an incremental run grew the suite", () => {
  render(<RepositoryChangeSummary run={run} />);

  expect(screen.getByText("Changes since the baseline run")).toBeTruthy();
  expect(screen.getByText("Repository watch")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "the baseline run" }).getAttribute("href"),
  ).toContain("run=r1");
  expect(screen.getByText("Added (2)")).toBeTruthy();
  expect(screen.getByText("New code without a requirement (1)")).toBeTruthy();
  expect(
    screen.getByText("T1::test_fee: passed at the baseline, failed now"),
  ).toBeTruthy();
  expect(screen.queryByText(/Removed/)).toBeNull();
});

it("shows nothing for a full run", () => {
  const { container } = render(
    <RepositoryChangeSummary
      run={{ ...run, report: { ...run.report, change: null } }}
    />,
  );
  expect(container.innerHTML).toBe("");
});
