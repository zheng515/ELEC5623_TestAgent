"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, passwordRules, passwordError } from "@/lib/password";
import { GitHubConnection } from "./github-connection";

export function Account({ children, settings = false }: { children?: (userId: string) => ReactNode; settings?: boolean }) {
  const { data, isPending, error } = authClient.useSession();
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [localMailbox, setLocalMailbox] = useState(false);
  useEffect(() => { fetch('/api/account/config').then(response => response.json()).then(config => { setEmailEnabled(config.emailEnabled === true); setLocalMailbox(config.localMailbox === true); }).catch(() => {}); }, []);
  const invalidPassword = !!passwordError(password);
  async function verifyEmail() {
    if (!data) return;
    setBusy(true); setMessage("");
    try {
      const result = await authClient.sendVerificationEmail({ email: data.user.email, callbackURL: window.location.origin + "/account" });
      setMessage(result.error?.message || "Verification link sent. Check your inbox, then refresh after verification.");
    } catch { setMessage("Cannot send verification email."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const fields = new FormData(event.currentTarget);
    const values = { email: String(fields.get("email")), password: String(fields.get("password")) };
    const problem = register && passwordError(values.password);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    try {
      const result = forgot ? await authClient.requestPasswordReset({ email: values.email, redirectTo: window.location.origin + '/reset-password' }) : register ? await authClient.signUp.email({ ...values, name: String(fields.get("name")), callbackURL: window.location.origin }) : await authClient.signIn.email(values);
      if (result.error) setMessage(result.error.message || "Authentication failed.");
      else if (forgot) setMessage("If this address has an account, a reset link has been sent. Check your inbox.");
      else if (register) setMessage("Account created. Check your inbox to verify your email.");
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  if (isPending) return <p className="p-8" role="status">Loading your account…</p>;
  if (!data) return <main className="mx-auto max-w-md px-6 py-20 space-y-6">
    <h1 className="text-4xl font-bold">REQTEST.</h1><p>{forgot ? "Reset your password" : register ? "Create your account" : "Sign in to your workspace"}</p>
    <form noValidate onSubmit={submit} className="space-y-4">
      {register && <label className="block space-y-2">Name<Input name="name" autoComplete="name" required maxLength={100} /></label>}
      <label className="block space-y-2">Email<Input name="email" type="email" autoComplete="email" required /></label>
      {!forgot && <label className="block space-y-2">Password<Input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={register ? PASSWORD_MIN_LENGTH : undefined} maxLength={PASSWORD_MAX_LENGTH} aria-describedby={register ? "password-rules" : undefined} aria-invalid={register && password.length > 0 && invalidPassword ? true : undefined} autoComplete={register ? "new-password" : "current-password"} required /></label>}
      {register && <ul id="password-rules" aria-label="Password requirements" aria-live="polite" className="space-y-1 text-sm">
        {passwordRules.map((rule) => {
          const met = rule.test(password);
          return <li key={rule.id} className={met ? "text-foreground" : "text-red-400"}><span aria-hidden="true">{met ? "✓" : "○"}</span> <span className="sr-only">{met ? "Met: " : "Not met: "}</span>{rule.label}</li>;
        })}
      </ul>}
      {(message || error) && <p role="alert" className="text-red-400">{message || error?.message}</p>}
      <Button disabled={busy || (register && invalidPassword) || forgot && !emailEnabled}>{busy ? "Please wait…" : forgot ? "Send reset link" : register ? "Create account" : "Sign in"}</Button>
    </form>
    <Button variant="link" onClick={() => { if (forgot) { setForgot(false); setRegister(false); } else setRegister(!register); setMessage(""); setPassword(""); }}>{forgot || register ? "Back to sign in" : "Create an account"}</Button>
    {!register && !forgot && <Button variant="link" disabled={!emailEnabled} onClick={() => { setForgot(true); setMessage(""); }}>Forgot password?</Button>}
    {!emailEnabled && <p className="text-sm text-muted-foreground">Email delivery is disabled. Ask the administrator to configure SMTP for verification and recovery.</p>}
    {localMailbox && (forgot || register) && <p className="text-sm">Development emails stay on this machine. <a className="underline" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Open local mailbox</a></p>}
  </main>;
  return <div key={data.user.id}>
    <div className="flex justify-end gap-3 items-center border-b border-neutral-200 bg-white px-6 py-1 text-xs text-black [&_button]:h-7 [&_button]:text-xs [&_button]:hover:bg-neutral-100 [&_button]:hover:text-black">
      <Link href="/account" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={"Account settings for " + data.user.name} aria-current={settings ? "page" : undefined}>{data.user.name}</Link>
      <Button variant="ghost" onClick={async () => { await authClient.signOut(); }}>Sign out</Button>
    </div>
    {settings ? <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2"><Link href="/" className="text-sm underline">Back to workspace</Link><h1 className="text-3xl font-bold">Account</h1><p className="text-muted-foreground">Manage your sign-in, email verification and GitHub connection.</p></header>
      <section className="border rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <dl className="space-y-3"><div><dt className="text-sm text-muted-foreground">Name</dt><dd>{data.user.name}</dd></div><div><dt className="text-sm text-muted-foreground">Email</dt><dd>{data.user.email}</dd></div><div><dt className="text-sm text-muted-foreground">Email status</dt><dd>{data.user.emailVerified ? "Verified" : "Not verified"}</dd></div></dl>
        {!data.user.emailVerified && <><p className="text-sm text-muted-foreground">Verify your email address to confirm account ownership.</p><Button disabled={!emailEnabled || busy} onClick={verifyEmail}>{busy ? "Sending…" : "Verify email"}</Button></>}
        {!emailEnabled && <p className="text-sm text-muted-foreground">Email delivery is disabled. Ask the administrator to configure verification and recovery.</p>}
        {message && <p role="status">{message}</p>}
      </section>
      {localMailbox && <section className="border rounded-lg p-5 space-y-3"><h2 className="text-lg font-semibold">Development mailbox</h2><p className="text-sm text-muted-foreground">Verification and recovery emails are captured locally instead of being delivered to real recipients.</p><Button asChild variant="outline"><a href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Open local mailbox</a></Button></section>}
      <GitHubConnection />
    </main> : children?.(data.user.id)}
  </div>;
}
