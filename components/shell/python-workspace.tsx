"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { testArchive } from "@/lib/test-export";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PythonReport } from "@/lib/python-types";
import type { RequirementDocument } from "@/lib/requirements";
import { initialDocumentBlocks } from "@/lib/document-selection";
import { DocumentExtraction, NumberedRequirementSelection, OcrConfidence, OriginalPageLink } from "./document-extraction";
import type { ProjectSetup } from "@/lib/project-setup";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import type { GitHubConnectionStatus } from "@/lib/github-config";
import { RuntimeStatus, useRuntimeHealth } from "./runtime-health";
import { survivorLabels, survivorReviews } from '@/lib/mutation-review';

function MutationReview({ report }: { report: PythonReport }) {
  const rows = survivorReviews(report);
  if (!rows.length) return report.mutations.at(-1)?.incomplete ? <p>No surviving outcomes were recorded in the incomplete latest attempt. Missing outcomes do not resolve earlier survivors or gaps.</p> : null;
  return <section className="my-3 space-y-2">
    <p>Current surviving mutants: {rows.length}. {Object.entries(survivorLabels).map(([category, label]) => `${label}: ${rows.filter(row => row.category === category).length}`).join(' · ')}.</p>
    <p className="text-sm text-muted-foreground">Model judgments apply only to the cited behavior and exact saved diff. Other behavior links remain unresolved. Unspecified details are not equivalent code; independent review is still required.</p>
    {rows.map(({ mutant, decision, category }) => <details key={mutant.id}><summary className="cursor-pointer">{mutant.id} · {survivorLabels[category]}{decision ? ` → ${decision.behaviorId}` : ''}</summary>
      <p>{decision?.reason || 'No unique grounded review matches this file and diff. No exclusion or verification credit is granted.'}</p>
      {decision && <blockquote className="whitespace-pre-wrap text-sm text-muted-foreground">{decision.quote}</blockquote>}
      <pre className="whitespace-pre-wrap text-xs">{mutant.diff || 'Mutation diff unavailable.'}</pre>
    </details>)}
  </section>;
}

export function PythonWorkspace({ model, configured, onRunningChange }: { model: string; configured: boolean; onRunningChange: (running: boolean) => void }) {
  const runtimeStatus = useRuntimeHealth();
  const { health } = runtimeStatus;
  const modelReady = health?.modelConfigured ?? configured;
  const canSubmit = !!health && health.queue !== "unavailable" && health.sandbox === "available" && modelReady;
  const { data: organizations } = authClient.useListOrganizations();
  const [runs, setRuns] = useState<PythonReport[]>([]);
  const [selected, setSelected] = useState<PythonReport>();
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<RequirementDocument>();
  const [blocks, setBlocks] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [setup, setSetup] = useState<ProjectSetup>();
  const [checking, setChecking] = useState(false);
  const [github, setGitHub] = useState<GitHubConnectionStatus>();
  const [connectedGitHub, setConnectedGitHub] = useState(false);
  useEffect(() => { fetch('/api/account/github', { cache: 'no-store' }).then(response => response.ok ? response.json() : undefined).then(setGitHub).catch(() => {}); }, []);
  const [parent, setParent] = useState<PythonReport>();
  const [comparison, setComparison] = useState<PythonReport>();
  const formRef = useRef<HTMLFormElement>(null);
  const execution = useRef<AbortController | null>(null);
  const history = useCallback(async () => {
    const response = await fetch('/api/python', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load your verification history.');
    const next: PythonReport[] = await response.json(); setRuns(next);
    const running = next.some(run => run.status === 'running' && run.access !== 'team'); setBusy(running); onRunningChange(running);
  }, [onRunningChange]);
  useEffect(() => {
    let active = true;
    fetch('/api/python', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Cannot load your verification history.');
      const runs: PythonReport[] = await response.json(); if (active) { setRuns(runs); const running = runs.find(run => run.status === 'running' && run.access !== 'team'); if (running) { setSelected(running); setBusy(true); onRunningChange(true); } }
    }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; execution.current?.abort(); onRunningChange(false); };
  }, [onRunningChange]);
  const activeRunId = selected?.status === 'running' ? selected.id : undefined;
  useEffect(() => {
    if (!activeRunId) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/python?id=' + activeRunId, { cache: 'no-store' });
        if (!response.ok) return;
        const report: PythonReport = await response.json();
        if (active) { setSelected(report); setStage(report.stage); if (report.status !== 'running') { setBusy(false); onRunningChange(false); history().catch(() => {}); } }
      } catch { if (active) setError('Connection lost. This run may still be active; refresh to reconnect.'); }
    }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [activeRunId, onRunningChange, history]);
  async function extract(file?: File) {
    setDocument(undefined); setBlocks([]); if (!file) return;
    setExtracting(true); setError('');
    try {
      const form = new FormData(); form.set('document', file);
      const response = await fetch('/api/requirements', { method: 'POST', body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setDocument(data);
      setBlocks(initialDocumentBlocks(data));
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot extract this document.'); }
    finally { setExtracting(false); }
  }
  async function checkSetup() {
    if (!formRef.current) return;
    setChecking(true); setError(''); setSetup(undefined);
    try {
      const response = await fetch('/api/python/preflight', { method: 'POST', body: new FormData(formRef.current) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSetup(data);
      const token = formRef.current.elements.namedItem('githubToken'); if (token instanceof HTMLInputElement) token.value = '';
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot check project setup.'); }
    finally { setChecking(false); }
  }
  async function stop() {
    if (!selected) { setError('Project import is still starting. Wait for the run record before stopping.'); return; }
    const response = await fetch('/api/python', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
    if (!response.ok) setError('Cannot stop this run. Refresh its current state.');
    else setStage('Stopping');
  }
  async function share(organizationId: string | null) {
    if (!selected) return;
    try {
      const response = await fetch('/api/python', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id, organizationId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSelected({ ...selected, sharedWith: organizationId }); history().catch(() => {});
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot update sharing.'); }
  }
  function newVerification(previous?: PythonReport) {
    setSelected(undefined); setError(''); setDocument(undefined); setBlocks([]); setSetup(undefined); setParent(previous); setComparison(previous);
  }
  async function run(event: FormEvent<HTMLFormElement>) {
    if (!canSubmit) { event.preventDefault(); setError('Check runtime status and restore the required services before submitting. Your inputs are retained.'); return; }
    event.preventDefault(); setError(''); setBusy(true); onRunningChange(true); setSelected(undefined); setStage('Import project');
    const controller = new AbortController(); execution.current = controller;
    const form = new FormData(event.currentTarget); form.set('model', model);
    if (document) { form.set('documentId', document.id); blocks.forEach(id => form.append('segmentId', id)); }
    if (setup) form.set('preflightId', setup.id);
    if (parent) { form.set('parentRunId', parent.id); form.set('reuseRequirements', 'true'); }
    try {
      const response = await fetch('/api/python', { method: 'POST', body: form, signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body) throw new Error('Execution stream unavailable.');
      const stream = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
      let complete = false;
      const reader = stream.getReader();
      try { while (true) {
        const { value: event, done } = await reader.read();
        if (done) break;
        const data = JSON.parse(event.data);
        if (event.event === 'error') throw new Error(data.message || 'Verification could not be saved.');
        if (event.event === 'progress') { setStage(data.stage); setSelected(data.report); }
        if (event.event === 'complete') { setSelected(data); setStage(data.status); complete = true; }
      }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!complete) throw new Error('Run interrupted; inspect the saved partial evidence.');
    } catch (error) { setError(controller.signal.aborted ? 'Disconnected. Open the run in history to reconnect.' : error instanceof Error ? error.message : 'Verification failed.'); }
    finally { execution.current = null; setBusy(false); onRunningChange(false); history().catch(() => {}); }
  }
  function download(name: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = window.document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  }
  async function downloadTests() {
    if (!selected) return;
    const zip = testArchive(selected);
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    const link = window.document.createElement('a'); link.href = url; link.download = 'reqtest_tests.zip'; link.click(); URL.revokeObjectURL(url);
  }
  const latest = selected?.measurements.at(-1);
  const initialFailure = selected?.collection?.timedOut || [1, 2, 3, 4].includes(selected?.collection?.exitCode || 0) || selected?.baseline?.timedOut || selected?.baseline?.integrity === false || [1, 2, 3, 4].includes(selected?.baseline?.exitCode || 0) || selected?.baseline?.outcomes.some((outcome) => ['failed', 'error'].includes(outcome.status));
  const unclear = selected?.analysis?.behaviors.filter(behavior => behavior.issue !== 'none') || [];
  const failed = latest?.outcomes.filter(outcome => ['failed', 'error'].includes(outcome.status)) || [];
  const nextAction = selected?.status === 'running' ? (runtimeStatus.error || !health ? 'Runtime status is unavailable. The saved task is retained; refresh status to check progress.' : health.worker !== 'online' ? 'No recent worker heartbeat. Your task is saved and waiting for a worker or recovery.' : selected.execution?.attempt === 0 ? 'Your task is queued and waiting for an available worker. You can reconnect from history.' : 'Verification is running. You can leave this page and reconnect from history.') : initialFailure ? 'Review environment and existing-test failures below. Fix project setup before relying on results.' : selected?.status === 'failed' || selected?.status === 'cancelled' ? 'Review the saved error and partial evidence, then start a new run.' : unclear.length ? 'Clarify the flagged requirements, then re-run against the same saved code.' : failed.length ? 'Review the failing assertions and diagnoses against the original requirements.' : selected?.states.some(state => state.status !== 'Verified') ? 'Review the remaining gaps and blocked tests before accepting the result.' : 'Inspect the evidence and download the tests for your project. Passing checks do not prove exhaustive correctness.';
  useEffect(() => {
    if (!selected?.parentRunId) return;
    let active = true;
    fetch('/api/python?id=' + selected.parentRunId, { cache: 'no-store' }).then(response => response.ok ? response.json() : undefined).then(report => { if (active) setComparison(report); }).catch(() => {});
    return () => { active = false; };
  }, [selected?.parentRunId]);
  return <section className="space-y-8">
    <header className="space-y-3"><h1 className="text-4xl font-bold uppercase">Requirement-aware verification</h1><p className="text-muted-foreground">Understand → Measure → Diagnose → Improve → Re-measure</p></header>
    <RuntimeStatus {...runtimeStatus} />
    <form noValidate ref={formRef} key={parent?.id || 'new'} onSubmit={run} className="space-y-5" hidden={busy || Boolean(selected)}>
      <label className="block space-y-2">Run name<Input name="title" required maxLength={120} defaultValue={parent ? parent.title + ' — re-run' : 'Project verification'} /></label>
      {parent ? <div className="space-y-3 border rounded p-4"><p>Reusing the saved code snapshot from {parent.title}. The previous report stays unchanged.</p><p>{parent.source}</p>{parent.rules.map(rule => <blockquote key={rule.id}>{rule.id}: {rule.text}</blockquote>)}<label className="block">Clarification — additional requirements, one per line<Textarea name="clarification" rows={4} maxLength={4000} placeholder="State the intended rule that resolves the earlier ambiguity. These statements become new requirements in this run." /></label></div> : <>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-2">GitHub repository<Input name="repository" type="url" placeholder="https://github.com/owner/repository" onChange={() => setSetup(undefined)} /></label>
          <label className="block space-y-2">Or upload a project ZIP<FileInput name="project" accept=".zip" onChange={() => setSetup(undefined)} /></label>
          <label>Branch, tag or commit (optional)<Input name="ref" placeholder="Default branch" onChange={() => setSetup(undefined)} /></label>
          <label>Project directory (optional)<Input name="projectDirectory" maxLength={200} placeholder="backend" onChange={() => setSetup(undefined)} /><span className="text-xs text-muted-foreground">Relative to the repository or ZIP root. Leave empty for the root. Only this directory is analyzed and executed.</span></label>
          <div className="space-y-2"><label className="flex gap-2 items-center"><input type="checkbox" name="useConnectedGitHub" value="true" checked={connectedGitHub} disabled={!github?.configured || !github.connected} onChange={event => { setConnectedGitHub(event.target.checked); setSetup(undefined); }} />Use connected GitHub account</label><p className="text-xs text-muted-foreground">{github?.connected ? 'Credentials stay on the server.' : 'Public repositories need no connection.'} <Link className="underline" href="/account">Manage GitHub connection</Link></p></div>
          {!connectedGitHub && <label>Temporary GitHub token (optional)<Input name="githubToken" type="password" autoComplete="off" placeholder="Read-only access to selected repositories" onChange={() => setSetup(undefined)} /><span className="text-xs text-muted-foreground">Used only to download the snapshot; never stored or sent to the model.</span></label>}
        </div>
        <details className="border rounded p-4"><summary>Runtime and test environment</summary><div className="mt-3 space-y-3">
          <label className="block">Runtime<select name="runtime" className="block border bg-background p-2" onChange={() => setSetup(undefined)}><option value="auto">Detect automatically</option><option value="python">Python / pytest</option><option value="node">JavaScript or TypeScript / node:test</option></select></label>
          <label className="flex gap-2"><input name="automaticSetup" type="checkbox" value="true" onChange={() => setSetup(undefined)} />Install declared registry dependencies automatically</label>
          <p className="text-sm text-muted-foreground">Python uses compatible wheels; Node.js requires package-lock.json. Native builds, Git/file dependencies and install scripts require a custom image.</p>
          <label className="flex gap-2"><input name="service" type="checkbox" value="postgres" onChange={() => setSetup(undefined)} />Disposable PostgreSQL (DATABASE_URL)</label>
          <label className="flex gap-2"><input name="service" type="checkbox" value="redis" onChange={() => setSetup(undefined)} />Disposable Redis (REDIS_URL)</label>
          <p className="text-sm text-muted-foreground">Selected services start fresh for each tool execution, use an internal network without public ports and are removed afterward.</p>
        </div></details>
        <Button type="button" variant="outline" disabled={checking} onClick={checkSetup}>{checking ? 'Checking project…' : 'Check project setup'}</Button>
        {setup && <div className="border rounded p-4 space-y-2"><p>Project setup: {setup.setup.status} · {setup.runtime === "node" ? "Node.js" : "Python"} {setup.setup.python}</p>{setup.setup.checks.map((check, i) => <p key={i} className={check.status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}>{check.status} · {check.label}: {check.detail}</p>)}{setup.automaticSetup && <details><summary>Installed dependency versions ({setup.installed.length})</summary>{setup.installed.map(dependency => <p className="text-xs" key={dependency}>{dependency}</p>)}{!setup.installed.length && <p>No additional declared dependencies were installed.</p>}</details>}{setup.setup.limitations.map(limit => <p className="text-xs text-muted-foreground" key={limit}>{limit}</p>)}{setup.setup.status === 'needs_setup' && <label className="flex gap-2"><input type="checkbox" name="allowEnvironmentFailure" value="true" />Run anyway to diagnose environment failures</label>}</div>}
        <label className="block space-y-2">Requirement file (optional)<FileInput accept=".pdf,.doc,.docx,.txt,.md" disabled={extracting} onChange={event => extract(event.target.files?.[0])} /></label>
        {extracting && <p role="status">Extracting requirement text…</p>}
        {document ? <div className="space-y-3 border rounded p-4"><p>{document.fileName} · {blocks.length} / {document.segments.length} blocks selected</p><p>Only selected blocks are analyzed. Select up to 12 blocks and 12,000 characters; no unselected text is claimed as verified.</p><DocumentExtraction document={document} /><NumberedRequirementSelection document={document} onSelect={setBlocks} /><a className="inline-block underline text-sm" href={'/api/requirements?id=' + document.id}>Download original document</a>{document.segments.some(segment => segment.extraction === 'ocr') && <p className="text-xs text-muted-foreground">Low-confidence OCR blocks are not selected automatically. Compare them with the original before choosing them. Confidence is a tool signal, not an accuracy score.</p>}<div className="max-h-80 overflow-auto space-y-3">{document.segments.map(segment => <label className="flex gap-3 items-start" key={segment.id}><input type="checkbox" checked={blocks.includes(segment.id)} onChange={event => setBlocks(event.target.checked ? [...blocks, segment.id] : blocks.filter(id => id !== segment.id))} /><span><strong>{segment.location}</strong><OriginalPageLink documentId={document.id} page={segment.page} /><OcrConfidence source={segment} /><span className="block whitespace-pre-wrap text-sm">{segment.text}</span></span></label>)}</div><Button variant="outline" type="button" onClick={() => { setDocument(undefined); setBlocks([]); }}>Use pasted text instead</Button></div> : <label className="block space-y-2">Requirements — one per line<Textarea name="requirements" required maxLength={12000} rows={6} placeholder="Describe intended behavior, boundaries and exception rules. Up to 12 lines." /></label>}
      </>}
      <p className="text-sm text-muted-foreground">Submit only approved project data. Source code, tests and project documentation are sent to the selected model. Tests execute in Docker. Automatic setup installs registry dependencies without running project install scripts.</p>
      {!modelReady && <p role="status">Configure OPENAI_API_KEY in the root .env.local, then restart.</p>}
      <Button disabled={!canSubmit || !model.trim() || extracting || checking || Boolean(document && !blocks.length)}>{health?.worker === 'online' ? 'Run verification' : 'Queue verification'}</Button>
    </form>
    <div className="flex flex-wrap gap-3 items-center">
      <label htmlFor="python-history">Your runs</label><NativeSelect id="python-history" disabled={busy} value={selected?.id || ''} onChange={(event) => setSelected(runs.find((run) => run.id === event.target.value))}><NativeSelectOption value="">New verification</NativeSelectOption>{runs.map((run) => <NativeSelectOption key={run.id} value={run.id}>{run.title} · {run.status === 'running' && !busy ? 'Running / incomplete' : run.status}</NativeSelectOption>)}</NativeSelect>
      {selected && !busy && <Button variant="outline" onClick={() => newVerification()}>New verification</Button>}
      {selected && !busy && selected.access !== 'team' && <Button variant="outline" onClick={() => newVerification(selected)}>Clarify and re-run</Button>}
      {busy && <Button variant="destructive" onClick={stop}>Stop</Button>}
      {busy && <p role="status">{stage}…</p>}
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {selected && <>
      <p className="text-sm">{selected.access === 'team' ? 'Shared workspace report · read-only' : 'Your report'}</p>
      {!busy && selected.access !== 'team' && <label className="block">Report visibility<select className="block border rounded bg-background p-2" value={selected.sharedWith || ''} onChange={event => share(event.target.value || null)}><option value="">Private — only me</option>{organizations?.map(organization => <option key={organization.id} value={organization.id}>Share with {organization.name}</option>)}</select><span className="text-xs text-muted-foreground">Sharing exposes the report, its code/test excerpts and linked requirement document to current workspace members.</span></label>}
      {initialFailure && <p role="status" className="text-red-400">Existing-test checks need attention. Review failure diagnoses and the collection/baseline logs below.</p>}
      <header><h2 className="text-2xl font-bold">{selected.title} · {selected.status}</h2><p className="text-sm text-muted-foreground">{selected.source}</p>{latest && <p className="mt-3 text-sm">{latest.outcomes.length} recorded checks · {latest.outcomes.filter((outcome) => outcome.status === 'passed').length} passed · <span className={latest.outcomes.some((outcome) => outcome.status === 'failed') ? 'text-red-400' : ''}>{latest.outcomes.filter((outcome) => outcome.status === 'failed').length} failed</span> · {latest.outcomes.filter((outcome) => outcome.status === 'error').length} execution errors</p>}{selected.error && <p role="alert" className="text-red-400">{selected.error}</p>}</header>
      <section className="border rounded p-5 space-y-3">
        <h3 className="font-bold text-lg">Verification summary</h3>
        {selected.execution && <p className="text-sm text-muted-foreground">{selected.status === 'running' ? selected.stage + '. ' : ''}{selected.execution.recovered ? `Worker recovery attempt ${selected.execution.attempt}. Saved checkpoints are reused when available.` : selected.execution.attempt ? 'Processed by the background verification worker.' : 'Queued. Waiting for an available background worker.'}</p>}
        <p>{selected.rules.length} requirement statements · {selected.analysis?.behaviors.length || 0} behaviors analyzed · {selected.tests.filter(test => test.approved).length} supported test artifacts · {failed.length} failed/error outcomes</p>
        <p>{unclear.length} behaviors need clarification · {selected.tests.filter(test => !test.approved).length} test artifacts blocked by review</p>
        <p><strong>Next action:</strong> {nextAction}</p>
        {selected.requirementDocument && <p className="text-sm">Document scope: {selected.requirementDocument.selectedBlocks} of {selected.requirementDocument.totalBlocks} blocks selected from {selected.requirementDocument.fileName}. Unselected content is outside this run.</p>}
        {selected.parentRunId && comparison?.id === selected.parentRunId && <details><summary>Compare with previous run</summary><p>Previous: {comparison.status}, {comparison.measurements.at(-1)?.outcomes.length || 0} recorded outcomes, {comparison.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Current: {selected.status}, {latest?.outcomes.length || 0} recorded outcomes, {selected.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Same source fingerprint: {comparison.fingerprint === selected.fingerprint ? 'Yes' : 'No'}. Requirements may have changed; this is a run comparison, not an independent improvement score.</p></details>}
      </section>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-y py-4">{['Verified', 'Partially Verified', 'Unverified', 'Uncertain'].map((status) => <div key={status}><strong className="text-3xl">{selected.states.filter((state) => state.status === status && (status !== 'Verified' || selected.status === 'completed')).length}</strong><p>{status}</p></div>)}</div>
      <p className="text-sm text-muted-foreground">States describe mapped, reviewed cases, not exhaustive correctness. Interrupted work is not verified. Model judgments require independent evaluation.</p>
      <Table><TableHeader><TableRow><TableHead>Requirement / behavior</TableHead><TableHead>Verification state</TableHead><TableHead>Evidence / gaps</TableHead></TableRow></TableHeader><TableBody>
        {selected.analysis?.behaviors.map((behavior) => { const state = selected.states.find((state) => state.id === behavior.id); const source = selected.rules.find(rule => rule.id === behavior.ruleId)?.source; return <TableRow key={behavior.id}>
          <TableCell className="whitespace-normal max-w-lg"><strong>{behavior.ruleId} → {behavior.id} · {behavior.category}</strong><p>{behavior.text}</p><blockquote className="mt-2 text-muted-foreground">{behavior.quote}</blockquote>{source && <p className="mt-2 text-xs text-muted-foreground">{source.fileName} · {source.location}<OriginalPageLink documentId={source.documentId} page={source.page} /><OcrConfidence source={source} /></p>}</TableCell>
          <TableCell>{selected.status === 'running' ? 'Pending final measurement' : state?.status || 'Unverified'}<p className="text-muted-foreground whitespace-normal">{state?.reason || behavior.reason}</p></TableCell>
          <TableCell className="whitespace-normal"><details><summary className="cursor-pointer">Inspect evidence</summary><ul>{behavior.gaps.map((gap, i) => <li key={i}>Gap {i}: {gap}</li>)}</ul>{behavior.evidence.map((item, i) => <pre className="whitespace-pre-wrap text-xs mt-3" key={i}>{item.file}{'\n'}{item.quote}</pre>)}<p>Mapped existing tests: {behavior.existingTests.join(', ') || 'None'}</p><p>Recorded nodes: {state?.nodes.join(', ') || 'None'}</p></details></TableCell>
        </TableRow>; })}
      </TableBody></Table>
      <details><summary className="cursor-pointer">Execution evidence ({latest?.outcomes.length || 0} outcomes)</summary>
      <Table><TableHeader><TableRow><TableHead>Test</TableHead><TableHead>Outcome</TableHead><TableHead>Diagnostic evidence</TableHead></TableRow></TableHeader><TableBody>{latest?.outcomes.map((outcome, i) => <TableRow key={i}><TableCell className="whitespace-normal">{outcome.node}</TableCell><TableCell>{outcome.status}</TableCell><TableCell><pre className="whitespace-pre-wrap text-xs max-w-xl">{outcome.message}</pre></TableCell></TableRow>)}</TableBody></Table>
      </details>
      {selected.requirementDocument && <details><summary>Requirement document and source locations</summary><p>SHA-256: {selected.requirementDocument.sha256}</p><a className="underline" href={'/api/requirements?id=' + selected.requirementDocument.id}>Download original requirement document</a><DocumentExtraction document={selected.requirementDocument} />{selected.rules.map(rule => <div className="my-3" key={rule.id}><p>{rule.id}: {rule.source?.location || 'User-provided text / clarification'}</p>{rule.source && <><OriginalPageLink documentId={rule.source.documentId} page={rule.source.page} /><OcrConfidence source={rule.source} /></>}<blockquote className="whitespace-pre-wrap">{rule.text}</blockquote></div>)}</details>}
      <details><summary className="cursor-pointer">Requirement quality and inconsistencies</summary>{selected.analysis?.behaviors.filter((behavior) => behavior.issue !== 'none').map((behavior) => <p key={behavior.id}>{behavior.id} · {behavior.issue}: {behavior.reason}</p>)}{selected.analysis?.inconsistencies.map((item, i) => <p key={i}>{item.ruleId}{item.behaviorIds?.length ? ` → ${item.behaviorIds.join(', ')}` : ''}: {item.description}</p>)}</details>
      <details><summary className="cursor-pointer">Retrieved project evidence</summary><p className="text-sm text-muted-foreground">Documents retrieved for this run are retained in the evidence export. Retrieval does not establish that a requirement is correct.</p>{selected.retrieval?.documents.map((document) => <section key={document.file} className="my-3"><p>{document.file}</p><p className="text-xs break-all">SHA-256: {document.sha256}</p><pre className="whitespace-pre-wrap text-xs mt-2">{document.text}</pre></section>)}{!selected.retrieval?.documents.length && <p>No retrieved documents were recorded.</p>}</details>
      <details><summary className="cursor-pointer">Failure diagnoses and improvements</summary>{selected.diagnoses.map((decision, i) => <p key={i}>{decision.phase || 'execution'} · {decision.testId} · {decision.category}: {decision.reason}</p>)}{selected.improvements.map((improvement, i) => <p key={i}>{improvement.reason}</p>)}{!selected.diagnoses.length && <p>No failure diagnosis was recorded.</p>}</details>
      <details><summary className="cursor-pointer">Mutation measurements</summary>{selected.mutations.map((mutation, i) => <div key={i}><p>Attempt {i + 1}: {mutation.mutants.filter((mutant) => mutant.status === 'killed').length} killed / {mutation.mutants.length} recorded; {mutation.mutants.filter((mutant) => mutant.status === 'survived').length} survived{mutation.timedOut ? ' · Time limit reached' : ''}{mutation.incomplete ? ' · Incomplete' : ' · Selected scope complete'}. Raw counts, not a relevant non-equivalent mutation score.</p>{mutation.scope && <p className="text-sm text-muted-foreground">Scope: {mutation.scope.file} · {mutation.scope.kind === 'functions' ? mutation.scope.functions.join(', ') : 'Full-file fallback; direct function calls could not be resolved'}. Suite: approved generated tests. Function selection does not establish whole-file coverage.</p>}{mutation.totalMutants !== undefined && mutation.totalMutants > mutation.mutants.length && <p>Showing {mutation.mutants.length} of {mutation.totalMutants} discovered mutants.</p>}{!!mutation.scope?.setupFiles?.length && <p className="text-sm text-muted-foreground">Representative original modules load directory setup; their test functions are deselected. Collection hooks and module import effects can influence raw outcomes: {mutation.scope.setupFiles.join(', ')}.</p>}<pre className="whitespace-pre-wrap text-xs">{mutation.log}</pre></div>)}<MutationReview report={selected} />{!selected.mutations.length && <p>Not executed: requires passing tests and a mapped source file.</p>}</details>
      <details><summary className="cursor-pointer">Generated tests and review</summary>{selected.tests.map((test) => <section key={test.id} className="my-4"><p>{test.id} → {test.behaviorId} · {test.approved ? 'Supported by review' : 'Blocked'} · {test.review}</p><pre className="whitespace-pre-wrap text-xs">{test.code}</pre></section>)}</details>
      {!!latest?.runtimeArtifacts?.length && <details><summary>Runtime SQLite outputs</summary><p>New SQLite databases created in the disposable test copy are recorded separately. Original source and generated test files must remain unchanged. Database contents are not exported.</p>{latest.runtimeArtifacts.map(artifact => <p className="text-xs break-all" key={artifact.file}>{artifact.file} · SHA-256: {artifact.sha256}</p>)}</details>}
      <details><summary className="cursor-pointer">Logs, provenance and limits</summary><p>SHA-256: {selected.fingerprint}</p><p>Model: {selected.model}</p><p>Test collection</p><pre className="whitespace-pre-wrap text-xs">{selected.collection?.log || 'No collection log recorded.'}</pre><p>Existing-test baseline</p><pre className="whitespace-pre-wrap text-xs">{selected.baseline?.log || 'No baseline log recorded.'}</pre><p>Latest execution</p><pre className="whitespace-pre-wrap text-xs">{latest?.log || 'No execution log recorded.'}</pre><ul>{selected.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></details>
      {!busy && <div className="flex gap-3"><Button variant="outline" onClick={() => download('verification.json', JSON.stringify(selected, null, 2))}>Download evidence</Button><Button variant="outline" disabled={!selected.tests.some((test) => test.approved)} onClick={downloadTests}>Download generated tests</Button></div>}
    </>}
  </section>;
}
