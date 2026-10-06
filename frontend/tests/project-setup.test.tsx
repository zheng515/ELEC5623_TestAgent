import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProjectSetup } from "../components/project-setup";
import type { ProjectReadiness } from "../lib/types";

afterEach(cleanup);
it("shows blocked dependencies and the next action without claiming execution", () => {
  const readiness: ProjectReadiness = {
    status: "blocked",
    import_roots: ["src", "."],
    notes: [],
    checks: [
      {
        kind: "dependency",
        subject: "missing-package>=1",
        status: "failed",
        detail: "Add the dependency to a custom sandbox image and rebuild it.",
      },
    ],
  };
  render(<ProjectSetup readiness={readiness} />);
  expect(screen.getByText("Setup blocked")).toBeTruthy();
  expect(screen.getByText(/missing-package/)).toBeTruthy();
  expect(screen.getByText(/Add the dependency/)).toBeTruthy();
  expect(screen.getByText(/Planning and generation stopped/)).toBeTruthy();
});
it("labels limited checks as passed rather than full startup verification", () => {
  render(
    <ProjectSetup
      readiness={{
        status: "ready",
        import_roots: ["."],
        checks: [],
        notes: ["Startup readiness is not established."],
      }}
    />,
  );
  expect(screen.getByText("Supported checks passed")).toBeTruthy();
  expect(
    screen.getByText("Startup readiness is not established."),
  ).toBeTruthy();
});
it("does not backfill readiness for historical records", () => {
  render(<ProjectSetup />);
  expect(
    screen.getByText("No project readiness checks recorded."),
  ).toBeTruthy();
});
