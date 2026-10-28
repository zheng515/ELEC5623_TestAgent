import { ArrowRight, CircleAlert, Files, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PythonReport } from '@/lib/python-types';
import { findingEvidence, diagnosisLabels } from '@/lib/finding-evidence';
import { verificationSummary } from '@/lib/run-evaluation';
import { requestUsage, usageNotice } from '@/lib/verification-policy';
import { AgentProgress } from './agent-progress';
import { EvaluationVisuals } from './evaluation-visuals';

type Navigate = (panel: string, id?: string) => void;
export function ResultOverview({ report, onNavigate, onFinding, onRequirements, onTests }: { report: PythonReport; onNavigate: Navigate; onFinding: (node: string) => void; onRequirements: (filter: string) => void; onTests: (status: string) => void }) {
  const evaluation = verificationSummary(report), finding = findingEvidence(report)[0];
  const usage = requestUsage(report), notice = usageNotice(report);
  const initialIssue = report.collection && (report.collection.timedOut || ![0, 5].includes(report.collection.exitCode)) || report.baseline && (report.baseline.timedOut || report.baseline.integrity !== true || ![0, 5].includes(report.baseline.exitCode) || report.baseline.outcomes.some(outcome => ['failed', 'error'].includes(outcome.status)));
  const partial = report.status !== 'completed' || report.resources?.exhausted || evaluation.latest && (evaluation.latest.timedOut || evaluation.latest.integrity !== true || ![0, 1].includes(evaluation.latest.exitCode));
  const inspect = () => finding ? onFinding(finding.outcome.node) : onRequirements('Needs attention');
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="min-w-0 max-w-2xl space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Run summary</span><Badge variant={report.status === 'failed' ? 'destructive' : 'outline'}>{report.status}</Badge></div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{!partial && finding && evaluation.needsAttention.length ? `${evaluation.needsAttention.length} ${evaluation.needsAttention.length === 1 ? 'requirement needs' : 'requirements need'} attention` : evaluation.title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{finding ? 'Trace the failing check to its requirement and inspect the saved Agent assessment before deciding what to change.' : evaluation.next}</p></div>
      <Button className="h-11 w-full sm:w-auto" onClick={finding || evaluation.needsAttention.length ? inspect : () => onNavigate('evidence', 'execution-records')}>{finding ? 'Inspect finding' : evaluation.needsAttention.length ? 'Review requirements' : 'View execution evidence'}<ArrowRight aria-hidden="true" /></Button>
    </div>
    {report.error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-300">{report.error}</p>}
    {partial && <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">{report.status === 'running' ? `Verification in progress: ${report.stage}. Saved results remain provisional.` : 'This run or its execution evidence is incomplete. Retained outcomes do not establish a verified result.'}</p>}
    {initialIssue && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 p-4 text-sm"><span>Initial collection or existing-test checks need attention.</span><Button variant="link" onClick={() => onNavigate('evidence', 'execution-records')}>Inspect execution records</Button></div>}
    {notice && <p role="status" className="rounded-lg border border-amber-400/30 p-4 text-sm text-amber-200">{notice}</p>}
    <EvaluationVisuals report={report} evaluation={evaluation} onRequirements={onRequirements} onTests={onTests} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
      <Card className="overflow-hidden shadow-none">
        <CardHeader><div className="mb-2 flex flex-wrap items-center gap-2"><CircleAlert aria-hidden="true" className="size-4 text-primary" /><span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{finding ? 'Priority finding' : 'Next action'}</span></div>{finding && <Badge variant="outline" className="mb-2 w-fit max-w-full border-amber-400/30 bg-amber-400/5 text-amber-200 whitespace-normal">{finding.diagnosis ? diagnosisLabels[finding.diagnosis.category] + ' · Agent assessment' : 'Execution needs investigation'}</Badge>}<CardTitle role="heading" aria-level={3} className="text-xl leading-snug">{finding ? finding.behavior ? `${finding.behavior.category[0].toUpperCase() + finding.behavior.category.slice(1)} check needs investigation` : finding.test?.purpose || finding.outcome.name : evaluation.needsAttention.length ? 'Review the remaining requirement evidence' : evaluation.blocked ? 'Inspect blocked test proposals' : 'Review the recorded verification scope'}</CardTitle>{finding && <p className="break-all text-xs text-muted-foreground">{finding.rule ? (finding.rule.originalId || finding.rule.id) + ' · ' : ''}{finding.outcome.file}</p>}</CardHeader>
        <CardContent className="space-y-5">
          {finding ? <><p className="text-sm leading-relaxed text-muted-foreground">{finding.diagnosis?.reason || 'No unique current-phase diagnosis is available. Compare the failure with the original requirement before assigning a cause.'}</p><details className="rounded-lg bg-background/70 p-4"><summary className="cursor-pointer text-xs text-muted-foreground">Recorded failure excerpt</summary><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{finding.outcome.message ? finding.outcome.message.slice(-900) : 'No diagnostic message recorded.'}</pre></details><Button variant="outline" onClick={inspect}>Trace this finding<ArrowRight aria-hidden="true" /></Button></> : <><p className="text-sm leading-relaxed text-muted-foreground">{evaluation.next}</p><Button variant="outline" onClick={() => evaluation.needsAttention.length ? onRequirements('Needs attention') : onNavigate('findings', evaluation.blocked ? 'blocked-tests' : undefined)}>Review findings<ArrowRight aria-hidden="true" /></Button></>}
          {!!evaluation.preserved.length && <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{evaluation.preserved.length} failing {evaluation.preserved.length === 1 ? 'assertion was' : 'assertions were'} retained unchanged after an Agent diagnosis of a potential implementation defect.</p>}
        </CardContent>
      </Card>
      <Card className="shadow-none"><CardHeader><CardTitle role="heading" aria-level={3}>Verification scope</CardTitle><p className="text-xs text-muted-foreground">Recorded cases, under this run&apos;s policy.</p></CardHeader><CardContent className="space-y-5">
        <dl className="divide-y divide-border text-sm"><ScopeRow label="Mutation assessment" value={evaluation.mutationAssessment} /><ScopeRow label="Model requests" value={report.resources ? `${usage.used} / ${report.resources.limit ?? 'no limit'}` : 'Not recorded'} /><ScopeRow label="Approved test files" value={String(evaluation.approved)} /><ScopeRow label="Blocked / unreviewed" value={String(evaluation.blocked)} /></dl>
        {evaluation.checksPassedAwaitingAssurance.length > 0 && <p className="text-xs leading-relaxed text-muted-foreground">{evaluation.checksPassedAwaitingAssurance.length} items passed recorded checks with limited assurance. Mutation assessment and coverage gates remain separate.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-2"><Button variant="link" className="h-auto p-0 text-xs" onClick={() => onRequirements('All')}><ListChecks aria-hidden="true" />Review scope</Button><Button variant="link" className="h-auto p-0 text-xs" onClick={() => onNavigate('evidence')}><Files aria-hidden="true" />Run provenance</Button></div>
      </CardContent></Card>
    </div>
    <details className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-medium">Agent workflow and resource details</summary><div className="mt-5 space-y-4"><AgentProgress report={report} /><p className="text-xs text-muted-foreground">Current saved stage: {report.stage}{report.elapsedMs !== undefined && ` · Recorded duration: ${(report.elapsedMs / 1000).toFixed(1)} seconds`}</p><p className="text-xs text-muted-foreground">Approved test files: {evaluation.approved} · Blocked or unreviewed: {evaluation.blocked}{report.resources && ` · Model requests: ${usage.used} / ${report.resources.limit ?? 'no limit'}`}</p><Button variant="outline" size="sm" onClick={() => onNavigate('findings', 'agent-decisions')}>Inspect Agent decisions</Button></div></details>
    {!!evaluation.unmapped.length && <p role="status" className="text-sm text-amber-200">No behavior mapping: {evaluation.unmapped.map(rule => rule.originalId || rule.id).join(', ')}. These items remain unverified.</p>}
    {report.replay && <p className="text-xs text-muted-foreground">Saved-suite replay made no model calls. Original analysis and reviews were reused; diagnoses and mutations were not refreshed.</p>}
    <p className="text-xs text-muted-foreground">Completed means processing ended. Passing cases and Agent assessments do not establish full specification correctness.</p>
  </div>;
}

function ScopeRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right tabular-nums">{value}</dd></div>;
}
