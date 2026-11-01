"use client";

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-5 px-6 text-center">
    <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">ReqTest</p>
    <h1 className="text-3xl font-semibold">This page could not be displayed</h1>
    <p className="text-sm leading-relaxed text-muted-foreground">Your saved verification runs remain on the server. Retry the page; if the problem continues, check service health and logs.</p>
    <div><Button onClick={reset}>Try again</Button></div>
  </main>;
}
