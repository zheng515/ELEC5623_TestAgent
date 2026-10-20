import nodemailer from "nodemailer";
export const mailConfigured = () => process.env.REQTEST_LOCAL_MAIL === "true" || Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
export async function sendAccountMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) throw new Error("Email delivery is not configured.");
  const local = process.env.REQTEST_LOCAL_MAIL === "true";
  const transport = nodemailer.createTransport({
    host: local ? "127.0.0.1" : process.env.SMTP_HOST,
    port: local ? 1025 : Number(process.env.SMTP_PORT || 587),
    secure: !local && process.env.SMTP_SECURE === "true",
    auth: !local && process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
  });
  try {
    await transport.sendMail({ from: local ? "ReqTest <noreply@reqtest.test>" : process.env.SMTP_FROM, to, subject, text, disableFileAccess: true, disableUrlAccess: true });
  } catch { throw new Error("Email delivery failed. Check the configured SMTP service."); }
  finally { transport.close(); }
}
