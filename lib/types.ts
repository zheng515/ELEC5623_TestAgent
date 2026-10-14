import type { VerificationInput, VerificationReport } from "./verification";

export type AgentModel = string;
export type TaskDraft = Pick<VerificationInput, "title" | "prompt" | "endpoint" | "method">;
export interface AgentStep {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  durationMs?: number;
  logs: string[];
}
export interface AgentArtifact {
  id: string;
  name: string;
  type: "code" | "markdown" | "json";
  content: string;
  language?: string;
  size?: string;
}
export interface AgentRun {
  id: string;
  title: string;
  prompt: string;
  endpoint: string;
  method: VerificationInput["method"];
  model: AgentModel;
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  steps: AgentStep[];
  artifacts: AgentArtifact[];
  summary?: string;
  tokensUsed?: number;
  latencyMs?: number;
  report?: VerificationReport;
}
export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  defaultModel: AgentModel;
  defaultPrompt: string;
}
