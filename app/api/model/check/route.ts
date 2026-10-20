import { APICallError, generateText, Output } from "ai";
import { z } from "zod";
import { session } from "@/lib/auth";
import { options } from "@/lib/model";
import { sameOrigin } from "@/lib/request";
export const runtime = "nodejs";
const recent = new Map<string, number>();
export async function POST(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  if (Date.now() - (recent.get(account.user.id) || 0) < 30000) return Response.json({ error: "Wait 30 seconds before checking again." }, { status: 429 });
  const input = z.object({ model: z.string().trim().min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Choose a model first." }, { status: 422 });
  recent.set(account.user.id, Date.now());
  if (recent.size > 1000) for (const [id, time] of recent) if (Date.now() - time > 60000) recent.delete(id);
  try {
    const result = await generateText({ ...options(input.data, request.signal), prompt: "Return ok as true.", maxOutputTokens: 256, providerOptions: { openai: { store: false, reasoningEffort: "low" } }, output: Output.object({ schema: z.object({ ok: z.boolean() }) }) });
    if (!result.output.ok) throw new Error("Unexpected response.");
    return Response.json({ connected: true, model: input.data.model });
  } catch (error) {
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    const message = status === 401 ? "OpenAI rejected the API key. Update OPENAI_API_KEY in .env.local and restart." : status === 403 || status === 404 ? "This key cannot access the selected model. Check model access and its exact name." : status === 429 ? "Model quota or rate limit reached. Check the API account." : "Cannot complete a model request. Check credentials, model access, network and quota.";
    return Response.json({ connected: false, error: message }, { status: 502 });
  }
}
