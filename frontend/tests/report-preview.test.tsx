import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Report } from "../components/report-preview";
import { api } from "../lib/api";
import type { Project, VerificationRun } from "../lib/types";

vi.mock("../lib/api", () => ({ api: { reportHtml: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const project: Project = {
  id: "p1",
  name: "Saved project",
  description: "",
  requirements_text: "Return zero.",
  repository_ref: "https://github.com/example/project",
  goal: "Verify the saved source.",
  created_at: "2026-10-08T00:00:00Z",
};
const run: VerificationRun = {
  id: "r1",
  project_id: "p1",
  status: "running",
  stage: "generate",
  mode: "baseline_b0",
  input_sha256: "saved",
  created_at: project.created_at,
  updated_at: project.created_at,
  events: [],
  report: {
    summary: "Generating tests.",
    requirements: [],
    generated_tests: [],
    behaviors: [],
    evidence: [],
    repository: null,
    unresolved_issues: [],
    coverage_gaps: [],
    executions: [],
    executed_tests: 0,
    requirement_coverage: null,
    execution_success_rate: null,
  },
};
const html =
  "<!doctype html><html><head></head><body>Initial saved results</body></html>";

it("refreshes interim reports by their recorded update and retains HTML during errors", async () => {
  vi.mocked(api.reportHtml).mockResolvedValue(html);
  const download = vi.fn();
  const { rerender } = render(
    <Report project={project} run={run} download={download} busy={false} />,
  );
  const frame = await screen.findByTitle("Verification report for run r1");
  expect(frame.getAttribute("sandbox")).toBe("");
  expect(
    screen
      .getByRole("button", { name: "Download HTML ↓" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText(/Interim report/)).toBeTruthy();
  let reject!: (error: Error) => void;
  vi.mocked(api.reportHtml).mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
  );
  rerender(
    <Report
      project={project}
      run={{ ...run, updated_at: "2026-10-08T00:00:02Z" }}
      download={download}
      busy={false}
    />,
  );
  await waitFor(() => expect(api.reportHtml).toHaveBeenCalledTimes(2));
  expect(
    screen.getByTitle("Verification report for run r1").getAttribute("srcdoc"),
  ).toContain("Initial saved results");
  await act(async () => reject(new Error("Report connection interrupted.")));
  expect(
    await screen.findByText(/The last loaded report remains visible/),
  ).toBeTruthy();
  expect(screen.getByTitle("Verification report for run r1")).toBe(frame);
  vi.mocked(api.reportHtml).mockResolvedValue(
    "<html><head></head><body>Completed saved results</body></html>",
  );
  rerender(
    <Report
      project={project}
      run={{
        ...run,
        status: "completed",
        stage: "report",
        updated_at: "2026-10-08T00:00:04Z",
      }}
      download={download}
      busy={false}
    />,
  );
  await waitFor(() =>
    expect(frame.getAttribute("srcdoc")).toContain("Completed saved results"),
  );
  expect(screen.queryByText(/Report connection interrupted/)).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Download HTML ↓" })
      .hasAttribute("disabled"),
  ).toBe(false);
  vi.mocked(api.reportHtml).mockResolvedValue(
    "<html><head></head><body>Refreshed same saved run</body></html>",
  );
  rerender(
    <Report
      project={project}
      run={{
        ...run,
        status: "completed",
        stage: "report",
        updated_at: "2026-10-08T00:00:04Z",
      }}
      revision={1}
      download={download}
      busy={false}
    />,
  );
  await waitFor(() =>
    expect(frame.getAttribute("srcdoc")).toContain("Refreshed same saved run"),
  );
  expect(api.reportHtml).toHaveBeenCalledTimes(4);
});

it("clears the previous HTML when selecting a different run instead of showing the wrong evidence", async () => {
  vi.mocked(api.reportHtml).mockResolvedValue(html);
  const props = { project, run, download: vi.fn(), busy: false };
  const { rerender } = render(<Report {...props} />);
  await screen.findByTitle("Verification report for run r1");
  let resolve!: (html: string) => void;
  vi.mocked(api.reportHtml).mockImplementationOnce(
    () =>
      new Promise((resolvePromise) => {
        resolve = resolvePromise;
      }),
  );
  rerender(<Report {...props} run={{ ...run, id: "r2" }} />);
  await waitFor(() => expect(api.reportHtml).toHaveBeenCalledWith("r2"));
  expect(screen.queryByTitle("Verification report for run r1")).toBeNull();
  expect(screen.queryByTitle("Verification report for run r2")).toBeNull();
  await act(async () =>
    resolve("<html><head></head><body>Second run only</body></html>"),
  );
  const second = await screen.findByTitle("Verification report for run r2");
  expect(second.getAttribute("srcdoc")).toContain("Second run only");
  expect(second.getAttribute("srcdoc")).not.toContain("Initial saved results");
});
