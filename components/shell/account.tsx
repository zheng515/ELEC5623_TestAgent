"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, passwordRules, passwordError } from "@/lib/password";
import { GitHubConnection } from "./github-connection";

export function Account({ children, settings = false }: { children?: (userId: string) => ReactNode; settings?: boolean }) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState('');
  const [help, setHelp] = useState<'reset' | 'verify' | null>(null);
  const [config, setConfig] = useState<{ emailEnabled: boolean; localMailbox: boolean; verificationRequired: boolean } | null>(null);
  const [configError, setConfigError] = useState(false);
  const forgot = help === 'reset', resend = help === 'verify';
  const emailEnabled = config?.emailEnabled === true, localMailbox = config?.localMailbox === true;
  useEffect(() => {
    fetch('/api/account/config').then(async response => {
      if (!response.ok) throw new Error('Account configuration unavailable.');
      const value = await response.json();
      setConfig({ emailEnabled: value.emailEnabled === true, localMailbox: value.localMailbox === true, verificationRequired: value.verificationRequired === true });
    }).catch(() => setConfigError(true));
  }, []);
  const invalidPassword = !!passwordError(password);
  async function signOut() {
    setBusy(true); setMessage(""); setSignOutError(""); setPassword(""); setEmail(''); setRegister(false); setHelp(null);
    try {
      const result = await authClient.signOut();
      if (result.error) setSignOutError(result.error.message || "Unable to sign out. Please try again.");
    } catch { setSignOutError("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function verifyEmail() {
    if (!data) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      const result = await authClient.sendVerificationEmail({ email: data.user.email, callbackURL: window.location.origin + "/account" });
      setMessageError(!!result.error);
      setMessage(result.error?.message || "Check your inbox and select Verify email in the confirmation page. Then refresh your account.");
    } catch { setMessageError(true); setMessage("Cannot send verification email."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setMessageError(false);
    const fields = new FormData(event.currentTarget);
    const values = { email: String(fields.get("email")), password: String(fields.get("password")) };
    const problem = register && passwordError(values.password);
    if (problem) { setMessageError(true); setMessage(problem); return; }
    setBusy(true);
    try {
      const result = resend ? await authClient.sendVerificationEmail({ email: values.email }) : forgot ? await authClient.requestPasswordReset({ email: values.email, redirectTo: window.location.origin + '/reset-password' }) : register ? await authClient.signUp.email({ ...values, name: String(fields.get("name")), callbackURL: window.location.origin }) : await authClient.signIn.email(values);
      if (result.error) { setMessageError(true); setMessage(result.error.message || "Authentication failed."); }
      else if (resend) setMessage("If this address has an unverified account, a confirmation link has been sent. Check your inbox and spam folder.");
      else if (forgot) setMessage("If this address has an account, a reset link has been sent. Check your inbox.");
      else { setPassword(""); if (register && emailEnabled) { setMessage("Account created. Check your inbox to verify your email. You can request another link here if needed."); setRegister(false); setHelp('verify'); } else setRegister(false); }
    } catch { setMessageError(true); setMessage("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  if (configError) return <main className="p-8 space-y-4"><p role="alert">Account settings are unavailable. Please reload the page.</p><Button onClick={() => window.location.reload()}>Reload</Button></main>;
  if (isPending || !config) return <p className="p-8" role="status">Loading your account…</p>;
  if (!data) return <main className="mx-auto max-w-md px-6 py-20 space-y-6">
    <h1 className="text-4xl font-bold">REQTEST.</h1><p>{resend ? "Resend verification email" : forgot ? "Reset your password" : register ? "Create your account" : "Sign in to your workspace"}</p>
    <form noValidate onSubmit={submit} className="space-y-4">
      {register && <label className="block space-y-2">Name<Input name="name" autoComplete="name" required maxLength={100} /></label>}
      <label className="block space-y-2">Email<Input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
      {!help && <label className="block space-y-2">Password<Input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={register ? PASSWORD_MIN_LENGTH : undefined} maxLength={PASSWORD_MAX_LENGTH} aria-describedby={register ? "password-rules" : undefined} aria-invalid={register && password.length > 0 && invalidPassword ? true : undefined} autoComplete={register ? "new-password" : "current-password"} required /></label>}
      {register && <ul id="password-rules" aria-label="Password requirements" aria-live="polite" className="space-y-1 text-sm">
        {passwordRules.map((rule) => {
          const met = rule.test(password);
          return <li key={rule.id} className={met ? "text-foreground" : "text-red-400"}><span aria-hidden="true">{met ? "✓" : "○"}</span> <span className="sr-only">{met ? "Met: " : "Not met: "}</span>{rule.label}</li>;
        })}
      </ul>}
      {(message || error) && <p role={messageError || error ? 'alert' : 'status'} className={messageError || error ? 'text-red-400' : 'text-muted-foreground'}>{message || error?.message}</p>}
      <Button disabled={busy || (register && invalidPassword) || !!help && !emailEnabled}>{busy ? "Please wait…" : resend ? "Send verification link" : forgot ? "Send reset link" : register ? "Create account" : "Sign in"}</Button>
    </form>
    <Button variant="link" onClick={() => { if (help) { setHelp(null); setRegister(false); } else setRegister(!register); setMessage(""); setPassword(""); }}>{help || register ? "Back to sign in" : "Create an account"}</Button>
    {!register && !help && <div className="flex flex-wrap"><Button variant="link" disabled={!emailEnabled} onClick={() => { setHelp('reset'); setPassword(''); setMessage(""); }}>Forgot password?</Button><Button variant="link" disabled={!emailEnabled} onClick={() => { setHelp('verify'); setPassword(''); setMessage(''); }}>Resend verification email</Button></div>}
    {register && config.verificationRequired && <p className="text-sm text-muted-foreground">Verify your email before signing in. A confirmation link will be sent after registration.</p>}
    {!emailEnabled && <p className="text-sm text-muted-foreground">Email delivery is disabled. Ask the administrator to configure SMTP for verification and recovery.</p>}
    {localMailbox && (help || register) && <p className="text-sm">Development emails stay on this machine. <a className="underline" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Open local mailbox</a></p>}
  </main>;
  return <div key={data.user.id}>
    <div className="flex justify-end gap-3 items-center border-b border-border bg-background px-4 py-1 text-xs text-muted-foreground sm:px-6 [&_button]:h-7 [&_button]:text-xs">
      <Link href="/account" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={"Account settings for " + data.user.name} aria-current={settings ? "page" : undefined}>{data.user.name}</Link>
      <Button variant="ghost" disabled={busy} onClick={signOut}>Sign out</Button>
    </div>
    {signOutError && <p role="alert" className="px-4 py-2 text-sm text-red-400 sm:px-6">{signOutError}</p>}
    {config.verificationRequired && !data.user.emailVerified ? <main className="max-w-md mx-auto px-6 py-12 space-y-5">
      <h1 className="text-3xl font-bold">Verify your email to continue</h1><p>A confirmation link will be sent to {data.user.email}. Open the link and select Verify email.</p>
      <Button disabled={!emailEnabled || busy} onClick={verifyEmail}>{busy ? 'Sending…' : 'Send verification link'}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { void refetch(); }}>I have verified my email</Button>
      {message && <p role="status">{message}</p>}
      {localMailbox && <a className="block underline" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Open local mailbox</a>}
    </main> : settings ? <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
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
