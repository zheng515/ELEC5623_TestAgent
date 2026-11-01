import { ArrowRight, CircleAlert, FileCheck2, FlaskConical, GitBranch, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PythonReport } from '@/lib/python-types';
import { traceabilityRows } from '@/lib/run-evaluation';

const tones: Record<string, string> = {
  Verified: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  'Partially Verified': 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  Uncertain: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  Unverified: 'border-zinc-500/40 text-zinc-300',
  Pending: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
};

export function TraceabilityFlow({ report, onRequirement }: { report: PythonReport; onRequirement: (id: string) => void }) {
  const rows = traceabilityRows(report), complete = rows.filter(row => row.status === 'Verified').length;
  return <Card className="min-w-0 w-full max-w-[calc(100vw-2rem)] overflow-hidden shadow-none">
    <CardHeader className="gap-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle role="heading" aria-level={3}>Requirement evidence chain</CardTitle><p className="mt-2 text-xs text-muted-foreground">Follow every result from the original contract to mapped behavior, approved test and recorded execution.</p></div><Badge variant="outline">{complete} / {rows.length} strictly verified</Badge></div></CardHeader>
    <CardContent className="min-w-0 space-y-3">
      {rows.slice(0, 6).map(row => <button key={row.id} type="button" onClick={() => onRequirement(row.id)} className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-border p-4 text-left [overflow-wrap:anywhere] transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] sm:items-center">
        <span className="min-w-0 overflow-hidden"><span className="block font-medium">{row.label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{row.text}</span></span>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ChainValue icon={GitBranch} value={row.behaviors} label="behaviors" />
          <ArrowRight aria-hidden="true" className="size-3" />
          <ChainValue icon={FileCheck2} value={row.approvedTests} label="approved tests" />
          <ArrowRight aria-hidden="true" className="size-3" />
          <ChainValue icon={FlaskConical} value={row.outcomes} label="outcomes" />
          {row.blockedTests > 0 && <span className="text-amber-300">{row.blockedTests} blocked</span>}
        </span>
        <span className={'w-fit max-w-full rounded-full border px-2.5 py-1 text-xs whitespace-normal ' + (tones[row.status] || tones.Unverified)}>{row.status}</span>
      </button>)}
      {!rows.length && <p className="text-sm text-muted-foreground">No requirement evidence is available for this run.</p>}
      {rows.length > 6 && <p className="text-xs text-muted-foreground">Showing 6 of {rows.length} requirements. Open the full requirement view for the complete trace.</p>}
      <Button variant="link" className="h-auto p-0 text-xs" onClick={() => onRequirement('All')}>Review the complete trace<ArrowRight aria-hidden="true" className="size-3" /></Button>
    </CardContent>
  </Card>;
}

function ChainValue({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  const AlertIcon = value ? Icon : CircleAlert;
  return <span className="inline-flex items-center gap-1"><AlertIcon aria-hidden="true" className="size-3.5" />{value} {label}</span>;
}
