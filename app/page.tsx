"use client";

import { useEffect, useState } from "react";
import { Account } from "@/components/shell/account";
import { PythonWorkspace } from "@/components/shell/python-workspace";
import { EvaluationWorkspace } from "@/components/shell/evaluation-workspace";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/shell/topbar";

export default function DashboardPage() {
  return <Account>{(userId) => <Dashboard key={userId} userId={userId} />}</Account>;
}

function Dashboard({ userId }: { userId: string }) {
  const modelKey = `reqtest_model_v1:${userId}`;
  const [mode, setMode] = useState("python");
  const [evaluationRunId, setEvaluationRunId] = useState("");
  const [model, setModel] = useState("gpt-6-luna");
  const [configured, setConfigured] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/model").then((response) => {
      if (!response.ok) throw new Error("Unable to read server configuration.");
      return response.json();
    }).then((config) => {
      if (!active) return;
      setConfigured(config.configured === true);
      let saved: string | null = null;
      try { saved = localStorage.getItem(modelKey); } catch { /* Browser storage may be disabled. */ }
      if (saved) setModel(saved);
      else if (typeof config.model === "string") setModel(config.model);
    }).catch(() => { if (active) setMessage("Unable to read server configuration."); });
    return () => { active = false; };
  }, [modelKey]);

  function selectModel(value: string) {
    setModel(value);
    try { localStorage.setItem(modelKey, value); } catch { /* The choice still applies to this page. */ }
  }

  return (
    <div className="min-h-screen">
      <Topbar currentModel={model} onSelectModel={selectModel} isRunning={isRunning} configured={configured} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <nav className="flex flex-wrap gap-3"><Button variant={mode === "python" ? "default" : "outline"} disabled={isRunning} onClick={() => setMode("python")}>Project verification</Button><Button variant={mode === "evaluation" ? "default" : "outline"} disabled={isRunning} onClick={() => setMode("evaluation")}>Evaluation</Button></nav>
        {message && <p role="alert" className="text-base text-red-400">{message}</p>}
        {mode === "evaluation" ? <EvaluationWorkspace initialRunId={evaluationRunId} /> : <PythonWorkspace model={model} configured={configured} onRunningChange={setIsRunning} onOpenEvaluation={(runId) => { setEvaluationRunId(runId); setMode("evaluation"); }} />}
      </main>
    </div>
  );
}
