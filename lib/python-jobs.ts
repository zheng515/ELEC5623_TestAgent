import { randomUUID } from "node:crypto";
import type { PythonReport } from "./python-types";
type Job = { id: string; controller: AbortController };
const shared = globalThis as typeof globalThis & { reqtestJobs?: { workerId: string; active: Map<string, Job> } };
export const jobs = shared.reqtestJobs ||= { workerId: randomUUID(), active: new Map() };
export function interruptedReport(report: PythonReport): PythonReport {
  return { ...report, status: "cancelled", stage: "Interrupted", error: "The server stopped before this run completed. Partial evidence is retained. Start a new run to verify again.", states: (report.states || []).map(state => ({ ...state, status: "Uncertain", reason: "Server interruption; no final verification claim." })) };
}
