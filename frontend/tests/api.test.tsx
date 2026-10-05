import { afterEach, expect, it, vi } from "vitest";
import { ApiError, api, downloadHtmlReport } from "../lib/api";

afterEach(() => vi.unstubAllGlobals());

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
    await expect(downloadHtmlReport("r1")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener("reqtest:session-expired", listener);
  }
});
