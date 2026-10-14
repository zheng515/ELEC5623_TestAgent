import { APICallError } from "ai";
import { generateCases, reviewCases } from "@/lib/model";
import { executeCases } from "@/lib/execute";
import { artifacts, emptyReport, summarize } from "@/lib/report";
import { requestSchema } from "@/lib/verification";

export const runtime = "nodejs";

export function GET() {
  return Response.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.REQTEST_LLM_MODEL || "gpt-5.6-luna",
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && (!URL.canParse(origin) ||
      new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)))
    return Response.json({ error: "Cross-origin execution is not allowed." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 422 });
  if (!process.env.OPENAI_API_KEY)
    return Response.json({ error: "Fill OPENAI_API_KEY in the root .env or .env.local, then restart." }, { status: 503 });
  const input = parsed.data;
  const rules = input.prompt.split(/\r?\n/).map((text) => text.trim()).filter(Boolean)
    .map((text, index) => ({ id: "R" + (index + 1), text }));
  if (rules.length > 12)
    return Response.json({ error: "Use at most 12 requirements, one per line." }, { status: 422 });
  const disconnected = new AbortController();
  const signal = AbortSignal.any([request.signal, disconnected.signal, AbortSignal.timeout(240000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const started = performance.now();
      let current = 0;
      const logs: string[] = [];
      const send = (event: string, data: unknown) => {
        if (disconnected.signal.aborted || request.signal.aborted) return;
        try { controller.enqueue(encoder.encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n")); }
        catch { disconnected.abort(); }
      };
      const titles = ["Generate test cases", "Review expected values", "Execute HTTP checks"];
      async function stage<T>(index: number, operation: () => Promise<T>): Promise<T> {
        current = index;
        const start = performance.now();
        send("step", { id: "step-" + index, title: titles[index - 1], status: "running", logs: [] });
        const value = await operation();
        send("step", { id: "step-" + index, title: titles[index - 1], status: "completed",
          durationMs: Math.round(performance.now() - start), logs: index === 3 ? [...logs] : ["Completed."] });
        return value;
      }
      try {
        const report = emptyReport(input);
        report.rules = rules;
        const planned = await stage(1, () => generateCases(input, rules, signal));
        report.cases = planned.cases;
        const audited = await stage(2, () => reviewCases(input, rules, planned.cases, signal));
        report.review = audited.review;
        report.results = await stage(3, () => executeCases(input, rules, planned.cases, audited.review, signal, (result) => {
          logs.push(result.caseId + " / " + result.ruleId + ": " + result.status + " — " + result.reason);
          send("step", { id: "step-3", title: titles[2], status: "running", logs: [...logs] });
        }));
        report.elapsedMs = Math.round(performance.now() - started);
        if (planned.tokens !== undefined && audited.tokens !== undefined)
          report.tokensUsed = planned.tokens + audited.tokens;
        summarize(report);
        for (const artifact of artifacts(report)) send("artifact", artifact);
        send("complete", { report });
      } catch (error) {
        const message = APICallError.isInstance(error) ?
          "Model request failed (HTTP " + (error.statusCode || "unknown") + "). Check credentials, model access or quota." :
          error instanceof Error ? error.message.replaceAll(process.env.OPENAI_API_KEY || "\0", "[redacted]") : "Verification interrupted.";
        send("step", { id: "step-" + current, title: titles[current - 1], status: "error", logs: [message] });
        send("error", { message });
      } finally {
        if (!disconnected.signal.aborted) controller.close();
      }
    },
    cancel() { disconnected.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}
