import type {
  RequirementDocument,
  DocumentCapabilities,
  Credentials,
  RegisterRequest,
  User,
  Project,
  ProjectCreate,
  RepositoryWatch,
  SystemInfo,
  VerificationReport,
  VerificationRun,
} from "./types";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sessionExpired() {
  window.dispatchEvent(new Event("reqtest:session-expired"));
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000,
  responseFormat: "json" | "blob" | "text" = "json",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(options.method && options.method !== "GET"
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "TimeoutError"
    ) {
      throw new Error(
        path === "/documents/import"
          ? "Document import timed out. Try a smaller or simpler file."
          : "The request timed out. The backend may still be processing the run; refresh its workspace before starting another run.",
      );
    }
    throw new Error(
      "Unable to reach the API. Check that the backend is running and try again.",
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    if (response.status === 401 && !path.startsWith("/auth/")) sessionExpired();
    throw new ApiError(
      typeof detail === "string"
        ? detail
        : response.status === 422
          ? path === "/documents/import"
            ? "Check the document name, format, and size."
            : path.startsWith("/auth/")
              ? "Check your email and password. Use 8–128 characters for a new password."
              : "Check the project name, requirements, and verification goal."
          : `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (
    responseFormat === "blob"
      ? response.blob()
      : responseFormat === "text"
        ? response.text()
        : response.json()
  ) as Promise<T>;
}
export const api = {
  documentCapabilities: () =>
    request<DocumentCapabilities>("/documents/capabilities"),
  importDocument: (
    filename: string,
    content_base64: string,
    timeoutMs = 135000,
  ) =>
    request<RequirementDocument>(
      "/documents/import",
      {
        method: "POST",
        body: JSON.stringify({ filename, content_base64 }),
      },
      timeoutMs,
    ),
  me: () => request<User>("/auth/me"),
  register: (payload: RegisterRequest) =>
    request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: Credentials) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  recentRuns: () => request<VerificationRun[]>("/runs?limit=5"),
  projects: () => request<Project[]>("/projects"),
  createProject: (payload: ProjectCreate) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProject: (id: string, payload: ProjectCreate) =>
    request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  runs: (id: string) =>
    request<VerificationRun[]>(`/projects/${encodeURIComponent(id)}/runs`),
  createRun: (id: string) =>
    request<VerificationRun>(`/projects/${encodeURIComponent(id)}/runs`, {
      method: "POST",
    }),
  watch: (id: string) =>
    request<RepositoryWatch>(`/projects/${encodeURIComponent(id)}/watch`),
  setWatch: (id: string, enabled: boolean) =>
    request<RepositoryWatch>(`/projects/${encodeURIComponent(id)}/watch`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  system: () => request<SystemInfo>("/system"),
  reportHtml: (id: string) =>
    request<string>(
      `/runs/${encodeURIComponent(id)}/report.html`,
      {},
      15000,
      "text",
    ),
  report: (id: string) =>
    request<VerificationReport>(`/runs/${encodeURIComponent(id)}/report`),
};
export type ReportFormat = "json" | "html";

export async function downloadReport(
  id: string,
  format: ReportFormat = "json",
) {
  const blob =
    format === "json"
      ? new Blob([JSON.stringify(await api.report(id), null, 2)], {
          type: "application/json",
        })
      : await request<Blob>(
          `/runs/${encodeURIComponent(id)}/report.html`,
          {},
          15000,
          "blob",
        );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reqtest-report-${id}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
