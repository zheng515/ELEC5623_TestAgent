import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NewTask } from "../components/new-task";
import { api } from "../lib/api";
import type { RunMode } from "../lib/types";

vi.mock("../lib/api", () => ({
  api: { documentCapabilities: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.documentCapabilities).mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

it.each<[RunMode, RegExp]>([
  ["scaffold", /Model access is not configured\..*no tests are generated/],
  ["baseline_b0", /Test execution is not connected\..*not run/],
  ["baseline_b2", /The agent runs in the background/],
])("states what a %s run will do before submission", (mode, notice) => {
  render(<NewTask submit={vi.fn()} busy={false} mode={mode} />);
  expect(screen.getByText(notice)).toBeTruthy();
});
