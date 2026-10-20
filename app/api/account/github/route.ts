import { getAuth, session } from "@/lib/auth";
import { githubAccount, githubStatus } from "@/lib/github";
import { sameOrigin } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!await session(request)) return Response.json({ error: "Sign in required." }, { status: 401 });
  return Response.json(await githubStatus(request.headers), { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(request: Request) {
  if (!await session(request)) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin changes are not allowed." }, { status: 403 });
  try {
    const account = await githubAccount(request.headers);
    if (account) await (await getAuth()).api.unlinkAccount({ headers: request.headers, body: { accountId: account.id } });
    return Response.json({ disconnected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Cannot disconnect GitHub. Sign in again and retry." }, { status: 400 }); }
}
