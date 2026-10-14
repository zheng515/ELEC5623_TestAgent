"use client";

import { useState } from "react";
import { AlertDialog } from "radix-ui";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AGENT_PRESETS } from "@/lib/presets";
import type { AgentPreset, AgentRun } from "@/lib/types";

export function RunHistory({ runs, selectedRunId, onSelectRun, onNewTask, onSelectPreset, onRemoveRuns, isRunning, historyBusy }: {
  runs: AgentRun[]; selectedRunId: string | null; isRunning: boolean; historyBusy: boolean;
  onSelectRun: (id: string) => void; onNewTask: () => void; onSelectPreset: (preset: AgentPreset) => void;
  onRemoveRuns: (id?: string) => Promise<boolean>;
}) {
  const [pending, setPending] = useState<AgentRun | null>();
  const [error, setError] = useState(false);
  const disabled = isRunning || historyBusy;
  function confirm(run: AgentRun | null) { setError(false); setPending(run); }
  return (
    <nav aria-label="Verification runs" className="flex flex-wrap items-center gap-3 border-b pb-6">
      <Button variant="outline" disabled={disabled} onClick={onNewTask}><Plus />New Verification Run</Button>
      <Button variant="link" className="text-blue-300" disabled={disabled} onClick={() => onSelectPreset(AGENT_PRESETS[0])}>Use example</Button>
      <label htmlFor="run-history" className="text-sm md:ml-auto">History ({runs.length})</label>
      <NativeSelect id="run-history" aria-label="History" disabled={disabled || !runs.length} value={selectedRunId || ""}
        onChange={(event) => onSelectRun(event.target.value)} className="w-64">
        <NativeSelectOption value="" disabled>Choose a saved run</NativeSelectOption>
        {runs.map((run) => <NativeSelectOption key={run.id} value={run.id}>
          {run.title} · {run.status === "completed" ? run.report?.conclusion : run.status} · {new Date(run.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </NativeSelectOption>)}
      </NativeSelect>
      {selectedRunId && <Button variant="ghost" size="icon" disabled={disabled} aria-label="Delete selected run"
        onClick={() => { const run = runs.find((item) => item.id === selectedRunId); if (run) confirm(run); }}><Trash2 /></Button>}
      {runs.length > 0 && <Button variant="ghost" disabled={disabled} onClick={() => confirm(null)}>Clear all</Button>}
      <AlertDialog.Root open={pending !== undefined} onOpenChange={(open) => { if (!open && !historyBusy) setPending(undefined); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-3rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-5 border bg-background p-7 shadow-lg">
            <AlertDialog.Title className="text-2xl font-bold">{pending ? "Delete this run?" : "Clear all history?"}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">{pending?.title || "All saved runs"} will be removed from this browser. Download results you want to keep first.</AlertDialog.Description>
            {error && <p role="alert" className="text-sm text-red-400">Could not delete history. Your records have been kept.</p>}
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild><Button variant="outline" disabled={historyBusy}>Cancel</Button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><Button variant="destructive" disabled={historyBusy} onClick={async (event) => {
                event.preventDefault();
                if (await onRemoveRuns(pending?.id)) setPending(undefined); else setError(true);
              }}>{historyBusy ? "Deleting…" : pending ? "Delete run" : "Delete all"}</Button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </nav>
  );
}
