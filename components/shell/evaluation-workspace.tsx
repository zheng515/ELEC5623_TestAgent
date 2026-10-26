"use client";
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DocumentExtraction, OcrConfidence, OriginalPageLink } from './document-extraction';
import { outcomeCounts, requirementStates, verificationSummary } from '@/lib/run-evaluation';
import type { PythonReport } from '@/lib/python-types';
import { ruleSources } from '@/lib/requirement-input';
import { testArchive } from '@/lib/test-export';
import { survivorLabels, survivorReviews } from '@/lib/mutation-review';

function Distribution({ title, description, data }: { title: string; description: string; data: { name: string; value: number }[] }) {
  return <section className="min-w-0 rounded-xl border p-5 space-y-3">
    <h2 className="font-semibold text-lg">{title}</h2><p className="text-sm text-muted-foreground">{description}</p>
    <div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 35, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#303030" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: '#b5b5b5', fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={135} tick={{ fill: '#ddd', fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#18203a' }} contentStyle={{ background: '#171717', borderColor: '#404040', color: '#fff' }} />
        <Bar dataKey="value" name="Count" fill="#5485ff" radius={[0, 4, 4, 0]} maxBarSize={22}><LabelList dataKey="value" position="right" fill="#fff" /></Bar>
      </BarChart>
    </ResponsiveContainer></div>
    <p className="text-xs text-muted-foreground">{data.map(item => `${item.name}: ${item.value}`).join(' · ')}</p>
  </section>;
}

function MutationReview({ report }: { report: PythonReport }) {
  const rows = survivorReviews(report);
  if (!rows.length) return report.mutations.at(-1)?.incomplete ? <p>No surviving outcomes were recorded in the incomplete latest attempt. Missing outcomes do not resolve earlier survivors or gaps.</p> : null;
  return <section className="my-3 space-y-2">
    <p>Current surviving mutants: {rows.length}. {Object.entries(survivorLabels).map(([category, label]) => `${label}: ${rows.filter(row => row.category === category).length}`).join(' · ')}.</p>
    <p className="text-sm text-muted-foreground">Each mapped behavior needs its own judgment for the exact saved diff; a judgment for one behavior never clears another. Unspecified details are not equivalent code; independent review is still required.</p>
    {rows.map(({ mutant, reviews, category }) => <details key={mutant.id}><summary className="cursor-pointer">{mutant.id} · {survivorLabels[category]}</summary>
      {reviews.length ? reviews.map(({ behavior, decision }) => <div key={behavior.id}>
        <p>{behavior.id}: {decision ? `${decision.relevant ? 'relevant' : 'not relevant'}. ${decision.reason}` : 'No unique grounded review matches this behavior, file and diff. No exclusion or verification credit is granted.'}</p>
        {decision && <blockquote className="whitespace-pre-wrap text-sm text-muted-foreground">{decision.quote}</blockquote>}
      </div>) : <p>No behavior is mapped to this file. No exclusion or verification credit is granted.</p>}
      <pre className="whitespace-pre-wrap text-xs">{mutant.diff || 'Mutation diff unavailable.'}</pre>
    </details>)}
  </section>;
}

export function EvaluationWorkspace({ initialRunId = '' }: { initialRunId?: string }) {
  const [reports, setReports] = useState<PythonReport[]>([]);
  const [selectedId, setSelectedId] = useState(initialRunId);
  const [filter, setFilter] = useState('All');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const evaluation = report && verificationSummary(report);
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'verification.json'; link.click(); URL.revokeObjectURL(url);
  }
  async function downloadTests() {
    if (!report) return;
    const url = URL.createObjectURL(await testArchive(report).generateAsync({ type: 'blob' }));
    const link = document.createElement('a'); link.href = url; link.download = 'reqtest_tests.zip'; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Evaluation</h1><p className="text-muted-foreground mt-2">Requirement states, test results and evidence for your project runs.</p></div><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Loading…' : 'Refresh runs'}</Button></div>
    {error && <p role="alert" className="border rounded p-4">{error} Saved results below may be out of date.</p>}
    {!report && !loading && !error && <div className="border rounded-xl p-8 space-y-2"><h2 className="font-semibold">No project runs yet</h2><p className="text-muted-foreground">Start a run in Project verification. Its requirements, test results and evidence will appear here.</p></div>}
    {report && evaluation && <>
      <label className="block space-y-2 [&>div]:max-w-full"><span>Project run · {reports.length} available</span><NativeSelect aria-label="Project run" value={report.id} onChange={event => { setSelectedId(event.target.value); setFilter('All'); }}>{reports.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.title} · {new Date(item.createdAt).toLocaleString()} · {item.status}</NativeSelectOption>)}</NativeSelect></label>
      <section className="border rounded-xl p-5 space-y-2">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">{report.title}</h2><span className="rounded bg-accent px-3 py-1 text-sm">{report.status} · {report.stage}</span></div>
        <p className="text-sm text-muted-foreground break-all">{report.source}</p><p className="text-sm text-muted-foreground">{report.model} · {new Date(report.createdAt).toLocaleString()}{report.elapsedMs !== undefined && ` · ${(report.elapsedMs / 1000).toFixed(1)} seconds`}</p>
        {report.error && <p role="status">{report.error}</p>}
        {report.status !== 'completed' && <p>This run is {report.status}. Any recorded outcomes below are provisional or partial.</p>}
      </section>
      <section className="border rounded-xl p-5 space-y-2"><h2 className="font-semibold text-lg">{evaluation.title}</h2><p><strong>Next action:</strong> {evaluation.next}</p><p className="text-sm text-muted-foreground">Workflow status, test outcomes and requirement verification are separate. Completed means processing ended.</p>
        {!!evaluation.unmapped.length && <p role="status">Not analyzed: {evaluation.unmapped.map(rule => rule.originalId || rule.id).join(', ')}. These items have no behavior mapping and are not verified.</p>}
        {!!evaluation.preserved.length && <p>{evaluation.preserved.length} failing {evaluation.preserved.length === 1 ? 'check was' : 'checks were'} retained unchanged after the Agent flagged potential implementation defects. Review the original assertions before changing them.</p>}
      </section>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
        ['Passed tests', evaluation.passed, 'Latest recorded execution'],
        ['Failed / errors', evaluation.failedCount + evaluation.errors, `${evaluation.failedCount} failed · ${evaluation.errors} errors`],
        ['Skipped tests', evaluation.skipped, 'Skipped cases are not passes'],
        ['Approved test files', evaluation.approved, `${evaluation.blocked} blocked or awaiting review`],
      ].map(([label, value, detail]) => <div key={label} className="border rounded-xl p-5 space-y-2"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div>)}</div>
      <div className="grid xl:grid-cols-2 gap-4">
        <Distribution title="Requirement states" description="Aggregated from mapped behavior assessments and recorded execution evidence." data={evaluation.distribution} />
        {evaluation.latest ? <Distribution title="Latest test outcomes" description="Outcomes include existing and approved generated tests. Errors and skipped cases are separate from passes." data={evaluation.outcomes} /> : <section className="border rounded-xl p-5 space-y-3"><h2 className="font-semibold text-lg">No test execution recorded</h2><p className="text-muted-foreground">No pass rate is available. Check blocked tests, setup errors and the saved run status below.</p></section>}
      </div>
      <section className="border rounded-xl p-5 space-y-4"><h2 className="text-lg font-semibold">Evidence checks</h2><p className="text-sm text-muted-foreground">Recorded provenance and execution checks, not an independent correctness or accuracy score.</p>
        <dl className="grid md:grid-cols-3 gap-5">
          <div><dt className="text-sm text-muted-foreground">Code snapshot</dt><dd>{report.fingerprint ? 'Fingerprint recorded' : 'Fingerprint missing'}</dd><dd className="text-xs text-muted-foreground">Identifies the saved source; not rechecked by this page.</dd></div>
          <div><dt className="text-sm text-muted-foreground">Requirement provenance</dt><dd>{report.requirementDocument ? `${evaluation.cited} / ${report.rules.length} source citations recorded` : 'User-provided requirement text'}</dd><dd className="text-xs text-muted-foreground">{report.requirementDocument ? `${report.requirementDocument.selectedBlocks} of ${report.requirementDocument.totalBlocks} original text blocks linked` : 'No uploaded document citation expected.'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Latest execution integrity</dt><dd>{!evaluation.latest ? 'Not checked' : evaluation.latest.integrity === true ? 'Passed recorded integrity check' : evaluation.latest.integrity === false ? 'Integrity check failed' : 'Integrity not recorded'}</dd><dd className="text-xs text-muted-foreground">{evaluation.latest?.timedOut ? 'Execution timed out.' : 'Checks saved artifacts, not semantic test adequacy.'}</dd></div>
        </dl>
        {report.collection?.timedOut ? <p>Test collection timed out. Inspect execution records.</p> : report.collection?.exitCode === 5 ? <p className="text-sm">No existing tests were collected. Generated tests are evaluated separately.</p> : !!report.collection?.exitCode && <p>Test collection failed (exit {report.collection.exitCode}). Inspect execution records.</p>}
        {report.baseline && <p className="text-sm">Existing-suite baseline: {outcomeCounts(report.baseline).map(item => `${item.value} ${item.name.toLowerCase()}`).join(' · ')}{(!report.baseline.integrity || report.baseline.timedOut || ![0, 5].includes(report.baseline.exitCode)) && ' · Baseline requires investigation.'}</p>}
        {report.requirementDocument && <details><summary className="cursor-pointer">Original document and extraction details</summary><a className="underline block my-3 text-sm" href={'/api/requirements?id=' + report.requirementDocument.id}>Download original requirement document</a><DocumentExtraction document={report.requirementDocument} /></details>}
      </section>
      <section className="space-y-3"><div className="flex flex-wrap justify-between items-center gap-3"><h2 className="text-lg font-semibold">Requirement traceability · {report.rules.length} input items / {report.analysis?.behaviors.length || 0} behaviors</h2><NativeSelect aria-label="Filter requirement state" value={filter} onChange={event => setFilter(event.target.value)}>{['All', ...requirementStates].map(state => <NativeSelectOption key={state}>{state}</NativeSelectOption>)}</NativeSelect></div><p className="text-sm text-muted-foreground">Verified applies to the recorded cases only. It does not establish complete specification coverage.</p>
        {evaluation.requirements.filter(rule => filter === 'All' || rule.status === filter).map(rule => <details key={rule.id} className="border rounded-lg p-4"><summary className="cursor-pointer">{rule.originalId && rule.originalId !== rule.id ? rule.originalId + " (" + rule.id + ")" : rule.id} · {rule.status} · {rule.behaviors.length} behaviors<span className="block text-sm text-muted-foreground mt-1 line-clamp-2">{rule.behaviors.map(behavior => behavior.text).join(" · ") || rule.text}</span></summary><div className="mt-4 space-y-4">
          <details><summary className="cursor-pointer">Submitted requirement text and source locations</summary><blockquote className="whitespace-pre-wrap max-h-64 overflow-auto text-sm mt-3">{rule.text}</blockquote>
          {ruleSources(rule).map(source => <p key={source.segmentId + ":" + (source.start || 0)} className="text-sm">{source.fileName} · {source.location}<OriginalPageLink documentId={source.documentId} page={source.page} /><OcrConfidence source={source} /></p>)}
          </details>
          {report.analysis?.inconsistencies.filter(item => item.ruleId === rule.id).map((item, index) => <p key={index} className="text-sm">Requirement conflict: {item.description}</p>)}
          {!rule.behaviors.length && <p>No behavior mapping was recorded for this requirement.</p>}
          {rule.behaviors.map(behavior => <div key={behavior.id} className="border-t pt-3 space-y-2 text-sm"><p className="font-semibold">{behavior.id} · {behavior.status} · {behavior.text}</p><p>{behavior.reason}</p><details><summary>Requirement excerpt</summary><blockquote className="border-l-2 border-primary pl-3 text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto mt-2">{behavior.quote}</blockquote></details>{behavior.outcomes.map(outcome => <p key={outcome.node} className="break-all">{outcome.status} · {outcome.node}</p>)}{behavior.evidence.length > 0 && <details><summary>Code and test citations ({behavior.evidence.length})</summary>{behavior.evidence.map((item, index) => <div key={index} className="mt-2"><p>{item.file}</p><pre className="whitespace-pre-wrap text-xs">{item.quote}</pre></div>)}</details>}{report.tests.some(test => test.behaviorId === behavior.id) && <details><summary>Generated test artifacts</summary>{report.tests.filter(test => test.behaviorId === behavior.id).map(test => <div key={test.id} className="mt-2"><p>{test.id} · {test.approved ? 'Approved' : 'Blocked or unreviewed'} · {test.purpose}</p><p>{test.review || 'No approval recorded.'}</p><pre className="whitespace-pre-wrap text-xs max-h-64 overflow-auto">{test.code}</pre></div>)}</details>}{behavior.gaps.length > 0 && <details><summary>Originally identified gaps ({behavior.gaps.length})</summary>{behavior.gaps.map((gap, index) => <p key={index}>{gap}</p>)}</details>}</div>)}
        </div></details>)}
        {!evaluation.requirements.some(rule => filter === 'All' || rule.status === filter) && <p className="text-muted-foreground">No requirements match this state.</p>}
      </section>
      <details className="border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Failures and Agent diagnoses ({evaluation.failed.length} latest failures / {report.diagnoses.length} diagnoses)</summary><div className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">Diagnoses are Agent assessments. The phase identifies which execution they concern.</p>{evaluation.failed.map(outcome => <div key={outcome.node}><p className="break-all">{outcome.status} · {outcome.node}</p><pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">{outcome.message}</pre></div>)}{report.diagnoses.map((diagnosis, index) => <div key={index} className="border-t pt-3 text-sm"><p>{diagnosis.phase || 'execution'} · {diagnosis.testId} · {diagnosis.category.replaceAll('_', ' ')}</p><p>{diagnosis.reason}</p><blockquote className="text-muted-foreground">{diagnosis.quote}</blockquote><pre className="whitespace-pre-wrap text-xs">{diagnosis.executionQuote}</pre></div>)}{report.improvements.map((improvement, index) => <p key={'improvement-' + index} className="text-sm">Improvement: {improvement.reason}</p>)}{!evaluation.failed.length && !report.diagnoses.length && <p className="text-sm text-muted-foreground">No failures or diagnoses were recorded.</p>}</div></details>
      {report.tests.some(test => !test.approved) && <details className="border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Blocked or unreviewed generated tests ({evaluation.blocked})</summary>{report.tests.filter(test => !test.approved).map(test => <p key={test.id} className="mt-3 text-sm">{test.id} · {test.purpose} · {test.review || 'No approval recorded.'}</p>)}</details>}
      <details className="border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Execution records and limitations</summary><div className="mt-4 space-y-3 text-sm break-all"><p>Run: {report.id}</p><p>Snapshot fingerprint: {report.fingerprint || 'Missing'}</p>{report.measurements.map((measurement, index) => <details key={index}><summary>Generated-suite execution {index + 1} · exit {measurement.exitCode}{measurement.timedOut ? ' · timed out' : ''}</summary><p>{outcomeCounts(measurement).map(item => `${item.name}: ${item.value}`).join(' · ')}</p><div className="max-h-64 overflow-auto space-y-2">{measurement.outcomes.map((outcome, index) => <details key={index}><summary>{outcome.status} · {outcome.node}</summary><pre className="text-xs whitespace-pre-wrap">{outcome.message || 'No diagnostic message recorded.'}</pre></details>)}</div><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{measurement.log}</pre></details>)}{report.collection && <details><summary>Test collection log</summary><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{report.collection.log}</pre></details>}{report.baseline && <details><summary>Existing-test baseline log</summary><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto">{report.baseline.log}</pre></details>}{evaluation.latest?.runtimeArtifacts?.map(artifact => <p key={artifact.file}>Runtime output: {artifact.file} · SHA-256: {artifact.sha256}</p>)}{report.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}</div></details>
      {report.requirementInput && <details className="border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Requirement input and analysis scope</summary><p className="my-3 text-sm">{report.requirementInput.mode === 'numbered' ? 'Explicit document IDs were grouped automatically, including repeated references.' : 'Unstructured input sections were sent for behavior analysis.'} Only mapped, executed cases can earn verification. Analysis is limited to 24 behaviors and generation to 16 proposals per request.</p>{report.requirementInput.context && <details><summary>Supporting text retained as context (not separately verified)</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{report.requirementInput.context}</pre></details>}<details><summary>Complete submitted text</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{report.requirementInput.text}</pre></details></details>}
      <details className="border rounded-xl p-5"><summary className="cursor-pointer font-semibold">Technical details</summary><div className="mt-4 space-y-4 text-sm">
      <details><summary className="cursor-pointer">Retrieved project evidence</summary><p className="text-sm text-muted-foreground">Documents retrieved for this run are retained in the evidence export. Retrieval does not establish that a requirement is correct.</p>{report.retrieval?.documents.map((document) => <section key={document.file} className="my-3"><p>{document.file}</p><p className="text-xs break-all">SHA-256: {document.sha256}</p><pre className="whitespace-pre-wrap text-xs mt-2">{document.text}</pre></section>)}{!report.retrieval?.documents.length && <p>No retrieved documents were recorded.</p>}</details>
      <details><summary className="cursor-pointer">Mutation measurements</summary>{report.mutations.map((mutation, i) => <div key={i}><p>Attempt {i + 1}: {mutation.mutants.filter((mutant) => mutant.status === 'killed').length} killed / {mutation.mutants.length} recorded; {mutation.mutants.filter((mutant) => mutant.status === 'survived').length} survived{mutation.timedOut ? ' · Time limit reached' : ''}{mutation.incomplete ? ' · Incomplete' : ' · Selected scope complete'}. Raw counts, not a relevant non-equivalent mutation score.</p>{mutation.scope && <p className="text-sm text-muted-foreground">Scope: {mutation.scope.file} · {mutation.scope.kind === 'functions' ? mutation.scope.functions.join(', ') : 'Full-file fallback; direct function calls could not be resolved'}. Suite: approved generated tests. Function selection does not establish whole-file coverage.</p>}{mutation.totalMutants !== undefined && mutation.totalMutants > mutation.mutants.length && <p>Showing {mutation.mutants.length} of {mutation.totalMutants} discovered mutants.</p>}{!!mutation.scope?.setupFiles?.length && <p className="text-sm text-muted-foreground">Representative original modules load directory setup; their test functions are deselected. Collection hooks and module import effects can influence raw outcomes: {mutation.scope.setupFiles.join(', ')}.</p>}<pre className="whitespace-pre-wrap text-xs">{mutation.log}</pre></div>)}<MutationReview report={report} />{!report.mutations.length && <p>Not executed: requires passing tests and a mapped source file.</p>}</details>
      </div></details>
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={download}>Download run evidence</Button><Button variant="outline" disabled={report.status === 'running' || !report.tests.some(test => test.approved)} onClick={downloadTests}>Download generated tests</Button></div>
    </>}
  </section>;
}
