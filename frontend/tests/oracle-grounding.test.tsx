import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OracleGroundingDetails } from "../components/oracle-grounding";
import type { OracleGrounding } from "../lib/types";

afterEach(cleanup);
const grounding: OracleGrounding = {
  version: 1,
  status: "supported",
  verdict: "supported",
  rationale: "Free shipping is explicitly stated at the threshold.",
  citations: [
    {
      requirement_id: "R1",
      quote: "Orders of at least 100 dollars ship free.",
    },
  ],
  issues: [],
  scenario_sha256: "scenario",
  source_sha256: "source",
};

it("shows exact source support as an AI assessment with a clear limit", () => {
  render(<OracleGroundingDetails grounding={grounding} />);
  expect(screen.getByText("Source support assessed by AI")).toBeTruthy();
  expect(
    screen.getByText(/Orders of at least 100 dollars ship free/),
  ).toBeTruthy();
  expect(screen.getByText(/does not prove semantic correctness/)).toBeTruthy();
  expect(screen.queryByText("Verified")).toBeNull();
});

it("explains why a proposed oracle cannot be used for execution", () => {
  render(
    <OracleGroundingDetails
      grounding={{
        ...grounding,
        status: "needs_review",
        verdict: "insufficient",
        issues: ["No exception type is specified."],
      }}
    />,
  );
  expect(screen.getByText("Oracle needs review")).toBeTruthy();
  expect(screen.getByText("No exception type is specified.")).toBeTruthy();
});

it("does not invent source review for historical plans", () => {
  render(<OracleGroundingDetails />);
  expect(
    screen.getByText(/No independent oracle review recorded/),
  ).toBeTruthy();
});
