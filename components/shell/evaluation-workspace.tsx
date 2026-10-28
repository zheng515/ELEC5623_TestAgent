"use client";
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CircleAlert, Download, Files, LayoutDashboard, ListChecks, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DocumentExtraction, OcrConfidence, OriginalPageLink } from './document-extraction';
import { outcomeCounts, requirementStates, verificationSummary } from '@/lib/run-evaluation';
import type { PythonReport, Outcome } from '@/lib/python-types';
import { ruleSources } from '@/lib/requirement-input';
import { testFile } from '@/lib/runtime';
import { testArchive } from '@/lib/test-export';
import { survivorLabels, survivorReviews } from '@/lib/mutation-review';
import { AgentDecisions } from './agent-decisions';
import { ResultOverview } from './result-overview';
import { FindingEvidence } from './finding-evidence';

const screenshotUrl = (run: string, file: string) => '/api/python/screenshot?run=' + encodeURIComponent(run) + '&file=' + encodeURIComponent(file);
const resultTypes = [['passed', 'Passed', '#22c55e'], ['failed', 'Failed', '#ef4444'], ['error', 'Errors', '#f59e0b'], ['skipped', 'Skipped', '#71717a']] as const;

function ExecutionRecords({ outcomes }: { outcomes: Outcome[] }) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(outcomes.length / 100)), page = Math.min(requestedPage, pages - 1);
  return <div className="space-y-2"><p>{outcomes.length} exact outcomes saved. Page {page + 1} of {pages}.</p>
    <div className="max-h-64 overflow-auto space-y-2">{outcomes.slice(page * 100, (page + 1) * 100).map((outcome, index) => <details key={index}><summary>{outcome.status} · {outcome.node}</summary><pre className="text-xs whitespace-pre-wrap">{outcome.message || 'No diagnostic message recorded.'}</pre></details>)}</div>
    {pages > 1 && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous records</Button><Button size="sm" variant="outline" disabled={page + 1 === pages} onClick={() => setPage(page + 1)}>Next records</Button></div>}
  </div>;
}

function MutationReview({ report }: { report: PythonReport }) {
  const rows = survivorReviews(report);
  if (!rows.length) return report.mutations.at(-1)?.incomplete ? <p>No surviving outcomes were recorded in the incomplete latest attempt. Missing outcomes do not resolve earlier survivors or gaps.</p> : null;
  return <section className="my-3 space-y-2">
    <p>Current surviving mutants: {rows.length}. {Object.entries(survivorLabels).map(([category, label]) => `${label}: ${rows.filter(row => row.category === category).length}`).join(' · ')}.</p>
    <p className="text-sm text-muted-foreground">Model judgments apply only to the cited behavior and exact saved diff. Each mapped behavior is reviewed separately; missing or duplicate pairs remain unresolved. Unspecified details are not equivalent code; independent review is still required.</p>
    {rows.map(({ mutant, reviews, category }) => <details key={mutant.id}><summary className="cursor-pointer">{mutant.id} · {survivorLabels[category]} · {reviews.filter(review => review.decision).length}/{reviews.length} behavior pairs reviewed</summary>
      {!reviews.length && <p>No mapped behavior is available. No exclusion or verification credit is granted.</p>}
      {reviews.map(({ behavior, decision, category }) => <details key={behavior.id} className="my-2"><summary>{behavior.id} · {survivorLabels[category]}</summary><p>{decision?.reason || 'No unique grounded review matches this behavior, file and exact diff.'}</p>{decision && <blockquote className="whitespace-pre-wrap text-sm text-muted-foreground">{decision.quote}</blockquote>}</details>)}
      <pre className="whitespace-pre-wrap text-xs">{mutant.diff || 'Mutation diff unavailable.'}</pre>
    </details>)}
  </section>;
}

export function EvaluationWorkspace({ initialRunId = '' }: { initialRunId?: string }) {
  const [reports, setReports] = useState<PythonReport[]>([]);
  const [selectedId, setSelectedId] = useState(initialRunId);
  const [filter, setFilter] = useState('All');
  const [testFilter, setTestFilter] = useState('All');
  const [outcomePage, setOutcomePage] = useState(0);
  const [findingNode, setFindingNode] = useState('');
  const [panel, setPanel] = useState('overview');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<PythonReport>();
  const report = reports.find(item => item.id === selectedId) || reports[0];
  const runningId = report?.status === 'running' ? report.id : '';
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/python', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to view your project runs.' : 'Could not load your project runs. Try refreshing.');
        const items: PythonReport[] = await response.json();
        if (initialRunId && !items.some(item => item.id === initialRunId)) {
          const selected = await fetch('/api/python?id=' + encodeURIComponent(initialRunId), { cache: 'no-store', signal: controller.signal });
          if (!selected.ok) throw new Error('Could not load the requested run. Refresh or choose another run.');
          items.unshift(await selected.json());
        }
        setReports(items); setError('');
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load project runs.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [revision, initialRunId]);
  useEffect(() => {
    if (!runningId) return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/python?id=' + encodeURIComponent(runningId), { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Live updates unavailable. Refresh to reconnect.');
        const next: PythonReport = await response.json();
        if (!controller.signal.aborted) { setReports(items => items.map(item => item.id === next.id ? next : item)); setError(''); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Live updates unavailable.'); }
    }, 4000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [runningId]);
  useEffect(() => {
    let active = true;
    async function loadComparison() {
      setComparison(undefined);
      if (!report?.parentRunId) return;
      try {
        const response = await fetch('/api/python?id=' + report.parentRunId, { cache: 'no-store' });
        const previous = response.ok ? await response.json() : undefined;
        if (active) setComparison(previous);
      } catch { /* Comparison is optional; the current report remains available. */ }
    }
    void loadComparison();
    return () => { active = false; };
  }, [report?.parentRunId]);
  const evaluation = report && verificationSummary(report);
  const outcomes = evaluation?.latest?.outcomes || [];
  const filteredOutcomes = outcomes.filter(outcome => testFilter === 'All' || outcome.status === testFilter).sort((a, b) => Number(['failed', 'error'].includes(b.status)) - Number(['failed', 'error'].includes(a.status)));
  const outcomePages = Math.max(1, Math.ceil(filteredOutcomes.length / 100));
  const currentOutcomePage = Math.min(outcomePage, outcomePages - 1);
  const checkByRule = new Map(evaluation?.requirementChecks.items.map(item => [item.id, item]));
  const attentionIds = new Set(evaluation?.needsAttention.map(rule => rule.id));
  const filterCounts: Record<string, number> = {
    'Needs attention': evaluation?.needsAttention.length || 0,
    'Checks passed': evaluation?.requirementChecks.passed || 0,
    'Needs investigation': evaluation?.requirementChecks.investigate || 0,
    'Incomplete checks': evaluation?.requirementChecks.remaining || 0,
    ...Object.fromEntries(evaluation?.distribution.map(item => [item.name, item.value]) || []),
  };
  const matchesRequirement = (rule: NonNullable<typeof evaluation>['requirements'][number]) => {
    const check = checkByRule.get(rule.id);
    if (filter === 'All') return true;
    if (filter === 'Needs attention') return attentionIds.has(rule.id);
    if (filter === 'Checks passed') return !!check?.checked && !check.investigate;
    if (filter === 'Needs investigation') return !!check?.investigate;
    if (filter === 'Incomplete checks') return !!check && !check.checked;
    return rule.status === filter;
  };
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'verification.json'; link.click(); URL.revokeObjectURL(url);
  }
  async function downloadTests() {
    if (!report) return;
    const url = URL.createObjectURL(await testArchive(report).generateAsync({ type: 'blob' }));
    const link = document.createElement('a'); link.href = url; link.download = 'reqtest_tests.zip'; link.click(); URL.revokeObjectURL(url);
  }
  const stateTone: Record<string, string> = { Verified: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', 'Partially Verified': 'border-blue-500/40 bg-blue-500/10 text-blue-300', Unverified: 'border-zinc-500/40 text-zinc-300', Uncertain: 'border-amber-500/40 bg-amber-500/10 text-amber-300', Pending: 'border-violet-500/40 bg-violet-500/10 text-violet-300' };
  function openPanel(value: string, id?: string) {
    setPanel(value);
    if (id) requestAnimationFrame(() => { const target = document.getElementById(id); if (target instanceof HTMLDetailsElement) target.open = true; target?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  return <section className="min-w-0 space-y-5 [overflow-wrap:anywhere] [&_details]:min-w-0 [&_pre]:max-w-full [&_pre]:max-h-80 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_[data-slot=native-select-wrapper]]:max-w-full">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1><p className="mt-1 text-xs text-muted-foreground">{report?.source.startsWith('https://github.com/') ? report.source.split('/').slice(3, 5).join('/') : 'Findings, verification scope and saved evidence.'}</p></div><div className="flex min-w-0 flex-wrap items-center gap-2">{report && <><label className="block min-w-0 [&>div]:max-w-full"><span className="sr-only">Selected run</span><NativeSelect aria-label="Project run" value={report.id} className="max-w-64 text-xs" onChange={event => { setSelectedId(event.target.value); setFilter('All'); setTestFilter('All'); setFindingNode(''); setPanel('overview'); }}>{reports.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.title} · {new Date(item.createdAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {item.status}</NativeSelectOption>)}</NativeSelect></label><Button variant="outline" size="sm" disabled={report.status === 'running' || !report.tests.some(test => test.approved)} onClick={downloadTests}><Download aria-hidden="true" className="size-4" />Download tests</Button><Button variant="outline" size="sm" onClick={download}>Export evidence</Button></>}<Button variant="ghost" size="icon" aria-label="Refresh evaluation" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw aria-hidden="true" className={'size-4 ' + (loading ? 'animate-spin' : '')} /></Button></div></header>
    {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">{error} Saved results may be out of date.</p>}
    {!report && !loading && !error && <Card><CardHeader><CardTitle role="heading" aria-level={2}>No runs yet</CardTitle></CardHeader><CardContent className="text-muted-foreground">Start a run in Project verification.</CardContent></Card>}
    {report && evaluation && <>
      <Tabs value={panel} onValueChange={setPanel} className="min-w-0">
        <TabsList aria-label="Evaluation sections" className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:grid-cols-4">
          <TabsTrigger value="overview" className="gap-2 py-2"><LayoutDashboard aria-hidden="true" className="size-4" />Overview</TabsTrigger>
          <TabsTrigger value="requirements" className="gap-2 py-2"><ListChecks aria-hidden="true" className="size-4" />Requirements</TabsTrigger>
          <TabsTrigger value="findings" className="gap-2 py-2"><CircleAlert aria-hidden="true" className="size-4" />Findings</TabsTrigger>
          <TabsTrigger value="evidence" className="gap-2 py-2"><Files aria-hidden="true" className="size-4" />Evidence</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-5 space-y-5 data-[state=inactive]:hidden">
          <ResultOverview report={report} onNavigate={openPanel} onFinding={node => { setFindingNode(node); openPanel('findings', 'finding-evidence'); }} onRequirements={state => { setFilter(state); openPanel('requirements'); }} onTests={status => { setTestFilter(status); openPanel('findings', 'test-results'); }} />

        </TabsContent>
        <TabsContent value="requirements" forceMount className="mt-5 space-y-5 data-[state=inactive]:hidden">
          <Card><CardHeader><CardTitle role="heading" aria-level={2}>Requirement map</CardTitle><p className="text-xs text-muted-foreground">{report.rules.length} input items · {report.analysis?.behaviors.length || 0} mapped behaviors. Expand a card for its original contract and evidence.</p></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap justify-end gap-3"><NativeSelect aria-label="Filter requirement state" value={filter} onChange={event => setFilter(event.target.value)}>{['All', 'Needs attention', 'Checks passed', 'Needs investigation', 'Incomplete checks', ...requirementStates].map(state => <NativeSelectOption key={state} value={state}>{state}{state !== 'All' && ` (${filterCounts[state] || 0})`}</NativeSelectOption>)}</NativeSelect></div><p className="text-sm text-muted-foreground">Verified applies to the recorded cases only. It does not establish complete specification coverage.</p>
<div className="rounded-lg border border-border p-4 space-y-2 text-sm"><p>{evaluation.requirementChecks.checked} of {evaluation.requirements.length} requirement items checked · {evaluation.requirementChecks.passed} passed recorded checks · {evaluation.requirementChecks.investigate} need investigation · {evaluation.requirementChecks.remaining} incomplete or not checked</p><p className="text-xs text-muted-foreground">Missing, skipped or erroneous mapped checks remain incomplete. Execution progress is not complete specification coverage.</p><p><strong>Mutation assessment:</strong> {evaluation.mutationAssessment}{report.replay && ' · Reused from original run'}</p><p className="text-xs text-muted-foreground">Mutation checks assess selected test strength separately. Verified requires recorded coverage and adequacy gates; passing checks without mutation assessment remain Partially Verified.</p></div>
<div className="grid gap-4 md:grid-cols-2">
        {evaluation.requirements.filter(matchesRequirement).map(rule => <details key={rule.id} className="border border-border rounded-lg p-4"><summary className="cursor-pointer list-none space-y-3"><span className="flex flex-wrap items-center justify-between gap-2"><strong>{rule.originalId && rule.originalId !== rule.id ? rule.originalId + " (" + rule.id + ")" : rule.id}</strong><Badge variant="outline" className={stateTone[rule.status]}>{rule.status}</Badge></span><span className="block text-sm text-muted-foreground line-clamp-2">{rule.behaviors.map(behavior => behavior.text).join(" · ") || rule.text}</span><span className="block text-xs text-muted-foreground">{evaluation.requirementChecks.items.find(item => item.id === rule.id)?.label} · {rule.behaviors.length} {rule.behaviors.length === 1 ? 'behavior' : 'behaviors'} · Expand details</span></summary><div className="mt-4 space-y-4">
          <details><summary className="cursor-pointer">Submitted requirement text and source locations</summary><blockquote className="whitespace-pre-wrap max-h-64 overflow-auto text-sm mt-3">{rule.text}</blockquote>
          {ruleSources(rule).map(source => <p key={source.segmentId + ":" + (source.start || 0)} className="text-sm">{source.fileName} · {source.location}<OriginalPageLink documentId={source.documentId} page={source.page} /><OcrConfidence source={source} /></p>)}
          </details>
          {report.analysis?.inconsistencies.filter(item => item.ruleId === rule.id).map((item, index) => <p key={index} className="text-sm">Requirement conflict: {item.description}</p>)}
          {!rule.behaviors.length && <p>No behavior mapping was recorded for this requirement.</p>}
          {rule.behaviors.map(behavior => <div key={behavior.id} className="border-t pt-3 space-y-2 text-sm"><p className="font-semibold">{behavior.id} · {behavior.status} · {behavior.text}</p><p>{behavior.reason}</p><details><summary>Requirement excerpt</summary><blockquote className="border-l-2 border-primary pl-3 text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto mt-2">{behavior.quote}</blockquote></details>{behavior.outcomes.map(outcome => <p key={outcome.node} className="break-all">{outcome.status} · {outcome.node}{outcome.screenshot && <> · <a className="underline" href={screenshotUrl(report.id, outcome.screenshot)} target="_blank" rel="noreferrer">Browser screenshot</a></>}</p>)}{behavior.evidence.length > 0 && <details><summary>Code and test citations ({behavior.evidence.length})</summary>{behavior.evidence.map((item, index) => <div key={index} className="mt-2"><p>{item.file}{item.line ? `:${item.line}` : ''}</p><pre className="whitespace-pre-wrap text-xs">{item.quote}</pre></div>)}</details>}{report.tests.some(test => test.behaviorId === behavior.id) && <details><summary>Generated test artifacts</summary>{report.tests.filter(test => test.behaviorId === behavior.id).map(test => <div key={test.id} className="mt-2"><p>{test.id} · {test.approved ? 'Approved' : 'Blocked or unreviewed'} · {test.purpose}</p><p>{test.review || 'No approval recorded.'}</p><pre className="whitespace-pre-wrap text-xs max-h-64 overflow-auto">{test.code}</pre></div>)}</details>}{behavior.gaps.length > 0 && <details><summary>Originally identified gaps ({behavior.gaps.length})</summary>{behavior.gaps.map((gap, index) => <p key={index}>{gap}</p>)}</details>}</div>)}
        </div></details>)}
</div>
        {!evaluation.requirements.some(matchesRequirement) && <p className="text-muted-foreground">No requirements match this state.</p>}
      </CardContent></Card>
        </TabsContent>
        <TabsContent value="findings" forceMount className="mt-5 space-y-5 data-[state=inactive]:hidden">
          <FindingEvidence report={report} selectedNode={findingNode} onSelect={setFindingNode} />
          <div className="space-y-5">
  <Card id="test-results">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle role="heading" aria-level={2}>Test results</CardTitle><Badge variant="outline">{outcomes.length} recorded</Badge></div><p className="text-sm text-muted-foreground">{evaluation.failedCount} failed · {evaluation.errors} errors in the latest execution. A failure is not automatically an implementation defect.</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Filter test outcomes"><Button size="sm" variant={testFilter === 'All' ? 'secondary' : 'outline'} aria-pressed={testFilter === 'All'} onClick={() => { setTestFilter('All'); setOutcomePage(0); }}>All results</Button>{resultTypes.map(([status, label], index) => <Button key={status} size="sm" variant={testFilter === status ? 'secondary' : 'outline'} aria-pressed={testFilter === status} onClick={() => { setTestFilter(status); setOutcomePage(0); }}>{label} · {evaluation.outcomes[index].value}</Button>)}</div>
      <p className="text-xs text-muted-foreground">{testFilter === 'All' ? 'All statuses; failures and errors appear first.' : `Showing ${resultTypes.find(([status]) => status === testFilter)?.[1].toLowerCase()}. Select All results to reset.`}</p>
      <div className="max-h-96 overflow-auto space-y-3">{filteredOutcomes.slice(currentOutcomePage * 100, (currentOutcomePage + 1) * 100).map((outcome, index) => {
        const artifact = report.tests.find(test => test.approved && outcome.file === testFile(test.id, report.runtime) && outcome.name.split('[')[0] === test.functionName);
        return <details key={outcome.node + ':' + index} className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium"><Badge variant={['failed', 'error'].includes(outcome.status) ? 'destructive' : 'outline'} className="mr-2">{outcome.status}</Badge>{artifact?.purpose || outcome.name || outcome.node}</summary>
          <div className="mt-3 space-y-2 text-sm"><p>{artifact ? `Generated check ${artifact.id} · ${artifact.behaviorId}` : 'Existing test or execution record'}</p><p className="break-all text-xs text-muted-foreground">{outcome.node}</p><pre className="text-xs">{outcome.message || 'No diagnostic message recorded.'}</pre>{outcome.screenshot && <a href={screenshotUrl(report.id, outcome.screenshot)} target="_blank" rel="noreferrer"><Image unoptimized width={640} height={400} className="mt-2 h-auto max-w-full rounded-lg border border-border" src={screenshotUrl(report.id, outcome.screenshot)} alt={'Browser page when ' + outcome.node + ' failed'} /></a>}</div>
        </details>;
      })}</div>
      {outcomePages > 1 && <div className="flex flex-wrap items-center gap-3 text-sm"><span>Page {currentOutcomePage + 1} of {outcomePages} · {filteredOutcomes.length} matching outcomes</span><Button size="sm" variant="outline" disabled={currentOutcomePage === 0} onClick={() => setOutcomePage(currentOutcomePage - 1)}>Previous results</Button><Button size="sm" variant="outline" disabled={currentOutcomePage + 1 === outcomePages} onClick={() => setOutcomePage(currentOutcomePage + 1)}>Next results</Button></div>}
      {!outcomes.length && <p className="text-sm text-muted-foreground">No test execution recorded. No passing result is available; inspect blocked tests, setup errors and the saved run status.</p>}
      {!!outcomes.length && !outcomes.some(outcome => testFilter === 'All' || outcome.status === testFilter) && <p className="text-sm text-muted-foreground">No results match this status.</p>}
      <details id="failed-tests" className="border-t border-border pt-4 text-sm">
        <summary className="cursor-pointer font-medium">Agent diagnoses ({report.diagnoses.length})</summary>
        <div className="mt-4 space-y-4"><p className="text-muted-foreground">Agent assessments. Compare each with the original requirement and execution evidence; the phase identifies the recorded execution.</p>
          {report.diagnoses.map((diagnosis, index) => <div key={index} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap gap-2"><Badge variant="outline">{diagnosis.phase || 'execution'}</Badge><Badge variant="secondary">{diagnosis.category.replaceAll('_', ' ')}</Badge><span className="break-all">{diagnosis.testId}</span></div>
            <p>{diagnosis.reason}</p>
            <details><summary className="cursor-pointer text-muted-foreground">Requirement and execution excerpts</summary><div className="mt-3 space-y-3"><blockquote className="border-l-2 border-primary pl-3 whitespace-pre-wrap">{diagnosis.quote}</blockquote><pre className="text-xs">{diagnosis.executionQuote}</pre></div></details>
          </div>)}
          {report.improvements.map((improvement, index) => <p key={'improvement-' + index}><strong>Improvement:</strong> {improvement.reason}</p>)}
          {!report.diagnoses.length && <p className="text-muted-foreground">No diagnoses recorded.</p>}
        </div>
      </details>
    </CardContent>
  </Card>
  <Card id="blocked-tests">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle role="heading" aria-level={2}>Blocked or unreviewed tests</CardTitle><Badge variant="outline">{evaluation.blocked}</Badge></div></CardHeader>
    <CardContent className="space-y-3">
      {report.tests.filter(test => !test.approved).map(test => <details key={test.id} className="rounded-lg border border-border p-4 text-sm">
        <summary className="cursor-pointer font-medium">{test.id} · {test.purpose}</summary>
        <p className="mt-3">{test.review || 'No approval recorded.'}</p>
      </details>)}
      {!evaluation.blocked && <p className="text-sm text-muted-foreground">No blocked or unreviewed proposals recorded.</p>}
    </CardContent>
  </Card>
  <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle role="heading" aria-level={2}>Requirements needing attention</CardTitle><Badge variant="outline">{evaluation.needsAttention.length} / {report.rules.length}</Badge></div></CardHeader>
    <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Review saved requirement states and their linked evidence.</p><Button variant="outline" onClick={() => { setFilter('Needs attention'); setPanel('requirements'); }}>Review requirements</Button></CardContent>
  </Card>
  <AgentDecisions report={report} />
</div>

        </TabsContent>
        <TabsContent value="evidence" forceMount className="mt-5 space-y-5 data-[state=inactive]:hidden">
          <Card><CardHeader><CardTitle role="heading" aria-level={2} className="flex items-center gap-2"><Files aria-hidden="true" className="size-5 text-primary" />Run provenance</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{report.collection?.timedOut ? <p>Test collection timed out. Inspect execution records.</p> : report.collection?.exitCode === 5 ? <p className="text-sm">No existing tests were collected. Generated tests are evaluated separately.</p> : !!report.collection?.exitCode && <p>Test collection failed (exit {report.collection.exitCode}). Inspect execution records.</p>}{report.baseline && <p className="text-sm">Existing-suite baseline: {outcomeCounts(report.baseline).map(item => `${item.value} ${item.name.toLowerCase()}`).join(' · ')}{(!report.baseline.integrity || report.baseline.timedOut || ![0, 5].includes(report.baseline.exitCode)) && ' · Baseline requires investigation.'}</p>}<details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Run details</summary><div className="mt-3 space-y-2"><p>{report.title}</p><p className="break-all">{report.source}</p>{report.testDiscovery && <p>Collection: {report.testDiscovery.totalNodes.toLocaleString()} nodes · {report.testDiscovery.complete ? "complete catalog" : "incomplete catalog"}. Full baseline: {report.testDiscovery.baselineFiles.length} test files. Model context: {report.testDiscovery.modelSelectedNodes} selected nodes; {report.testDiscovery.modelOmittedNodes.toLocaleString()} omitted from the prompt. Preserved assets: {report.testDiscovery.assets.length}.</p>}{report.configuration?.policyVersion && <p>Policy: {report.configuration.policyVersion}</p>}{report.configuration?.modelTimeoutSeconds !== undefined && <p>Model response timeout: {report.configuration.modelTimeoutSeconds ? `${report.configuration.modelTimeoutSeconds} seconds per request` : 'Disabled'}</p>}<p>{report.model} · {new Date(report.createdAt).toLocaleString()}{report.elapsedMs !== undefined && ` · ${(report.elapsedMs / 1000).toFixed(1)} seconds`}</p></div></details>{report.parentRunId && comparison?.id === report.parentRunId && <details className="text-sm"><summary className="cursor-pointer">Compare with previous run</summary><div className="mt-3 space-y-2"><p>Previous: {comparison.status}, {comparison.measurements.at(-1)?.outcomes.length || 0} outcomes, {comparison.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Current: {report.status}, {evaluation.latest?.outcomes.length || 0} outcomes, {report.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Same source fingerprint: {comparison.fingerprint === report.fingerprint ? 'Yes' : 'No'}. Requirements may differ; this is not an independent improvement score.</p></div></details>}</CardContent></Card>
                <details className="border border-border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Evidence checks</summary><div className="mt-4 space-y-4 text-sm"><p className="text-sm text-muted-foreground">Recorded provenance and execution checks, not an independent correctness or accuracy score.</p>
        <dl className="grid md:grid-cols-3 gap-5">
          <div><dt className="text-sm text-muted-foreground">Code snapshot</dt><dd>{report.fingerprint ? 'Fingerprint recorded' : 'Fingerprint missing'}</dd><dd className="text-xs text-muted-foreground">Identifies the saved source; not rechecked by this page.</dd></div>
          <div><dt className="text-sm text-muted-foreground">Requirement provenance</dt><dd>{report.requirementDocument ? `${evaluation.cited} / ${report.rules.length} source citations recorded` : 'User-provided requirement text'}</dd><dd className="text-xs text-muted-foreground">{report.requirementDocument ? `${report.requirementDocument.selectedBlocks} of ${report.requirementDocument.totalBlocks} original text blocks linked` : 'No uploaded document citation expected.'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Latest execution integrity</dt><dd>{!evaluation.latest ? 'Not checked' : evaluation.latest.integrity === true ? 'Passed recorded integrity check' : evaluation.latest.integrity === false ? 'Integrity check failed' : 'Integrity not recorded'}</dd><dd className="text-xs text-muted-foreground">{evaluation.latest?.timedOut ? 'Execution timed out.' : 'Checks saved artifacts, not semantic test adequacy.'}</dd></div>
        </dl>
        {report.requirementDocument && <details><summary className="cursor-pointer">Original document and extraction details</summary><a className="underline block my-3 text-sm" href={'/api/requirements?id=' + report.requirementDocument.id}>Download original requirement document</a><DocumentExtraction document={report.requirementDocument} /></details>}
      </div></details>

                <details id="execution-records" className="border border-border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Execution records and limitations</summary><div className="mt-4 space-y-3 text-sm break-all"><p>Run: {report.id}</p><p>Snapshot fingerprint: {report.fingerprint || 'Missing'}</p>{report.measurements.map((measurement, index) => <details key={index}><summary>Generated-suite execution {index + 1} · exit {measurement.exitCode}{measurement.timedOut ? ' · timed out' : ''}</summary><p>{outcomeCounts(measurement).map(item => `${item.name}: ${item.value}`).join(' · ')}</p><ExecutionRecords key={report.id + ":" + index} outcomes={measurement.outcomes} /><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{measurement.log}</pre></details>)}{report.collection && <details><summary>Test collection log</summary><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{report.collection.log}</pre></details>}{report.baseline && <details><summary>Existing-test baseline log</summary><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{report.baseline.log}</pre></details>}{evaluation.latest?.runtimeArtifacts?.map(artifact => <p key={artifact.file}>Runtime output: {artifact.file} · SHA-256: {artifact.sha256}</p>)}{report.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}</div></details>
      {report.requirementInput && <details className="border border-border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Requirement input and analysis scope</summary><p className="my-3 text-sm">{report.requirementInput.mode === 'numbered' ? 'Explicit document IDs were grouped automatically, including repeated references.' : 'Unstructured input sections were sent for behavior analysis.'} Only mapped, executed cases can earn verification. Behaviors and tests are not capped; large specifications are analyzed five items and generated six behaviors per request.</p>{report.requirementInput.context && <details><summary>Supporting text retained as context (not separately verified)</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{report.requirementInput.context}</pre></details>}<details><summary>Complete submitted text</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{report.requirementInput.text}</pre></details></details>}
      <details className="border border-border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Technical details</summary><div className="mt-4 space-y-4 text-sm">
      {report.improvementProposal && !report.testAttempts?.some(attempt => attempt.phase === 'improvement') && <details><summary className="cursor-pointer">Improvement candidate reviews ({report.improvementProposal.length})</summary>
        {report.improvementProposal.map(test => <div key={test.id} className="mt-3 space-y-1">
          <p className="break-all">{test.id} · {test.approved ? 'Approved' : 'Blocked or unreviewed'}</p>
          <p>{test.review || 'No approval recorded.'}</p>
        </div>)}
        {!report.improvementProposal.length && <p>No eligible improvement candidates were recorded.</p>}
      </details>}
      <details><summary className="cursor-pointer">Retrieved project evidence</summary><p className="text-sm text-muted-foreground">Documents retrieved for this run are retained in the evidence export. Retrieval does not establish that a requirement is correct.</p>{report.retrieval?.documents.map((document) => <section key={document.file} className="my-3"><p>{document.file}</p><p className="text-xs break-all">SHA-256: {document.sha256}</p><pre className="whitespace-pre-wrap text-xs mt-2">{document.text}</pre></section>)}{!report.retrieval?.documents.length && <p>No retrieved documents were recorded.</p>}</details>
      <details><summary className="cursor-pointer">Mutation measurements</summary>{report.mutations.map((mutation, i) => <div key={i}><p>Attempt {i + 1}: {mutation.mutants.filter((mutant) => mutant.status === 'killed').length} killed / {mutation.mutants.length} recorded; {mutation.mutants.filter((mutant) => mutant.status === 'survived').length} survived{mutation.timedOut ? ' · Time limit reached' : ''}{mutation.incomplete ? ' · Incomplete' : ' · Selected scope complete'}. Raw counts, not a relevant non-equivalent mutation score.</p>{mutation.scope && <p className="text-sm text-muted-foreground">Scope: {mutation.scope.file} · {mutation.scope.kind === 'functions' ? mutation.scope.functions.join(', ') : 'Full-file fallback; direct function calls could not be resolved'}. Suite: approved generated tests. Function selection does not establish whole-file coverage.</p>}{mutation.totalMutants !== undefined && mutation.totalMutants > mutation.mutants.length && <p>Showing {mutation.mutants.length} of {mutation.totalMutants} discovered mutants.</p>}{!!mutation.scope?.setupFiles?.length && <p className="text-sm text-muted-foreground">Representative original modules load directory setup; their test functions are deselected. Collection hooks and module import effects can influence raw outcomes: {mutation.scope.setupFiles.join(', ')}.</p>}<pre className="whitespace-pre-wrap text-xs">{mutation.log}</pre></div>)}<MutationReview report={report} />{!report.mutations.length && <p>Not executed: requires passing tests and a mapped source file.</p>}</details>
      </div></details>

        </TabsContent>
      </Tabs>
    </>}
  </section>;
}
