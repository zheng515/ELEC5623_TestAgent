import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { getAuth } from '@/lib/auth';
import { sameOrigin } from '@/lib/request';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin verification is not allowed.' }, { status: 403, headers });
  let token: string;
  try { ({ token } = z.object({ token: z.string().min(1).max(2048) }).strict().parse(await request.json())); }
  catch { return Response.json({ error: 'Open a valid verification link from your email.' }, { status: 400, headers }); }
  try {
    await (await getAuth()).api.verifyEmail({ query: { token }, headers: request.headers });
    return Response.json({ verified: true }, { headers });
  } catch (error) {
    if (error instanceof APIError) return Response.json({ error: 'This verification link is invalid or expired. Request a new link from the sign-in page.' }, { status: 400, headers });
    return Response.json({ error: 'Verification is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
