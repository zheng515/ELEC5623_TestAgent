"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { ArrowRight, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Account } from "./account";

export function HomeAuth() {
  const { data, isPending } = authClient.useSession();
  const [mode, setMode] = useState<'signin' | 'register' | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (data?.user.id && mode) router.replace('/workspace');
  }, [data?.user.id, mode, router]);

  if (data) return <div className="flex min-w-0 flex-wrap items-center gap-2"><Button asChild variant="ghost" className="min-w-0 max-w-48"><Link href="/account" aria-label={`Account settings for ${data.user.name}`} title={`Hi, ${data.user.name}`}><span className="truncate">Hi, {data.user.name}</span></Link></Button><Button asChild><Link href="/workspace">Open workspace<ArrowRight aria-hidden="true" /></Link></Button></div>;

  return <Dialog.Root open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }}>
    <div className="flex items-center gap-2"><Button variant="ghost" disabled={isPending} onClick={event => { opener.current = event.currentTarget; setMode('signin'); }}>Sign in</Button><Button disabled={isPending} onClick={event => { opener.current = event.currentTarget; setMode('register'); }}>Create account</Button></div>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
      <Dialog.Content onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-6 pt-12 text-foreground shadow-2xl sm:p-8 sm:pt-12">
        <Dialog.Title className="sr-only">Your ReqTest account</Dialog.Title>
        <Dialog.Description className="sr-only">Sign in or create an account to continue to the verification workspace.</Dialog.Description>
        <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close account dialog" className="absolute right-3 top-3"><X aria-hidden="true" /></Button></Dialog.Close>
        {mode && <Account key={mode} initialRegister={mode === 'register'} embedded />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
