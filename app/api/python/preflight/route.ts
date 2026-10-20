import { sameOrigin } from "@/lib/request";
import { session } from "@/lib/auth";
import { prepareProject } from "@/lib/project-setup";
import { repositoryToken } from "@/lib/github";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin execution is not allowed." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length")) > 11_000_000) throw new Error("Project exceeds 10 MB.");
    const form = await request.formData();
    const token = form.get("repository") ? await repositoryToken(request, form) : "";
    return Response.json(await prepareProject(account.user.id, form, AbortSignal.any([request.signal, AbortSignal.timeout(300000)]), token));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Cannot check project setup." }, { status: 422 }); }
}
