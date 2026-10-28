import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, database, session } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url), id = url.searchParams.get("run") || "", file = url.searchParams.get("file") || "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}\.jpg$/.test(file)) return Response.json({ error: "Screenshot not found." }, { status: 404 });
  const owned = await database.query("SELECT 1 FROM runs WHERE id=$1 AND user_id=$2", [id, account.user.id]);
  if (!owned.rowCount) return Response.json({ error: "Screenshot not found." }, { status: 404 });
  try {
    const bytes = await readFile(join(dataDir, "runs", id, "screenshots", file));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch { return Response.json({ error: "Screenshot not found." }, { status: 404 }); }
}
