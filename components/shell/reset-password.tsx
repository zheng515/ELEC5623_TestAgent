"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { passwordError, passwordRules, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ResetPassword({token, invalid}: {token: string; invalid: boolean}) {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [message, setMessage] = useState(invalid ? "This reset link is invalid or expired. Request a new one." : ""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) setMessage(result.error.message || "Cannot reset your password.");
      else { setDone(true); setPassword(""); setConfirmation(""); window.history.replaceState(null, "", "/reset-password"); setMessage("Password updated. Sign in again with your new password."); }
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="max-w-md mx-auto px-6 py-20 space-y-5"><h1 className="text-3xl font-bold">Reset your password</h1>{!done && <form noValidate onSubmit={submit} className="space-y-4"><label>New password<Input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required /></label><ul>{passwordRules.map(rule => <li key={rule.id} className={rule.test(password) ? "text-foreground" : "text-red-400"}>{rule.test(password) ? "✓" : "○"} {rule.label}</li>)}</ul><label>Confirm new password<Input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={PASSWORD_MAX_LENGTH} required /></label><Button disabled={busy || !token || !!passwordError(password) || password !== confirmation}>Update password</Button>{!token && <p>Open a valid link from your password reset email.</p>}</form>}{message && <p role="status">{message}</p>}<Link href="/" className="underline">Back to sign in</Link></main>;
}
