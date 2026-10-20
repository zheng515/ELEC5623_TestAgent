import type { AgentPreset } from "./types";

export const AGENT_PRESETS: AgentPreset[] = [{
  id: "http-functional",
  name: "HTTP functional test",
  description: "Check real API outputs against explicit requirements.",
  defaultModel: "gpt-6-luna",
  defaultPrompt: [
    "GET /shipping accepts query amount in integer cents. For amount >= 10000 it returns HTTP 200 and JSON fee = 0 cents.",
    "GET /shipping accepts query amount in integer cents. For 0 <= amount < 10000 it returns HTTP 200 and JSON fee = 1000 cents.",
  ].join("\n"),
}];
