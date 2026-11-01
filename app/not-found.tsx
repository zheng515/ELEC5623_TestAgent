import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <main className="mx-auto grid min-h-screen max-w-xl content-center gap-5 px-6 text-center">
    <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">404</p>
    <h1 className="text-3xl font-semibold">Page not found</h1>
    <p className="text-sm text-muted-foreground">The requested page does not exist or is no longer available.</p>
    <div><Button asChild><Link href="/">Return to workspace</Link></Button></div>
  </main>;
}
