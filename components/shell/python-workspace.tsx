"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PythonReport } from "@/lib/python-types";
import type { RequirementDocument } from "@/lib/requirements";
import { documentText, requirementTextLimit } from "@/lib/requirement-input";
import { uncertainOcr } from "@/lib/document-selection";
import { DocumentExtraction } from "./document-extraction";
import type { ProjectSetup } from "@/lib/project-setup";
import Link from "next/link";
import type { GitHubConnectionStatus } from "@/lib/github-config";
import { RuntimeStatus, useRuntimeHealth } from "./runtime-health";

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
  const [comparison, setComparison] = useState<PythonReport>();
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
    setSelected(undefined); setError(''); setDocument(undefined); setRequirements(''); setSetup(undefined); setParent(previous); setComparison(previous);
  }
  async function run(event: FormEvent<HTMLFormElement>) {
    if (!canSubmit) { event.preventDefault(); setError('Check runtime status and restore the required services before submitting. Your inputs are retained.'); return; }
    event.preventDefault(); setError(''); setBusy(true); onRunningChange(true); setSelected(undefined); setStage('Import project');
    const controller = new AbortController(); execution.current = controller;
    const form = new FormData(event.currentTarget); form.set('model', model);
    if (document) form.set('documentId', document.id);
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
  const latest = selected?.measurements.at(-1);
  const initialFailure = selected?.collection?.timedOut || [1, 2, 3, 4].includes(selected?.collection?.exitCode || 0) || selected?.baseline?.timedOut || selected?.baseline?.integrity === false || [1, 2, 3, 4].includes(selected?.baseline?.exitCode || 0) || selected?.baseline?.outcomes.some((outcome) => ['failed', 'error'].includes(outcome.status));
  const unclear = selected?.analysis?.behaviors.filter(behavior => behavior.issue !== 'none') || [];
  const failed = latest?.outcomes.filter(outcome => ['failed', 'error'].includes(outcome.status)) || [];
  const nextAction = selected?.status === 'running' ? (runtimeStatus.error || !health ? 'Runtime status is unavailable. The saved task is retained; refresh status to check progress.' : health.worker !== 'online' ? 'No recent worker heartbeat. Your task is saved and waiting for a worker or recovery.' : selected.execution?.attempt === 0 ? 'Your task is queued and waiting for an available worker. You can reconnect from history.' : 'Verification is running. You can leave this page and reconnect from history.') : initialFailure ? 'Review environment and existing-test failures in Evaluation. Fix project setup before relying on results.' : selected?.status === 'failed' || selected?.status === 'cancelled' ? 'Review the saved error and partial evidence, then start a new run.' : unclear.length ? 'Clarify the flagged requirements, then re-run against the same saved code.' : failed.length ? 'Review the failing assertions and diagnoses against the original requirements.' : selected?.states.some(state => state.status !== 'Verified') ? 'Review the remaining gaps and blocked tests before accepting the result.' : 'Inspect the evidence and download the tests for your project. Passing checks do not prove exhaustive correctness.';
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
      {parent ? <div className="space-y-3 border rounded p-4"><p>Reusing the saved code snapshot from {parent.title}. The previous report stays unchanged.</p><p>{parent.source}</p><details><summary>Previous requirements</summary><div className="max-h-64 overflow-auto">{parent.rules.map(rule => <blockquote key={rule.id}>{rule.id}: {rule.text}</blockquote>)}</div></details><label className="block">Clarification — additional requirements, one per line<Textarea name="clarification" rows={4} maxLength={4000} placeholder="State the intended rule that resolves the earlier ambiguity. These statements become new requirements in this run." /></label></div> : <>
        <fieldset aria-label="Project configuration" className="space-y-5" disabled={checking} onChange={() => setSetup(undefined)}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block space-y-2">GitHub repository<Input name="repository" type="url" placeholder="https://github.com/owner/repository" /></label>
            <label className="block space-y-2">Or upload a project ZIP<FileInput name="project" accept=".zip" /></label>
            <label>Branch, tag or commit (optional)<Input name="ref" placeholder="Default branch" /></label>
            <label>Project directory (optional)<Input name="projectDirectory" maxLength={200} placeholder="backend" /><span className="text-xs text-muted-foreground">Relative to the repository or ZIP root. Leave empty for the root. Only this directory is analyzed and executed.</span></label>
            <div className="space-y-2"><label className="flex gap-2 items-center"><input type="checkbox" name="useConnectedGitHub" value="true" checked={connectedGitHub} disabled={!github?.configured || !github.connected} onChange={event => setConnectedGitHub(event.target.checked)} />Use connected GitHub account</label><p className="text-xs text-muted-foreground">{github?.connected ? 'Credentials stay on the server.' : 'Public repositories need no connection.'} <Link className="underline" href="/account">Manage GitHub connection</Link></p></div>
            {!connectedGitHub && <label>Temporary GitHub token (optional)<Input name="githubToken" type="password" autoComplete="off" placeholder="Read-only access to selected repositories" /><span className="text-xs text-muted-foreground">Used only to download the snapshot; never stored or sent to the model.</span></label>}
          </div>
          <details className="border rounded p-4">
            <summary className="cursor-pointer font-semibold">Advanced settings</summary>
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">Defaults: automatic runtime detection, no dependency installation and no test services. Collapsing this panel keeps your selections.</p>
              <div className="space-y-2"><label htmlFor="project-runtime">Runtime</label><NativeSelect id="project-runtime" name="runtime" defaultValue="auto"><NativeSelectOption value="auto">Detect automatically</NativeSelectOption><NativeSelectOption value="python">Python / pytest</NativeSelectOption><NativeSelectOption value="node">JavaScript or TypeScript / node:test</NativeSelectOption></NativeSelect></div>
              <p className="text-sm text-muted-foreground">Sandbox images are managed on the server. Each run records its pinned image.</p>
              <label className="flex gap-2"><input name="automaticSetup" type="checkbox" value="true" />Install declared registry dependencies automatically</label>
              <p className="text-sm text-muted-foreground">Python uses compatible wheels; Node.js requires package-lock.json. Native builds, Git/file dependencies and install scripts require a custom image.</p>
              <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Test services</legend>{[['postgres', 'PostgreSQL', 'DATABASE_URL'], ['redis', 'Redis', 'REDIS_URL']].map(([value, label, variable]) => <label className="flex gap-2" key={value}><input name="service" type="checkbox" value={value} />Disposable {label} ({variable})</label>)}</fieldset>
              <p className="text-sm text-muted-foreground">These are temporary services for the project under test, separate from ReqTest storage. They start fresh for each tool execution on a private network and are removed afterward.</p>
            </div>
          </details>
          <Button type="button" variant="outline" onClick={checkSetup}>{checking ? 'Checking project…' : 'Check project setup'}</Button>
        </fieldset>
        {setup && <div className="border rounded p-4 space-y-2"><p>Project setup: {setup.setup.status} · {setup.runtime === "node" ? "Node.js" : "Python"} {setup.setup.python}</p>{setup.setup.checks.map((check, i) => <p key={i} className={check.status === 'failed' ? 'text-red-400' : 'text-muted-foreground'}>{check.status} · {check.label}: {check.detail}</p>)}{setup.automaticSetup && <details><summary>Installed dependency versions ({setup.installed.length})</summary>{setup.installed.map(dependency => <p className="text-xs" key={dependency}>{dependency}</p>)}{!setup.installed.length && <p>No additional declared dependencies were installed.</p>}</details>}{setup.setup.limitations.map(limit => <p className="text-xs text-muted-foreground" key={limit}>{limit}</p>)}{setup.setup.status === 'needs_setup' && <label className="flex gap-2"><input type="checkbox" name="allowEnvironmentFailure" value="true" />Run anyway to diagnose environment failures</label>}</div>}
        <label className="block space-y-2">Requirement file (optional)<FileInput accept=".pdf,.doc,.docx,.txt,.md" disabled={extracting} onChange={event => extract(event.target.files?.[0])} /></label>
        {extracting && <p role="status">Extracting requirement text…</p>}
        <label className="block space-y-2">Requirements<Textarea name="requirements" required value={requirements} onChange={event => setRequirements(event.target.value)} disabled={extracting} rows={10} placeholder="Upload a requirement file to fill this field, or describe intended behavior, boundaries and exception rules." /></label>
        <p className={'text-sm ' + (requirements.length > requirementTextLimit ? 'text-red-400' : 'text-muted-foreground')}>{requirements.length.toLocaleString('en-US')} / 12,000 characters{requirements.length > requirementTextLimit ? ' · Shorten the text before running. The uploaded content has not been truncated.' : ''}</p>
        {document && (document.warnings.length > 0 || document.segments.some(uncertainOcr)) && <p role="status" className="text-sm text-red-400">The document has extraction warnings or uncertain OCR text. Review source details and correct the text before running.</p>}
        {document && <details className="border rounded p-4 space-y-3"><summary className="cursor-pointer">{document.fileName} · Source and extraction details</summary><div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">{requirements === documentText(document) ? 'All extracted text was copied into Requirements. You can edit it directly.' : 'Requirements have been edited. Only unchanged original excerpts retain source citations.'}</p><DocumentExtraction document={document} /><a className="inline-block underline text-sm" href={'/api/requirements?id=' + document.id}>Download original document</a>{document.segments.some(segment => segment.extraction === 'ocr') && <p className="text-sm text-muted-foreground">OCR text may contain transcription errors. Compare uncertain excerpts with the original before running.</p>}</div></details>}

      </>}
      <p className="text-sm text-muted-foreground">Submit only approved project data. Source code, tests and project documentation are sent to the selected model. Tests execute in Docker. Automatic setup installs registry dependencies without running project install scripts.</p>
      {!modelReady && <p role="status">Configure OPENAI_API_KEY in the root .env.local, then restart.</p>}
      <Button disabled={!canSubmit || !model.trim() || extracting || checking || (!parent && (!requirements.trim() || requirements.length > requirementTextLimit))}>{health?.worker === 'online' ? 'Run verification' : 'Queue verification'}</Button>
    </form>
    <div className="flex flex-wrap gap-3 items-center">
      <label htmlFor="python-history">Your runs</label><NativeSelect id="python-history" disabled={busy} value={selected?.id || ''} onChange={(event) => setSelected(runs.find((run) => run.id === event.target.value))}><NativeSelectOption value="">New verification</NativeSelectOption>{runs.map((run) => <NativeSelectOption key={run.id} value={run.id}>{run.title} · {run.status === 'running' && !busy ? 'Running / incomplete' : run.status}</NativeSelectOption>)}</NativeSelect>
      {selected && !busy && <Button variant="outline" onClick={() => newVerification()}>New verification</Button>}
      {selected && !busy && <Button variant="outline" onClick={() => newVerification(selected)}>Clarify and re-run</Button>}
      {busy && <Button variant="destructive" onClick={stop}>Stop</Button>}
      {busy && <p role="status">{stage}…</p>}
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {selected && <>
      {initialFailure && <p role="status" className="text-red-400">Existing-test checks need attention. Open Evaluation to inspect failure diagnoses and execution logs.</p>}
      <header><h2 className="text-2xl font-bold">{selected.title} · {selected.status}</h2><p className="text-sm text-muted-foreground">{selected.source}</p>{latest && <p className="mt-3 text-sm">{latest.outcomes.length} recorded checks · {latest.outcomes.filter((outcome) => outcome.status === 'passed').length} passed · <span className={latest.outcomes.some((outcome) => outcome.status === 'failed') ? 'text-red-400' : ''}>{latest.outcomes.filter((outcome) => outcome.status === 'failed').length} failed</span> · {latest.outcomes.filter((outcome) => outcome.status === 'error').length} execution errors</p>}{selected.error && <p role="alert" className="text-red-400">{selected.error}</p>}</header>
      <section className="border rounded p-5 space-y-3">
        <h3 className="font-bold text-lg">Verification summary</h3>
        {selected.execution && <p className="text-sm text-muted-foreground">{selected.status === 'running' ? selected.stage + '. ' : ''}{selected.execution.recovered ? `Worker recovery attempt ${selected.execution.attempt}. Saved checkpoints are reused when available.` : selected.execution.attempt ? 'Processed by the background verification worker.' : 'Queued. Waiting for an available background worker.'}</p>}
        <p>{selected.rules.length} requirement statements · {selected.analysis?.behaviors.length || 0} behaviors analyzed · {selected.tests.filter(test => test.approved).length} supported test artifacts · {failed.length} failed/error outcomes</p>
        <p>{unclear.length} behaviors need clarification · {selected.tests.filter(test => !test.approved).length} test artifacts blocked by review</p>
        <p><strong>Next action:</strong> {nextAction}</p>
        {selected.requirementDocument && <p className="text-sm">Document scope: {selected.requirementDocument.selectedBlocks} of {selected.requirementDocument.totalBlocks} original text blocks linked from {selected.requirementDocument.fileName}. Edited text without an exact match has no original-block citation.</p>}
        {selected.parentRunId && comparison?.id === selected.parentRunId && <details><summary>Compare with previous run</summary><p>Previous: {comparison.status}, {comparison.measurements.at(-1)?.outcomes.length || 0} recorded outcomes, {comparison.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Current: {selected.status}, {latest?.outcomes.length || 0} recorded outcomes, {selected.states.filter(state => state.status === 'Verified').length} verified behaviors.</p><p>Same source fingerprint: {comparison.fingerprint === selected.fingerprint ? 'Yes' : 'No'}. Requirements may have changed; this is a run comparison, not an independent improvement score.</p></details>}
      </section>
      <Button disabled={busy} onClick={() => onOpenEvaluation(selected.id)}>View results in Evaluation</Button>
      <p className="text-sm text-muted-foreground">Requirement states, test results, generated tests and detailed evidence are available in Evaluation.</p>
    </>}
  </section>;
}
