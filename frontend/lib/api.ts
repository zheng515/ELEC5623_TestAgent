import type {
  Project,
  ProjectCreate,
  SystemInfo,
  VerificationReport,
  VerificationRun,
} from "./types";

const base = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(
  /\/$/,
  "",
);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Unable to reach the API. Check that the backend is running and try again.",
    );
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : response.status === 422
          ? "Check the project name, requirements, and verification goal."
          : `Request failed (${response.status}). Please try again.`,
    );
  }
  return response.json() as Promise<T>;
}
export const api = {
  recentRuns: () => request<VerificationRun[]>("/runs?limit=5"),
  projects: () => request<Project[]>("/projects"),
  createProject: (payload: ProjectCreate) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runs: (id: string) =>
    request<VerificationRun[]>(`/projects/${encodeURIComponent(id)}/runs`),
  createRun: (id: string) =>
    request<VerificationRun>(`/projects/${encodeURIComponent(id)}/runs`, {
      method: "POST",
    }),
  system: () => request<SystemInfo>("/system"),
  report: (id: string) =>
    request<VerificationReport>(`/runs/${encodeURIComponent(id)}/report`),
};
export async function downloadReport(id: string) {
  const report = await api.report(id);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `reqtest-report-${id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadHtmlReport(id: string) {
  let response: Response;
  try {
    response = await fetch(`${base}/runs/${encodeURIComponent(id)}/report.html`, {
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Unable to reach the API. Check that the backend is running and try again.");
  }
  if (!response.ok) throw new Error(`Report download failed (${response.status}).`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `reqtest-report-${id}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
