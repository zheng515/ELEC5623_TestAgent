import type { Metadata } from 'next';
import { VerifyEmail } from '@/components/shell/verify-email';

export const metadata: Metadata = { title: 'Verify your email · ReqTest', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function VerifyEmailPage() { return <VerifyEmail />; }
