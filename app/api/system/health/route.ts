import { session } from "@/lib/auth";
import { runtimeHealth } from "@/lib/runtime-health";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await session(request);
    if (!account) return Response.json({ error: "Sign in required." }, { status: 401, headers });
    return Response.json(await runtimeHealth(account.user.id), { headers });
  } catch {
    return Response.json({ error: "Cannot read account storage or runtime status. Check PostgreSQL and restart the services if needed." }, { status: 503, headers });
  }
}
