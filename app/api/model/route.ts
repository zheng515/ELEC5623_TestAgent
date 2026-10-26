import { session } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await session(request)) return Response.json({ error: "Sign in required." }, { status: 401 });
  return Response.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.REQTEST_LLM_MODEL || "gpt-6-luna",
  });
}
