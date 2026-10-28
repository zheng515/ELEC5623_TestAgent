"use client";
import { useEffect, useReducer, useState } from "react";
import type { RuntimeHealth } from "@/lib/runtime-health";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function useRuntimeHealth() {
  const [state, setState] = useState<{ health?: RuntimeHealth; error?: string }>({});
  const [revision, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    let active = true, pending = false;
    const controller = new AbortController();
    const read = () => {
      if (pending) return; pending = true;
      fetch("/api/system/health", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Your session has expired. Sign in again to check service status." : data.error || "Runtime status is unavailable.");
        return data as RuntimeHealth;
      }).then(health => { if (active) setState({ health }); }).catch(error => {
        if (active) setState({ error: error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "Cannot reach the server. Check your connection and PostgreSQL, then refresh status. Saved tasks are retained." });
      }).finally(() => { pending = false; });
    };
    read();
    const timer = setInterval(read, 10000);
    const visible = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [revision]);
  return { ...state, refresh };
}
export function RuntimeStatus({ health, error, refresh }: ReturnType<typeof useRuntimeHealth>) {
  const ready = health?.worker === "online" && health.queue === "available" && health.sandbox === "available" && health.modelConfigured;
  const title = error ? "Service status unavailable" : !health ? "Checking services…" : ready ? "Services ready" : health.sandbox === "unavailable" ? "Test environment unavailable" : health.queue === "unavailable" ? "Queue status unavailable" : !health.modelConfigured ? "Model key missing" : "Waiting for a worker";
  return <Card aria-label="Runtime status" className={ready ? "gap-0 border-0 bg-transparent py-0 shadow-none" : "gap-0 py-0"}><CardContent className={ready ? "space-y-3 p-0 text-sm" : "space-y-3 px-4 py-3 text-sm"}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <details className="min-w-0">
        <summary className="flex min-h-8 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-medium"><Badge variant={error || health && !ready ? "destructive" : "secondary"} role="status">{title}</Badge></h2>
          {health?.tasks && <span className="text-xs text-muted-foreground">{health.tasks.queued} queued · {health.tasks.active} active · {health.tasks.retrying} awaiting retry</span>}
          <span className="text-xs text-muted-foreground underline underline-offset-4">Details</span>
        </summary>
        {health && <div className="mt-3 space-y-3">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2"><div><dt className="inline">Database: </dt><dd className="inline">{health.database}</dd></div><div><dt className="inline">Queue: </dt><dd className="inline">{health.queue.replaceAll("_", " ")}</dd></div><div><dt className="inline">Verification worker: </dt><dd className="inline">{health.worker}</dd></div><div><dt className="inline">Default sandbox: </dt><dd className="inline">{health.sandbox}</dd></div><div><dt className="inline">Last worker heartbeat: </dt><dd className="inline">{health.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleString("en-AU") : "Not recorded"}</dd></div><div><dt className="inline">Checked: </dt><dd className="inline">{new Date(health.checkedAt).toLocaleString("en-AU")}</dd></div></dl>
          {health.tasks && health.worker === "online" && health.tasks.queued > 0 && <p>Queued tasks wait for an available worker slot.</p>}
          <p className="text-muted-foreground">Local setup: start PostgreSQL and Docker, build the sandbox image, then run <code>npm run production:start</code> or <code>npm run dev:all</code>. A heartbeat does not confirm model access or project readiness. Check those separately in Settings and project setup.</p>
        </div>}
      </details>
      <Button type="button" variant="outline" size="sm" onClick={refresh}>Refresh</Button>
    </div>
    {error && <p role="alert">{error}</p>}
    {health && <>
      {health.worker !== "online" && health.queue !== "unavailable" && <p>No active verification worker is registered. Tasks remain saved in the queue and wait for a worker. Active tasks may need recovery before retrying.</p>}
      {health.queue === "unavailable" && <p>Queue state could not be read. New submissions are paused; existing tasks and evidence are retained. Ask the administrator to check PostgreSQL and restart the services.</p>}
      {health.sandbox === "unavailable" && <p>Docker or the default sandbox image is unavailable. New submissions are paused until the test environment is restored.</p>}
      {!health.modelConfigured && <p>Configure the model API key on the server, then restart the website and worker.</p>}
    </>}
  </CardContent></Card>;
}
