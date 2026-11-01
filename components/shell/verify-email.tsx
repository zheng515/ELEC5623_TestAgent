'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function VerifyEmail() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
    window.history.replaceState(null, '', window.location.pathname);
    setReady(true);
  }, []);
  async function confirm() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Cannot verify this email address.');
      setVerified(true); setToken('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot reach the server. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-md space-y-5 px-6 py-20">
    <h1 className="text-3xl font-bold">{verified ? 'Email verified' : 'Verify your email'}</h1>
    <p>{verified ? 'Your email address is confirmed. You can now sign in.' : 'Select Verify email to confirm ownership. Opening this page alone does not verify your address.'}</p>
    {!verified && <Button disabled={!ready || !token || busy} onClick={confirm}>{busy ? 'Verifying…' : 'Verify email'}</Button>}
    {ready && !token && !verified && <p role="status">Open the link in your verification email. If it expired, request a new link from the sign-in page.</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <Button asChild variant={verified ? 'default' : 'link'}><Link href="/" prefetch={false}>{verified ? 'Continue to sign in' : 'Back to sign in'}</Link></Button>
  </main>;
}
