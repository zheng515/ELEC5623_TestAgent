import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SourceAudit } from "../components/source-audit";
import type { VerificationReport } from "../lib/types";

afterEach(cleanup);
const report: VerificationReport = {
  summary: "Done",
  repository: null,
  requirements: [],
  executions: [],
  generated_tests: [],
  behaviors: [],
  evidence: [],
  unresolved_issues: [],
  coverage_gaps: [],
  executed_tests: 0,
  execution_success_rate: null,
  requirement_coverage: 1,
  source_audit: {
    version: 1,
    extraction_limit: 1,
    limit_reached: true,
    returned_requirements: 1,
    retained_requirements: 1,
    semantic_completeness: "not_established",
    issues: [],
    ambiguous_requirement_ids: ["R2"],
    links: [
      {
        text: "Ship free.",
        start: 0,
        end: 10,
        line: 1,
        requirement_ids: ["R1"],
      },
    ],
    unlinked_fragments: [
      { text: "Refund within 7 days.", start: 11, end: 32, line: 2 },
    ],
  },
};
it("shows omitted source and limits despite full extracted coverage", () => {
  render(<SourceAudit report={report} />);
  expect(screen.getByText("Completeness not established")).toBeTruthy();
  expect(screen.getByText(/Limit reached/)).toBeTruthy();
  expect(screen.getByText("Refund within 7 days.")).toBeTruthy();
  expect(screen.getByText(/ambiguous locations: R2/)).toBeTruthy();
  expect(
    screen.getByText(/do not measure verification of the entire/),
  ).toBeTruthy();
});
it("does not invent an audit for historical runs", () => {
  render(<SourceAudit report={{ ...report, source_audit: undefined }} />);
  expect(screen.getByText(/No source audit recorded/)).toBeTruthy();
});

it("shows broad quote review notes without an empty notes block", () => {
  const issue =
    "Quote linked to R1 spans 2 potential rule units at lines 1-2. Review each unit against the extracted requirements; a text-covered span does not establish that every rule was extracted.";
  render(
    <SourceAudit
      report={{
        ...report,
        source_audit: { ...report.source_audit!, issues: [issue] },
      }}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Source review notes" }),
  ).toBeTruthy();
  expect(screen.getByText(issue)).toBeTruthy();
});

it("omits the source review notes block when there are no issues", () => {
  render(<SourceAudit report={report} />);
  expect(
    screen.queryByRole("heading", { name: "Source review notes" }),
  ).toBeNull();
});
