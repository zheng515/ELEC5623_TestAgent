import { mailConfigured, emailVerificationRequired } from "@/lib/mail";
export async function GET() {
  return Response.json({ emailEnabled: mailConfigured(), verificationRequired: emailVerificationRequired(), localMailbox: process.env.REQTEST_LOCAL_MAIL === "true" }, { headers: { "Cache-Control": "no-store" } });
}
