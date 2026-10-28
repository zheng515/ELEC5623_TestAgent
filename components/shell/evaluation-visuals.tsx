"use client";

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PythonReport } from '@/lib/python-types';
import type { verificationSummary } from '@/lib/run-evaluation';

type Evaluation = ReturnType<typeof verificationSummary>;
const testCategories = [
  { status: 'passed', label: 'Passed', color: 'var(--chart-passed)' },
  { status: 'failed', label: 'Failed', color: 'var(--chart-failed)' },
  { status: 'error', label: 'Errors', color: 'var(--chart-warning)' },
  { status: 'skipped', label: 'Skipped', color: 'var(--chart-muted)' },
] as const;
const stateColors: Record<string, string> = {
  Verified: 'var(--chart-passed)', 'Partially Verified': 'var(--chart-partial)',
  Uncertain: 'var(--chart-warning)', Unverified: 'var(--chart-muted)', Pending: 'var(--chart-pending)',
};

export function EvaluationVisuals({ report, evaluation, onRequirements, onTests }: {
  report: PythonReport; evaluation: Evaluation;
  onRequirements: (filter: string) => void; onTests: (status: string) => void;
}) {
  const { requirementChecks: checks } = evaluation;
  const total = report.rules.length, outcomes = evaluation.latest?.outcomes.length || 0;
  const checkedPercent = total ? Math.floor(checks.checked / total * 100) : null;
  const passedPercent = outcomes ? Math.floor(evaluation.passed / outcomes * 1000) / 10 : null;
  const checkedGroups = [
    { label: 'Checks passed', value: checks.passed, color: 'var(--chart-passed)', filter: 'Checks passed' },
    { label: 'Needs investigation', value: checks.investigate, color: 'var(--chart-warning)', filter: 'Needs investigation' },
    { label: 'Incomplete checks', value: checks.remaining, color: 'var(--chart-muted)', filter: 'Incomplete checks' },
  ];
  const testGroups = testCategories.map((category, index) => ({ ...category, value: evaluation.outcomes[index].value }));
  const verified = evaluation.distribution.find(item => item.name === 'Verified')?.value || 0;
  return <section aria-label="Evaluation charts" className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
    <Card aria-label="Requirement check chart" className="flex min-w-0 flex-col shadow-none md:col-span-2 lg:col-span-1">
      <CardHeader className="p-5 pb-3"><CardTitle role="heading" aria-level={3}>Requirement checks</CardTitle><p className="text-xs text-muted-foreground">{total} input items · {report.analysis?.behaviors.length || 0} mapped behaviors</p></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-3xl font-semibold tracking-tight tabular-nums">{checks.checked}<span className="text-lg font-normal text-muted-foreground"> / {total}</span></p><span className="text-xs text-muted-foreground">{checkedPercent === null ? 'No requirements' : `${checkedPercent}% checked`}</span></div>
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">{checkedGroups.filter(group => group.value > 0).map(group => <span key={group.label} style={{ width: `${group.value / Math.max(1, total) * 100}%`, backgroundColor: group.color }} />)}</div>
          <progress aria-label="Checked requirement items" value={checks.checked} max={Math.max(1, total)} className="sr-only" />
        </div>
        <ul className="space-y-1">{checkedGroups.map(group => <li key={group.label}><ChartCategory label={group.label} value={group.value} color={group.color} action={`Show requirements: ${group.label} (${group.value})`} onClick={() => onRequirements(group.filter)} /></li>)}</ul>
        <div className="mt-auto border-t border-border pt-3"><Button variant="link" className="h-auto max-w-full p-0 text-xs whitespace-normal text-left" aria-label="View requirements needing attention" onClick={() => onRequirements('Needs attention')}>{evaluation.needsAttention.length} {evaluation.needsAttention.length === 1 ? 'item needs' : 'items need'} attention<ArrowRight aria-hidden="true" className="size-3" /></Button><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Checked means executed, including failing checks.</p></div>
      </CardContent>
    </Card>
    <Card aria-label="Test outcome chart" className="flex min-w-0 flex-col shadow-none">
      <CardHeader className="p-5 pb-3"><CardTitle role="heading" aria-level={3}>Test outcomes</CardTitle><p className="text-xs text-muted-foreground">{outcomes} outcomes in the latest execution</p></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="my-auto grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-3">
          <div className="relative mx-auto aspect-square w-full max-w-40">
            <OutcomeRing groups={testGroups} total={outcomes} />
            <div className="pointer-events-none absolute inset-0 grid content-center justify-items-center gap-1 text-center"><span className="text-2xl font-semibold tracking-tight tabular-nums">{passedPercent === null ? '—' : `${passedPercent}%`}</span><span className="max-w-20 text-xs leading-tight text-muted-foreground">{passedPercent === null ? 'No execution' : 'Recorded pass rate'}</span></div>
          </div>
          <ul className="min-w-0 space-y-1">{testGroups.map(group => <li key={group.status}><ChartCategory label={group.label} value={group.value} color={group.color} action={`Show ${group.label.toLowerCase()} test outcomes (${group.value})`} onClick={() => onTests(group.status)} /></li>)}</ul>
        </div>
        <div className="mt-auto border-t border-border pt-3"><Button variant="link" className="h-auto p-0 text-xs" onClick={() => onTests('All')}>Inspect test results<ArrowRight aria-hidden="true" className="size-3" /></Button><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Errors and skips count in the total. This is not requirement coverage.{report.status !== 'completed' && ' Results are partial.'}</p></div>
      </CardContent>
    </Card>
    <Card aria-label="Verification state chart" className="flex min-w-0 flex-col shadow-none">
      <CardHeader className="p-5 pb-3"><CardTitle role="heading" aria-level={3}>Verification states</CardTitle><p className="text-xs text-muted-foreground">Assurance for the {total} input requirement items</p></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-3xl font-semibold tracking-tight tabular-nums">{verified}<span className="text-lg font-normal text-muted-foreground"> / {total}</span></p><span className="text-xs text-muted-foreground">Strictly Verified</span></div>
        <ul className="space-y-1">{evaluation.distribution.map(group => <li key={group.name}><button type="button" className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`Show ${group.name} requirements (${group.value})`} onClick={() => onRequirements(group.name)}><span className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span>{group.name}</span><span className="font-medium tabular-nums">{group.value}</span></span><span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${group.value / Math.max(1, total) * 100}%`, backgroundColor: stateColors[group.name] }} /></span></button></li>)}</ul>
        <p className="mt-auto border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">Passing cases can remain Partially Verified when coverage or mutation adequacy is unassessed.</p>
      </CardContent>
    </Card>
  </section>;
}

function ChartCategory({ label, value, color, action, onClick }: { label: string; value: number; color: string; action: string; onClick: () => void }) {
  return <button type="button" aria-label={action} onClick={onClick} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="min-w-0 flex-1">{label}</span><span className="font-medium tabular-nums">{value}</span></button>;
}

function OutcomeRing({ groups, total }: { groups: { label: string; value: number; color: string }[]; total: number }) {
  const circumference = 2 * Math.PI * 62;
  return <svg viewBox="0 0 160 160" className="h-full w-full" role="img" aria-label={total ? groups.map(group => `${group.value} ${group.label.toLowerCase()}`).join(', ') : 'No test execution recorded'}>
    <circle cx={80} cy={80} r={62} fill="none" stroke="var(--color-muted)" strokeWidth={13} />
    {groups.map((group, index) => group.value > 0 && <circle key={group.label} cx={80} cy={80} r={62} fill="none" stroke={group.color} strokeWidth={13} strokeDasharray={`${group.value / total * circumference} ${circumference}`} strokeDashoffset={-groups.slice(0, index).reduce((sum, item) => sum + item.value, 0) / total * circumference} transform="rotate(-90 80 80)"><title>{group.label}: {group.value} of {total}</title></circle>)}
  </svg>;
}
