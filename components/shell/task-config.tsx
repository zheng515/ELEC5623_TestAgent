"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { VerificationInput } from "@/lib/verification";
import type { TaskDraft } from "@/lib/types";

export function TaskConfig({ value, onChange, disabled, canRun, isRunning, onRun }: {
  value: TaskDraft; onChange: (value: TaskDraft) => void; disabled: boolean; canRun: boolean; isRunning: boolean;
  onRun: (input: Omit<VerificationInput, "model">) => Promise<void>;
}) {
  const [headersText, setHeadersText] = useState("{}");
  const [error, setError] = useState("");
  function change(values: Partial<TaskDraft>) { setError(""); onChange({ ...value, ...values }); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !canRun) return;
    setError("");
    try {
      const headers = JSON.parse(headersText);
      if (!headers || Array.isArray(headers) || typeof headers !== "object" || Object.values(headers).some((item) => typeof item !== "string"))
        throw new Error("Headers must be a JSON object of string values.");
      if (value.prompt.split(/\r?\n/).filter((line) => line.trim()).length > 12) throw new Error("Use at most 12 requirements, one per line.");
      await onRun({ ...value, headers });
    } catch (error) { setError(error instanceof Error ? error.message : "Invalid task."); }
  }
  return (
    <form onSubmit={submit} aria-label="HTTP test configuration" className="space-y-6">
      <div className="grid gap-5 md:grid-cols-[1fr_8rem_2fr]">
        <div className="space-y-2">
          <label htmlFor="run-title" className="text-sm font-bold">Run name</label>
          <Input id="run-title" value={value.title} onChange={(event) => change({ title: event.target.value })} required maxLength={120} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <label htmlFor="http-method" className="text-sm font-bold">Method</label>
          <NativeSelect id="http-method" value={value.method} onChange={(event) => change({ method: event.target.value as TaskDraft["method"] })} disabled={disabled} className="w-32">
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <NativeSelectOption key={method}>{method}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <label htmlFor="endpoint" className="text-sm font-bold">API endpoint</label>
          <Input id="endpoint" type="url" value={value.endpoint} onChange={(event) => change({ endpoint: event.target.value })} placeholder="http://127.0.0.1:4100/shipping" required disabled={disabled} />
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="requirements" className="text-sm font-bold">Requirements — one per line</label>
        <Textarea id="requirements" rows={5} value={value.prompt} onChange={(event) => change({ prompt: event.target.value })} maxLength={8000} required disabled={disabled} className="min-h-36 max-h-80" />
        <p className="text-sm text-muted-foreground">Up to 12 requirements and 16 cases. Include parameter names, units and exact expected values.</p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold">Request headers (optional)</summary>
        <Textarea aria-label="Request headers" rows={3} value={headersText} onChange={(event) => setHeadersText(event.target.value)} disabled={disabled} className="mt-3 font-mono" />
        <p className="mt-2 text-muted-foreground">Headers stay in memory and are excluded from saved drafts, history and exports.</p>
      </details>
      {value.method !== "GET" && <p className="text-sm text-muted-foreground">Write requests can change target data. Use an API you are authorized to test.</p>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <Button type="submit" size="lg" disabled={disabled || !canRun || !value.title.trim() || !value.prompt.trim() || !value.endpoint.trim()}>
        {isRunning ? "Running checks…" : "Run HTTP tests"}<ArrowRight />
      </Button>
    </form>
  );
}
