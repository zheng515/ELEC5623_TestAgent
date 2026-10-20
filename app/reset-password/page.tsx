import { ResetPassword } from "@/components/shell/reset-password";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return <ResetPassword token={query.token || ""} invalid={!!query.error} />;
}
