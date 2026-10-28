"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileText, FolderGit2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PythonReport } from "@/lib/python-types";
import type { RequirementDocument } from "@/lib/requirements";
import { documentText, requirementTextLimit, parseRequirementInput } from "@/lib/requirement-input";
import { uncertainOcr } from "@/lib/document-selection";
import { DocumentExtraction } from "./document-extraction";
import type { ProjectSetup } from "@/lib/project-setup";
import Link from "next/link";
import type { GitHubConnectionStatus } from "@/lib/github-config";
import { RuntimeStatus, useRuntimeHealth } from "./runtime-health";
import { VerificationGuide } from './verification-guide';

export function PythonWorkspace({ model, configured, onRunningChange, onOpenEvaluation }: { model: string; configured: boolean; onRunningChange: (running: boolean) => void; onOpenEvaluation: (runId: string) => void }) {
  const runtimeStatus = useRuntimeHealth();
  const { health } = runtimeStatus;
  const modelReady = health?.modelConfigured ?? configured;
  const canSubmit = !!health && health.queue !== "unavailable" && health.sandbox === "available" && modelReady;
  const [runs, setRuns] = useState<PythonReport[]>([]);
  const [selected, setSelected] = useState<PythonReport>();
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<RequirementDocument>();
  const [requirements, setRequirements] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [setup, setSetup] = useState<ProjectSetup>();
  const [checking, setChecking] = useState(false);
  const [github, setGitHub] = useState<GitHubConnectionStatus>();
  const [connectedGitHub, setConnectedGitHub] = useState(false);
  useEffect(() => { fetch('/api/account/github', { cache: 'no-store' }).then(response => response.ok ? response.json() : undefined).then(setGitHub).catch(() => {}); }, []);
  const [parent, setParent] = useState<PythonReport>();
  const formRef = useRef<HTMLFormElement>(null);
  const execution = useRef<AbortController | null>(null);
  const history = useCallback(async () => {
    const response = await fetch('/api/python', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load your verification history.');
    const next: PythonReport[] = await response.json(); setRuns(next);
    const running = next.some(run => run.status === 'running'); setBusy(running); onRunningChange(running);
  }, [onRunningChange]);
  useEffect(() => {
    let active = true;
    fetch('/api/python', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Cannot load your verification history.');
      const runs: PythonReport[] = await response.json(); if (active) { setRuns(runs); const running = runs.find(run => run.status === 'running'); if (running) { setSelected(running); setBusy(true); onRunningChange(true); } }
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
    if (!file) return;
    setExtracting(true); setError('');
    try {
      const form = new FormData(); form.set('document', file);
      const response = await fetch('/api/requirements', { method: 'POST', body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setDocument(data);
      setRequirements(documentText(data));
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot extract this document.'); }
    finally { setExtracting(false); }
  }
  async function checkSetup() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    setChecking(true); setError(''); setSetup(undefined);
    try {
      const response = await fetch('/api/python/preflight', { method: 'POST', body: form });
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
  function newVerification(previous?: PythonReport) {
    setSelected(undefined); setError(''); setDocument(undefined); setRequirements(''); setSetup(undefined); setParent(previous);
  }
  async function run(event?: FormEvent<HTMLFormElement>, saved?: PythonReport) {
    if (!(saved ? health && health.queue !== 'unavailable' && health.sandbox === 'available' : canSubmit)) { event?.preventDefault(); setError('Check runtime status and restore the required services before submitting. Your inputs are retained.'); return; }
    event?.preventDefault(); setError(''); setBusy(true); onRunningChange(true); setSelected(undefined); setStage('Import project');
    const controller = new AbortController(); execution.current = controller;
    const form = saved ? new FormData() : new FormData(event!.currentTarget); form.set('model', model);
    if (saved) { form.set('mode', 'saved_tests'); form.set('parentRunId', saved.id); form.set('reuseRequirements', 'true'); form.set('title', saved.title.slice(0, 100) + ' - saved tests'); }
    if (document) form.set('documentId', document.id);
    if (setup) form.set('preflightId', setup.id);
    if (parent && !saved) { form.set('parentRunId', parent.id); form.set('reuseRequirements', 'true'); }
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
  let inputPreview: ReturnType<typeof parseRequirementInput> | undefined;
  if (requirements.trim() && requirements.length <= requirementTextLimit) inputPreview = parseRequirementInput(requirements);
  return <section className="min-w-0 space-y-5 [overflow-wrap:anywhere] [&_details]:min-w-0 [&_pre]:max-w-full [&_pre]:max-h-80 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_[data-slot=native-select-wrapper]]:max-w-full">
    <header className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Project verification</h1><p className="text-muted-foreground">Check your project against its requirements.</p></header>
    <RuntimeStatus {...runtimeStatus} />
    <form noValidate ref={formRef} key={parent?.id || 'new'} onSubmit={run} className="space-y-4" hidden={busy || Boolean(selected)}>
      <div className={parent ? '' : 'grid items-stretch gap-5 lg:grid-cols-2'}>
        <Card>
          <CardHeader className="p-5 pb-4"><CardTitle role="heading" aria-level={2} className="flex items-center gap-3 text-lg"><FolderGit2 aria-hidden="true" className="size-5 text-primary" /><span>01 <span className="ml-2">Project</span></span></CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            {parent ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Reusing the saved source snapshot. The original run stays unchanged.</p><p className="text-sm">{parent.source}</p><details className="text-sm"><summary className="cursor-pointer">Previous requirements</summary><div className="mt-3 max-h-64 overflow-auto">{parent.rules.map(rule => <blockquote key={rule.id}>{rule.id}: {rule.text}</blockquote>)}</div></details><label className="block space-y-2 text-sm">Clarification<Textarea name="clarification" rows={4} maxLength={4000} placeholder="Add requirements that clarify the earlier result, one per line." /></label></div> : <fieldset aria-label="Project configuration" className="space-y-4" disabled={checking} onChange={() => setSetup(undefined)}>
              <label className="block space-y-2 text-sm">GitHub repository<Input name="repository" type="url" placeholder="https://github.com/owner/repository" /></label>
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Upload a project ZIP instead</summary><div className="mt-3"><FileInput name="project" accept=".zip" /></div></details>
              <details className="rounded-lg border border-border border-dashed px-3 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Project options</summary>
                <div className="mt-4 space-y-4">
                  <label className="block space-y-2">Branch, tag or commit<Input name="ref" placeholder="Default branch" /></label>
                  <label className="block space-y-2">Project directory<Input name="projectDirectory" maxLength={200} placeholder="Repository root" /><span className="text-xs text-muted-foreground">Optional subdirectory to analyze.</span></label>
                  <div className="space-y-2"><label className="flex gap-2 items-center"><input type="checkbox" name="useConnectedGitHub" value="true" checked={connectedGitHub} disabled={!github?.configured || !github.connected} onChange={event => setConnectedGitHub(event.target.checked)} />Use connected GitHub account</label><p className="text-xs text-muted-foreground">{github?.connected ? 'Credentials stay on the server.' : 'Public repositories need no connection.'} <Link className="underline" href="/account">Manage connection</Link></p></div>
                  {!connectedGitHub && <label className="block space-y-2">Temporary GitHub token<Input name="githubToken" type="password" autoComplete="off" placeholder="Read-only repository token" /><span className="text-xs text-muted-foreground">Download only. Never stored or sent to the model.</span></label>}
                </div>
              </details>
              <details className="rounded-lg border border-border border-dashed px-3 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Environment & dependencies</summary>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2"><label htmlFor="project-runtime">Runtime</label><NativeSelect id="project-runtime" name="runtime" defaultValue="auto"><NativeSelectOption value="auto">Detect automatically</NativeSelectOption><NativeSelectOption value="python">Python / pytest</NativeSelectOption><NativeSelectOption value="node">JavaScript or TypeScript / node:test</NativeSelectOption></NativeSelect></div>
                  <label className="flex gap-2"><input name="automaticSetup" type="checkbox" value="true" />Install declared registry dependencies</label>
                  <p className="text-xs text-muted-foreground">Compatible Python wheels or locked npm packages. Native builds and install scripts require a prepared image.</p>
                  <fieldset className="space-y-2"><legend className="mb-2 font-medium">Temporary test services</legend>{[['postgres', 'PostgreSQL', 'DATABASE_URL'], ['redis', 'Redis', 'REDIS_URL']].map(([value, label, variable]) => <label className="flex gap-2" key={value}><input name="service" type="checkbox" value={value} />{label} ({variable})</label>)}</fieldset>
                  <p className="text-xs text-muted-foreground">Services start fresh on an isolated network and are removed after execution. The sandbox image is pinned for each run.</p>
                </div>
              </details>
              <Button type="button" variant="outline" className="w-full" onClick={checkSetup}>{checking ? 'Checking project…' : 'Check project setup'}</Button>
            </fieldset>}
            {setup && <div className="rounded-lg border p-3 space-y-2 text-sm"><p>Setup: {setup.setup.status} · {setup.runtime === 'node' ? 'Node.js' : 'Python'} {setup.setup.python}</p>{setup.setup.checks.filter(check => check.status === 'failed').map((check, index) => <p role="alert" className="text-red-400" key={index}>{check.label}: {check.detail}</p>)}<details><summary className="cursor-pointer">Setup details</summary><div className="mt-3 space-y-2">{setup.setup.checks.map((check, i) => <p key={i} className={check.status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}>{check.status} · {check.label}: {check.detail}</p>)}{setup.automaticSetup && <details><summary>Installed versions ({setup.installed.length})</summary>{setup.installed.map(dependency => <p className="text-xs" key={dependency}>{dependency}</p>)}{!setup.installed.length && <p>No additional dependencies installed.</p>}</details>}{setup.setup.limitations.map(limit => <p className="text-xs text-muted-foreground" key={limit}>{limit}</p>)}</div></details>{setup.setup.status === 'needs_setup' && <label className="flex gap-2 text-red-400"><input type="checkbox" name="allowEnvironmentFailure" value="true" />Run anyway to diagnose environment failures</label>}</div>}
            <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Run name</summary><label className="mt-3 block space-y-2"><span className="sr-only">Run name</span><Input name="title" required maxLength={120} defaultValue={parent ? parent.title + ' — re-run' : 'Project verification'} /></label></details>
          </CardContent>
        </Card>
        {!parent && <Card>
          <CardHeader className="p-5 pb-4"><CardTitle role="heading" aria-level={2} className="flex items-center gap-3 text-lg"><FileText aria-hidden="true" className="size-5 text-primary" /><span>02 <span className="ml-2">Requirements</span></span></CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <label className="block space-y-2 text-sm">Upload a document<FileInput accept=".pdf,.doc,.docx,.txt,.md" disabled={extracting} onChange={event => extract(event.target.files?.[0])} /></label>
            {extracting && <p role="status" className="text-sm">Extracting text…</p>}
            <label className="block space-y-2 text-sm"><span className="text-muted-foreground">or describe the expected behavior</span><Textarea name="requirements" required value={requirements} onChange={event => setRequirements(event.target.value)} disabled={extracting} rows={6} className="min-h-40 resize-y" placeholder="Describe expected behavior, boundaries and exceptions…" /></label>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span className={requirements.length > requirementTextLimit ? 'text-red-400' : ''}>{requirements.length.toLocaleString('en-US')} / 12,000 characters</span>{inputPreview && <span>{inputPreview.rules.length} {inputPreview.mode === 'numbered' ? 'numbered items' : 'input sections'}</span>}</div>
            {requirements.length > requirementTextLimit && <p role="alert" className="text-sm text-red-400">Shorten the text before running. Uploaded text has not been truncated.</p>}
            {inputPreview && inputPreview.rules.length > 24 && <p role="alert" className="text-sm text-red-400">Split the specification into runs of up to 24 requirement items. No text was truncated.</p>}
            {document && (document.warnings.length > 0 || document.segments.some(uncertainOcr)) && <p role="status" className="text-sm text-red-400">Extraction warnings or uncertain OCR. Review source details before running.</p>}
            {document && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">{document.fileName} · Source details</summary><div className="mt-3 space-y-3"><p className="text-muted-foreground">{requirements === documentText(document) ? 'Extracted text is editable.' : 'Only unchanged excerpts retain source citations.'}</p><DocumentExtraction document={document} /><a className="inline-block underline" href={'/api/requirements?id=' + document.id}>Download original document</a>{document.segments.some(segment => segment.extraction === 'ocr') && <p className="text-muted-foreground">Compare uncertain OCR text with the original.</p>}</div></details>}
          </CardContent>
        </Card>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <p className="max-w-xl text-xs text-muted-foreground">Project files and requirements are sent to the selected model. Tests run in Docker.</p>
        <Button size="lg" className="h-12 w-full px-7 sm:w-auto" disabled={!canSubmit || !model.trim() || extracting || checking || (!parent && (!requirements.trim() || requirements.length > requirementTextLimit || (inputPreview?.rules.length || 0) > 24))}>{health?.worker === 'online' ? 'Run verification' : 'Queue verification'}<ArrowRight aria-hidden="true" /></Button>
      </div>
      {!modelReady && <p role="status" className="text-sm text-red-400">Set OPENAI_API_KEY on the server, then restart.</p>}
    </form>
    {!busy && !selected && <VerificationGuide />}
    <div className="flex flex-wrap items-center gap-3 border-t pt-5 text-sm">
      <label htmlFor="python-history" className="font-medium">Recent runs</label><NativeSelect id="python-history" className="max-w-full sm:max-w-md" disabled={busy} value={selected?.id || ''} onChange={event => setSelected(runs.find(run => run.id === event.target.value))}><NativeSelectOption value="">New verification</NativeSelectOption>{runs.map(run => <NativeSelectOption key={run.id} value={run.id}>{run.title} · {run.status === 'running' && !busy ? 'Running / incomplete' : run.status}</NativeSelectOption>)}</NativeSelect>
      {selected && !busy && <Button variant="outline" onClick={() => newVerification()}>New verification</Button>}
      {selected && !busy && <Button variant="outline" onClick={() => newVerification(selected)}>Regenerate / clarify</Button>}
      {selected && !busy && <Button variant="outline" disabled={!selected.tests.some(test => test.approved) || selected.status === 'running'} onClick={() => run(undefined, selected)}>Re-run saved tests</Button>}
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {(busy || selected) && <Card>
      <CardHeader className="p-5 pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle role="heading" aria-level={2} className="text-xl">{selected?.title || 'Starting verification'}</CardTitle><Badge variant={selected?.status === 'failed' ? 'destructive' : 'outline'}>{selected?.status || 'running'}</Badge></div></CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        {selected?.error && <p role="alert" className="text-red-400">{selected.error}</p>}
        {busy || selected?.status === 'running' ? <div className="flex flex-wrap items-center justify-between gap-4">
          <p role="status" className="flex min-w-0 items-center gap-3 text-muted-foreground"><Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin text-primary" /><span>{stage || selected?.stage || 'Import project'}…</span></p>
          <Button variant="destructive" disabled={!selected || stage === 'Stopping'} onClick={stop}>{stage === 'Stopping' ? 'Stopping…' : 'Stop'}</Button>
        </div> : selected && <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Test results and evidence are available in Evaluation.</p>
          <Button className="h-11 w-full sm:w-auto" onClick={() => onOpenEvaluation(selected.id)}>View results<ArrowRight aria-hidden="true" /></Button>
        </div>}
      </CardContent>
    </Card>}
  </section>;
}
