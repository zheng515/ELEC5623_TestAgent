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
  semantic_coverage: null,
  mutation_score: null,
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
