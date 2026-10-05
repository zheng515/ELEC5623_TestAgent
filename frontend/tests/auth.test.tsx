import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "../app/page";
import { ApiError, api } from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      me: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      projects: vi.fn(),
      system: vi.fn(),
      recentRuns: vi.fn(),
      runs: vi.fn(),
    },
  };
});

const user = {
  id: "u1",
  name: "Ada Tester",
  email: "ada@example.com",
  created_at: "2026-09-23T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  vi.mocked(api.me).mockRejectedValue(
    new ApiError("Please sign in to continue.", 401),
  );
  vi.mocked(api.login).mockResolvedValue(user);
  vi.mocked(api.register).mockResolvedValue(user);
  vi.mocked(api.logout).mockResolvedValue();
  vi.mocked(api.projects).mockResolvedValue([]);
  vi.mocked(api.recentRuns).mockResolvedValue([]);
  vi.mocked(api.runs).mockResolvedValue([]);
  vi.mocked(api.system).mockResolvedValue({
    version: "0.1.0",
    mode: "scaffold",
    integrations: [],
  });
});
afterEach(cleanup);

async function fillSignIn() {
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "a-long-passphrase" },
  });
}

it("gates private requests until sign-in succeeds and restores the selected page", async () => {
  window.history.replaceState({}, "", "/#view=new");
  render(<App />);
  await fillSignIn();
  expect(api.projects).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "New verification task" });
  expect(api.login).toHaveBeenCalledWith({
    email: "ada@example.com",
    password: "a-long-passphrase",
  });
  expect(screen.getByText("Ada Tester")).toBeTruthy();
});

it("registers, validates confirmation, and opens the authenticated workspace", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: " Ada Tester " },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "a-long-passphrase" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "different" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Passwords do not match.",
  );
  expect(api.register).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "a-long-passphrase" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText("Projects");
  expect(api.register).toHaveBeenCalledWith({
    name: "Ada Tester",
    email: "ada@example.com",
    password: "a-long-passphrase",
  });
});

it("requires at least eight password characters when registering", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "Welcome back" });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Ada Tester" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "short7!" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "short7!" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Use 8–128 characters",
  );
  expect(api.register).not.toHaveBeenCalled();
});

it("shows server errors in English and keeps the login form usable", async () => {
  vi.mocked(api.login).mockRejectedValueOnce(
    new ApiError("Invalid email or password.", 401),
  );
  render(<App />);
  await fillSignIn();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Invalid email or password.");
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Projects");
});

it("restores a session after reload and clears private data on sign-out", async () => {
  vi.mocked(api.me).mockResolvedValue(user);
  render(<App />);
  await screen.findByText("Projects");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Welcome back" });
  expect(api.logout).toHaveBeenCalledOnce();
  expect(screen.queryByText("Ada Tester")).toBeNull();
  expect(screen.queryByText("Projects")).toBeNull();
  expect(screen.getByText("You have been signed out.")).toBeTruthy();
});

it("returns to sign-in after a protected API request reports an expired session", async () => {
  vi.mocked(api.me).mockResolvedValue(user);
  render(<App />);
  await screen.findByText("Projects");
  act(() => {
    window.dispatchEvent(new Event("reqtest:session-expired"));
  });
  await screen.findByRole("heading", { name: "Welcome back" });
  expect(
    screen.getByText("Your session has ended. Please sign in again."),
  ).toBeTruthy();
  expect(screen.queryByText("Ada Tester")).toBeNull();
});

it("retries a session check after a network error", async () => {
  vi.mocked(api.me)
    .mockRejectedValueOnce(new Error("API unavailable"))
    .mockResolvedValue(user);
  render(<App />);
  await screen.findByText("API unavailable");
  expect(api.projects).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try again ↻" }));
  await screen.findByText("Projects");
});

it("clears passwords when switching forms and supports password visibility", async () => {
  render(<App />);
  await fillSignIn();
  const password = screen.getByLabelText("Password", {
    exact: true,
  }) as HTMLInputElement;
  expect(password.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(password.type).toBe("text");
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(
    (screen.getByLabelText("Password", { exact: true }) as HTMLInputElement)
      .value,
  ).toBe("");
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
});

it("does not allow repeated submissions while signing in", async () => {
  let resolve!: (value: typeof user) => void;
  vi.mocked(api.login).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<App />);
  await fillSignIn();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(
    (screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    resolve(user);
  });
  await waitFor(() => expect(api.login).toHaveBeenCalledOnce());
});
