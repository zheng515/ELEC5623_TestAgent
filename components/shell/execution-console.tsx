import { Progress } from "@/components/ui/progress";
import type { AgentStep } from "@/lib/types";

export function ExecutionConsole({ steps, isRunning, latencyMs, tokensUsed }: {
  steps: AgentStep[]; isRunning: boolean; latencyMs?: number; tokensUsed?: number;
}) {
  const completed = steps.length ? steps.filter((step) => step.status === "completed").length / steps.length * 100 : 0;
  return (
    <section aria-label="Execution progress" aria-busy={isRunning} className="space-y-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-2xl font-bold">Execution progress</h3>
        <p className="text-sm text-muted-foreground">{latencyMs !== undefined && `${latencyMs}ms`}{tokensUsed !== undefined && ` · ${tokensUsed} tokens`}</p>
      </div>
      <Progress value={completed} aria-valuenow={completed} aria-label="Pipeline steps completed" />
      <ol className="grid gap-5 md:grid-cols-3">
        {steps.map((step, index) => <li key={step.id} className="space-y-1 border-b pb-4">
          <p className="text-sm text-muted-foreground">0{index + 1}</p>
          <strong>{step.title}</strong>
          <p className={`text-sm ${step.status === "error" ? "text-red-400" : "text-muted-foreground"}`}>{step.status}{step.durationMs !== undefined && ` · ${step.durationMs}ms`}</p>
        </li>)}
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold">Run log</summary>
        <ul className="mt-3 max-h-48 overflow-y-auto space-y-2 text-muted-foreground">
          {steps.flatMap((step) => step.logs).map((log, index) => <li key={index}>{log}</li>)}
        </ul>
      </details>
    </section>
  );
}
