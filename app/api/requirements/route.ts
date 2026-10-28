import { sameOrigin } from "@/lib/request";
import { session } from "@/lib/auth";
import { extractRequirements, originalRequirements, DocumentIntegrityError } from "@/lib/requirements";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin uploads are not allowed." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 11_000_000) throw new Error("Requirement upload exceeds 10 MB.");
    const file = (await request.formData()).get("document");
    if (!(file instanceof File)) throw new Error("Choose a requirement document.");
    return Response.json(await extractRequirements(account.user.id, file, request.signal));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Cannot extract this document." }, { status: 422 }); }
}
export async function GET(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const url = new URL(request.url), id = url.searchParams.get("id") || "";
    const { document, bytes } = await originalRequirements(account.user.id, id);
    const inline = document.format === 'pdf' && url.searchParams.get('view') === 'inline';
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": inline ? "application/pdf" : "application/octet-stream", "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(document.fileName), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(inline ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}) } });
  } catch (error) { return error instanceof DocumentIntegrityError ? Response.json({ error: error.message }, { status: 409 }) : Response.json({ error: "Requirement document not found." }, { status: 404 }); }
}
