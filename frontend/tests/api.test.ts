import { afterEach, expect, it, vi } from "vitest";
import { api } from "../lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("gives synchronous agent runs time for planning while keeping read requests bounded", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", fetchMock);
  await api.createRun("project/one");
  expect(timeout).toHaveBeenLastCalledWith(1200000);
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/v1/projects/project%2Fone/runs",
  );
  expect(fetchMock.mock.calls[0][1]).toEqual(
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    }),
  );
  await api.projects();
  expect(timeout).toHaveBeenLastCalledWith(15000);
});

it("explains that a timed out run may still be processing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("Expired", "TimeoutError")),
  );
  await expect(api.createRun("p1")).rejects.toThrow(
    "The backend may still be processing the run",
  );
});
