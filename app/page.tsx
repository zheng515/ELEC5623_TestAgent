"use client";

import { useEffect, useRef, useState } from "react";
import { Account } from "@/components/shell/account";
import { PythonWorkspace } from "@/components/shell/python-workspace";
import { EvaluationWorkspace } from "@/components/shell/evaluation-workspace";
import { get, set } from "idb-keyval";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { Button } from "@/components/ui/button";
import { Square, Pencil } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { RunHistory } from "@/components/shell/history";
import { TaskConfig } from "@/components/shell/task-config";
import { ExecutionConsole } from "@/components/shell/execution-console";
import { ArtifactViewer } from "@/components/shell/artifact-viewer";
import { AGENT_PRESETS } from "@/lib/presets";
import type { AgentRun, AgentStep, AgentArtifact, AgentPreset, TaskDraft } from "@/lib/types";
import type { VerificationInput, VerificationReport } from "@/lib/verification";



const initialSteps: AgentStep[] = [
  { id: "step-1", title: "Generate test cases", status: "pending", logs: [] },
  { id: "step-2", title: "Review expected values", status: "pending", logs: [] },
  { id: "step-3", title: "Execute HTTP checks", status: "pending", logs: [] },
];

export default function DashboardPage() {
  return <Account>{(userId) => <Dashboard key={userId} userId={userId} />}</Account>;
}

function Dashboard({ userId }: { userId: string }) {
  const storageKey = `reqtest_http_runs_v1:${userId}`;
  const draftKey = `reqtest_http_draft_v1:${userId}`;
  const [mode, setMode] = useState("python");
  const [evaluationRunId, setEvaluationRunId] = useState("");
  const [model, setModel] = useState("gpt-6-luna");
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selected, setSelected] = useState<AgentRun>();
  const [draft, setDraft] = useState<TaskDraft>({ title: "HTTP functional test", prompt: AGENT_PRESETS[0].defaultPrompt, endpoint: "", method: "GET" });
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [output, setOutput] = useState<AgentArtifact[]>([]);
  const [report, setReport] = useState<VerificationReport>();
  const [message, setMessage] = useState("");
  const execution = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch("/api/agent/stream").then((response) => {
        if (!response.ok) throw new Error("Unable to read server configuration.");
        return response.json();
      }),
      get<AgentRun[]>(storageKey),
      get<TaskDraft & { model: string }>(draftKey),
    ]).then(([config, history, savedDraft]) => {
      if (!active) return;
      if (config.status === "fulfilled") {
        setConfigured(config.value.configured === true);
        if (typeof config.value.model === "string") setModel(config.value.model);
      } else setMessage("Unable to read server configuration.");
      if (history.status === "fulfilled" && Array.isArray(history.value)) {
        const restored = history.value.filter((run) => run.report?.version === 1 || ["failed", "cancelled", "running"].includes(run.status));
        const interrupted = restored.some((run) => run.status === "running");
        for (const run of restored) if (run.status === "running") {
          run.status = "cancelled";
          run.summary = "Run interrupted by leaving or refreshing the page; no completed report.";
          run.steps = run.steps.map((step) => step.status === "running" ? { ...step, status: "cancelled" } : step);
        }
        setRuns(restored);
        if (interrupted) set(storageKey, restored).catch(() => setMessage("Interrupted history could not be saved."));
      } else if (history.status === "rejected") setMessage("Saved browser history could not be read.");
      if (savedDraft.status === "fulfilled" && savedDraft.value) {
        const { model: savedModel, ...input } = savedDraft.value;
        setDraft(input);
        setModel(savedModel);
      }
      setReady(true);
    });
    try { localStorage.removeItem("apex_agent_key"); } catch { /* Legacy storage may be disabled. */ }
    return () => { active = false; execution.current?.abort(); };
  }, [storageKey, draftKey]);

  useEffect(() => {
    if (ready) set(draftKey, { ...draft, model }).catch(() => setMessage("Draft could not be saved in this browser."));
  }, [draft, model, ready, draftKey]);

  function selectRun(run?: AgentRun) {
    if (isRunning) return;
    setSelected(run);
    setEditing(false);
    setSteps(run?.steps || []);
    setOutput(run?.artifacts || []);
    setReport(run?.report);
    setMessage(run?.summary || "");
    setFormKey((key) => key + 1);
    if (run) {
      setDraft({ title: run.title, prompt: run.prompt, endpoint: run.endpoint, method: run.method });
      setModel(run.model);
    }
  }
  function selectPreset(preset: AgentPreset) {
    if (isRunning) return;
    selectRun();
    setDraft({ title: preset.name, prompt: preset.defaultPrompt, endpoint: "http://127.0.0.1:4100/shipping", method: "GET" });
  }

  async function removeRuns(id?: string) {
    if (isRunning || historyBusy) return false;
    setHistoryBusy(true);
    try {
      const next = id ? runs.filter((run) => run.id !== id) : [];
      await set(storageKey, next);
      setRuns(next);
      if (!id || selected?.id === id) selectRun();
      return true;
    } catch {
      setMessage("History could not be deleted. Your records have been kept.");
      return false;
    } finally { setHistoryBusy(false); }
  }

  async function execute(input: Omit<VerificationInput, "model">) {
    if (execution.current || isRunning || !ready || !configured) return;
    const controller = new AbortController();
    execution.current = controller;
    setIsRunning(true);
    setEditing(false);
    setReport(undefined);
    setOutput([]);
    setSteps(initialSteps);
    setMessage("");
    const saved: AgentRun = {
      id: crypto.randomUUID(), title: input.title, prompt: input.prompt, endpoint: input.endpoint, method: input.method,
      model, status: "running", createdAt: new Date().toISOString(),
      steps: initialSteps.map((step) => ({ ...step })), artifacts: [],
    };
    setSelected(saved);
    let storageWarning = "";
    async function remember() {
      const next = [{ ...saved }, ...runs].slice(0, 30);
      setRuns(next);
      try { await set(storageKey, next); }
      catch { storageWarning = " Browser history could not be saved; download the report to retain it."; }
    }
    try {
      await remember();
      const response = await fetch("/api/agent/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, model }), signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "HTTP " + response.status);
      }
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
        throw new Error("The server did not return an execution stream.");
      const reader = response.body.pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream()).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const data = JSON.parse(value.data);
          if (value.event === "error") throw new Error(data.message || "Execution failed.");
          if (value.event === "step") {
            saved.steps = saved.steps.map((step) => step.id === data.id ? { ...step, ...data } : step);
            setSteps([...saved.steps]);
          } else if (value.event === "artifact") {
            saved.artifacts.push(data);
            setOutput([...saved.artifacts]);
          } else if (value.event === "complete") {
            const result: VerificationReport = data.report;
            if (result?.version !== 1 || !Array.isArray(result.results) || !["passed", "failed", "inconclusive"].includes(result.conclusion))
              throw new Error("Invalid completion report.");
            saved.report = result;
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!saved.report) throw new Error("Stream ended without a completion report.");
      saved.status = "completed";
      saved.summary = saved.report.summary;
      saved.latencyMs = saved.report.elapsedMs;
      saved.tokensUsed = saved.report.tokensUsed;
      setReport(saved.report);
      setMessage(saved.summary);
    } catch (error) {
      saved.status = controller.signal.aborted ? "cancelled" : "failed";
      saved.report = undefined;
      saved.artifacts = [];
      saved.summary = controller.signal.aborted ? "Run stopped; no completed report." :
        error instanceof Error ? error.message : "Execution failed.";
      saved.steps = saved.steps.map((step, index) => step.status === "running" || (index === 0 && saved.steps.every((item) => item.status === "pending")) ?
        { ...step, status: controller.signal.aborted ? "cancelled" : "error", logs: [saved.summary!] } : step);
      setSteps([...saved.steps]);
      setOutput([]);
      setMessage(saved.summary);
    } finally {
      setSelected({ ...saved });
      await remember();
      if (storageWarning) setMessage((text) => text + storageWarning);
      execution.current = null;
      setIsRunning(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Topbar currentModel={model} onSelectModel={setModel} isRunning={isRunning} configured={configured} />
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <nav className="flex gap-3"><Button variant={mode === "python" ? "default" : "outline"} disabled={isRunning} onClick={() => setMode("python")}>Project verification</Button><Button variant={mode === "http" ? "default" : "outline"} disabled={isRunning} onClick={() => setMode("http")}>HTTP checks</Button><Button variant={mode === "evaluation" ? "default" : "outline"} disabled={isRunning} onClick={() => setMode("evaluation")}>Evaluation</Button></nav>
        {mode === "evaluation" ? <EvaluationWorkspace initialRunId={evaluationRunId} /> : mode === "python" ? <PythonWorkspace model={model} configured={configured} onRunningChange={setIsRunning} onOpenEvaluation={(runId) => { setEvaluationRunId(runId); setMode("evaluation"); }} /> : <>
        <RunHistory runs={runs} selectedRunId={selected?.id || null} isRunning={isRunning || !ready} historyBusy={historyBusy}
          onSelectRun={(id) => selectRun(runs.find((run) => run.id === id))} onRemoveRuns={removeRuns}
          onNewTask={() => { selectRun(); if (!isRunning) setDraft({ title: "HTTP functional test", prompt: "", endpoint: "", method: "GET" }); }}
          onSelectPreset={selectPreset} />
        <header className="flex flex-wrap items-end justify-between gap-5 py-4">
          <div className="min-w-0 space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase">{selected?.title || "Verify your API"}</h1>
            <p className={selected ? "text-sm text-muted-foreground break-all" : "text-sm text-muted-foreground"}>{selected ? selected.method + " " + selected.endpoint : "Requirements → reviewed tests → real HTTP results"}</p>
          </div>
          {selected && (isRunning ? <Button variant="destructive" onClick={() => execution.current?.abort()}><Square />Stop</Button> :
            <Button variant="outline" onClick={() => setEditing(!editing)}><Pencil />{editing ? "Hide inputs" : "Edit & rerun"}</Button>)}
        </header>
          {!ready ? <p role="status" className="text-sm text-muted-foreground">Loading local configuration…</p> :
            !configured && <p role="status" className="text-sm text-amber-300">Configure OPENAI_API_KEY in the root .env or .env.local, then restart this app.</p>}
          <div hidden={Boolean(selected) && !editing}>
            <TaskConfig key={formKey} value={draft} onChange={setDraft} disabled={isRunning || !ready} canRun={configured && Boolean(model.trim())}
              isRunning={isRunning} onRun={execute} />
          </div>
          {message && message !== report?.summary && <p role={selected?.status === "failed" ? "alert" : "status"}
            className={selected?.status === "failed" ? "text-base text-red-400" : "text-base text-foreground"}>{message}</p>}
          <ArtifactViewer key={selected?.id || "draft"} artifacts={output} report={report} />
          {steps.length > 0 && (report ? <details className="space-y-5 border-t pt-6 text-sm text-muted-foreground">
            <summary className="cursor-pointer">Execution details</summary>
            <ExecutionConsole steps={steps} isRunning={false} latencyMs={selected?.latencyMs} tokensUsed={selected?.tokensUsed} />
          </details> : <ExecutionConsole steps={steps} isRunning={isRunning} />)}
          </>}
      </main>
    </div>
  );
}
