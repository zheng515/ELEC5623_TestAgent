import { afterEach, expect, it, vi } from "vitest";
import { ApiError, api, downloadReport } from "../lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("queues runs with cookie authentication and a bounded request timeout", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
  vi.stubGlobal("fetch", fetchMock);
  await api.createRun("project/one");
  expect(timeout).toHaveBeenLastCalledWith(15000);
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

it("updates project inputs through the versioned project endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "p1" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  await api.updateProject("project/one", {
    name: "Revised",
    description: "",
    repository_ref: "https://github.com/example/project",
    requirements_text: "R1: Revised.",
    goal: "Verify the revision.",
  });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/projects/project%2Fone");
  expect(fetchMock.mock.calls[0][1]).toEqual(
    expect.objectContaining({ method: "PATCH" }),
  );
});

it("uses cookie credentials and JSON for login and bodyless logout", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "u1" }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await api.login({ email: "user@example.com", password: "test-passphrase" });
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    "/api/v1/auth/login",
    expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    }),
  );
  await expect(api.logout()).resolves.toBeUndefined();
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    "/api/v1/auth/logout",
    expect.objectContaining({
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  );
});

it("signals session expiry for protected requests and HTML downloads, but not invalid login", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ detail: "Please sign in to continue." }),
            { status: 401 },
          ),
      ),
  );
  const listener = vi.fn();
  window.addEventListener("reqtest:session-expired", listener);
  try {
    await expect(
      api.login({ email: "user@example.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    await expect(api.projects()).rejects.toBeInstanceOf(ApiError);
    await expect(downloadReport("r1", "html")).rejects.toBeInstanceOf(ApiError);
    await expect(api.reportHtml("r1")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(3);
  } finally {
    window.removeEventListener("reqtest:session-expired", listener);
  }
});

it.each(["json", "html"] as const)(
  "downloads %s with its MIME type, filename, payload and shared cleanup",
  async (format) => {
    vi.useFakeTimers();
    const report = { summary: "Saved report", executed_tests: 0 };
    const html = "<!doctype html><p>Saved report</p>";
    const htmlBlob = new Blob([html], { type: "text/html" });
    const createObjectURL = vi.fn().mockReturnValue("blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => report,
      blob: async () => htmlBlob,
    });
    vi.stubGlobal("fetch", fetch);
    const clicked: { filename: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        filename: this.download,
        href: this.getAttribute("href")!,
      });
    });
    const OriginalBlob = Blob;
    const createdParts: BlobPart[][] = [];
    vi.stubGlobal(
      "Blob",
      class extends OriginalBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          createdParts.push(parts);
        }
      },
    );
    try {
      await downloadReport("run/one", format);
      const downloaded = createObjectURL.mock.calls[0][0] as Blob;
      expect(downloaded.type).toBe(
        format === "json" ? "application/json" : "text/html",
      );
      if (format === "json")
        expect(createdParts).toEqual([[JSON.stringify(report, null, 2)]]);
      else expect(downloaded).toBe(htmlBlob);
      expect(clicked).toEqual([
        { filename: `reqtest-report-run/one.${format}`, href: "blob:report" },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        format === "json"
          ? "/api/v1/runs/run%2Fone/report"
          : "/api/v1/runs/run%2Fone/report.html",
        expect.objectContaining({ credentials: "include", cache: "no-store" }),
      );
      expect(document.querySelector('a[href="blob:report"]')).toBeNull();
      vi.advanceTimersByTime(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    } finally {
      vi.useRealTimers();
    }
  },
);

it("loads preview HTML through the same authenticated bounded transport", async () => {
  const html = "<!doctype html><p>Recorded report</p>";
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(html, { headers: { "Content-Type": "text/html" } }),
    );
  vi.stubGlobal("fetch", fetch);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  await expect(api.reportHtml("run/one")).resolves.toBe(html);
  expect(timeout).toHaveBeenLastCalledWith(15000);
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/runs/run%2Fone/report.html",
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
});
