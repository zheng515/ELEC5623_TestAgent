import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir, database, session } from "@/lib/auth";
import { enqueueRun, cancelRun, refreshQueuedRun } from "@/lib/run-queue";
import { sandboxImage } from "@/lib/python-tools";
import { prepareProject, copyPreparedProject } from "@/lib/project-setup";
import { repositoryToken } from "@/lib/github";
import { documentRules, loadRequirements } from "@/lib/requirements";
import { documentText, parseRequirementInput, ruleSources, sourceMatches } from "@/lib/requirement-input";
import { jobs, interruptedReport } from "@/lib/python-jobs";
import { sameOrigin } from "@/lib/request";
import type { PythonReport } from "@/lib/python-types";
import { interactivePolicy, verificationPolicySchema } from '@/lib/verification-policy';

export const runtime = "nodejs";
export async function GET(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const query = 'SELECT r.report, r.user_id FROM runs r WHERE r.user_id=$1';
  const { rows } = id ? await database.query(query + ' AND r.id=$2', [account.user.id, id]) : await database.query(query + ' ORDER BY r.created_at DESC, r.id DESC LIMIT 20', [account.user.id]);
  const reports = await Promise.all(rows.map(async ({ report, user_id }: { report: PythonReport; user_id: string }) => {
    if (report.execution) return refreshQueuedRun(report);
    if (report.status !== 'running' || jobs.active.get(user_id)?.id === report.id) return report;
    const result = await database.query("UPDATE runs SET report=$1 WHERE id=$2 AND user_id=$3 AND report->>'status'='running' RETURNING report", [JSON.stringify(interruptedReport(report)), report.id, user_id]);
    return result.rows[0]?.report || (await database.query('SELECT report FROM runs WHERE id=$1 AND user_id=$2', [report.id, user_id])).rows[0]?.report || report;
  }));
  if (id && !reports.length) return Response.json({ error: 'Report not found.' }, { status: 404 });
  return Response.json(id ? reports[0] : reports, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin execution is not allowed.' }, { status: 403 });
  try {
    const body = await request.json();
    if (!body || typeof body.id !== 'string' || !body.id || Object.keys(body).some(key => key !== 'id')) return Response.json({ error: 'Invalid stop request.' }, { status: 400 });
    const { id } = body;
    const job = jobs.active.get(account.user.id);
    if (job?.id === id) job.controller.abort();
    else {
      if (!await cancelRun(id, account.user.id)) return Response.json({ error: 'No active run found for your account.' }, { status: 404 });
    }
    return Response.json({ stopping: true });
  } catch { return Response.json({ error: 'Invalid stop request.' }, { status: 400 }); }
}
export async function POST(request: Request) {
  const account = await session(request);
  if (!account) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin execution is not allowed.' }, { status: 403 });
  if (jobs.active.has(account.user.id) || jobs.active.size >= 2) return Response.json({ error: 'A verification is already running. Try again after it finishes.' }, { status: 409 });
  if (Number(request.headers.get('content-length')) > 11_000_000) return Response.json({ error: 'Upload exceeds 11 MB.' }, { status: 413 });
  const id = randomUUID(), root = join(dataDir, 'runs', id), controller = new AbortController();
  jobs.active.set(account.user.id, { id, controller });
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]);
  let report: PythonReport | undefined;
  try {
    const form = await request.formData();
    const replay = form.get('mode') === 'saved_tests';
    const mutationChoice = form.get('mutationChecks');
    if (mutationChoice !== null && mutationChoice !== 'true' && mutationChoice !== 'false') throw new Error('Choose whether to run mutation checks.');
    const policy = verificationPolicySchema.parse({ mutationChecks: mutationChoice === 'true', modelRequestLimit: String(form.get('modelRequestLimit') ?? '').trim() ? Number(form.get('modelRequestLimit')) : interactivePolicy.modelRequestLimit });
    if (!replay && !process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY in the root .env.local and restart.');
    const title = String(form.get('title') || 'Project verification').trim();
    const model = String(form.get('model') || process.env.REQTEST_LLM_MODEL || 'gpt-6-luna').trim().replace(/^openai\/(?=gpt-)/, '');
    const parentRunId = String(form.get('parentRunId') || '');
    let parent: PythonReport | undefined;
    if (parentRunId) {
      parent = (await database.query('SELECT report FROM runs WHERE id=$1 AND user_id=$2', [parentRunId, account.user.id])).rows[0]?.report;
      if (!parent || !/^[a-f0-9-]{36}$/.test(parent.id) || parent.status === 'running') throw new Error('Choose a finished report owned by your account to re-run.');
    }
    const documentId = String(form.get('documentId') || '');
    let rules: PythonReport['rules'];
    let requirementInput: PythonReport['requirementInput'];
    let requirementDocument: PythonReport['requirementDocument'];
    if (parent && form.get('reuseRequirements') === 'true') {
      rules = parent.rules.map(rule => ({ ...rule }));
      requirementInput = parent.requirementInput;
      requirementDocument = parent.requirementDocument;
    } else if (documentId) {
      const document = await loadRequirements(account.user.id, documentId);
      const text = form.get('requirements');
      if (typeof text === 'string') {
        const parsed = parseRequirementInput(text, document);
        rules = parsed.rules; requirementInput = { mode: parsed.mode, text: parsed.text, context: parsed.context };
      } else rules = documentRules(document, form.getAll('segmentId').map(String));
      const included = new Set(rules.flatMap(rule => ruleSources(rule).map(source => source.segmentId)));
      requirementDocument = { id: document.id, fileName: document.fileName, sha256: document.sha256, warnings: document.warnings, selectedBlocks: included.size, totalBlocks: document.segments.length, textEdited: typeof text === 'string' && text !== documentText(document), format: document.format, pages: document.pages };
    } else {
      const parsed = parseRequirementInput(String(form.get('requirements') || ''));
      rules = parsed.rules; requirementInput = { mode: parsed.mode, text: parsed.text, context: parsed.context };
      // Preserve a document citation only when the exact original block is unchanged.
      if (parent) rules = rules.map(rule => { const old = parent.rules.find(old => old.text === rule.text); return { ...rule, source: old?.source, sources: old?.sources }; });
    }
    if (parent) {
      const documents = new Set(rules.flatMap(rule => ruleSources(rule).map(source => source.documentId)));
      for (const documentId of documents) {
        const original = await loadRequirements(account.user.id, documentId);
        if (rules.some(rule => ruleSources(rule).some(source => source.documentId === documentId && !sourceMatches(rule, source, original)))) throw new Error('A saved requirement citation changed. Upload the original document again.');
      }
    }
    if (!title || title.length > 120 || model.length > 100) throw new Error('Use a title up to 120 characters and a valid model.');
    const clarification = String(form.get('clarification') || '').trim();
    if (replay && (!parent?.analysis || !parent.tests.some(test => test.approved) || clarification || form.get('reuseRequirements') !== 'true')) throw new Error('Saved-test execution requires an owned finished run with approved tests and unchanged requirements.');
    if (clarification && !parent) throw new Error('Clarifications must reference a previous run.');
    // Clarifications are explicitly new user requirements, never retroactive edits to prior evidence.
    if (clarification) {
      const additions = clarification.split(/\r?\n/).filter(line => line.trim());
      rules.push(...additions.map((text, index) => ({ id: 'R' + (rules.length + index + 1), text })));
      if (requirementInput) requirementInput = { ...requirementInput, text: requirementInput.text + '\n' + additions.join('\n') };
    }
    await mkdir(join(root, 'generated'), { recursive: true });
    let source: string, fingerprint: string, projectSetup: PythonReport['projectSetup'];
    if (parent) {
      await cp(join(dataDir, 'runs', parent.id, 'source'), join(root, 'source'), { recursive: true });
      source = parent.source; fingerprint = parent.fingerprint; projectSetup = parent.projectSetup;
      await writeFile(join(root, 'runtime.json'), JSON.stringify({runtime: parent.runtime || 'python', runDirectory: projectSetup?.runDirectory || '', services: projectSetup?.services || []}));
    } else {
      const setupId = String(form.get('preflightId') || '');
      const setup = setupId ? await copyPreparedProject(account.user.id, setupId, root) : await (async () => { const token = form.get('repository') ? await repositoryToken(request, form) : ''; const next = await prepareProject(account.user.id, form, signal, token); return copyPreparedProject(account.user.id, next.id, root); })();
      if (setup.setup.status === 'needs_setup' && form.get('allowEnvironmentFailure') !== 'true') throw new Error('Project dependencies do not match the sandbox. Check project setup first, prepare the image, or explicitly run to diagnose environment failures.');
      source = setup.source; fingerprint = setup.fingerprint; projectSetup = setup;
    }
    report = { policy, runtime: parent?.runtime || projectSetup?.runtime || 'python', execution: {queueId: id, image: (replay ? parent?.execution?.image || parent?.configuration?.sandboxImage : undefined) || projectSetup?.sandboxImage || await sandboxImage(), attempt: 0, recovered: false}, id, title, model, createdAt: new Date().toISOString(), source, fingerprint, workerId: jobs.workerId, parentRunId: parent?.id, clarification: clarification || undefined, projectSetup, requirementDocument, requirementInput, status: 'running', stage: 'Queued — waiting for verification worker', rules, tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: [
      'Verified describes mapped, reviewed cases and recorded execution; exhaustive correctness is not established.',
      'Model analysis, mappings, diagnoses and equivalence decisions require independent evaluation.',
      'Python/pytest/mutmut or Node.js/node:test/Stryker run in disposable containers. Selected test services use a private internal network; public network access is unavailable during tests.',
      ...(projectSetup?.runtime === 'node' ? ['Node.js discovery executes existing test bodies. Only unique top-level node:test cases are supported; nested suites and Jest/Vitest are not supported.'] : []),
      'At most one improvement action. Mutation testing targets one mapped source file for at most 75 seconds.',
      'Mutation counts are raw tool outcomes, not independently reviewed non-equivalent mutation scores.',
      'Focused Python or Node.js snapshots only. Host request headers, access tokens and environment secrets are not mounted into the sandbox.',
      ...(requirementDocument ? ['Uploaded text is editable. Only exact original excerpts retain document citations; review extraction warnings. Analysis does not establish complete specification verification.'] : []),
    ] };
    if (replay && parent) {
      report.policy = parent.policy || verificationPolicySchema.parse({});
      report.analysis = structuredClone(parent.analysis);
      report.tests = structuredClone(parent.tests);
      report.testAttempts = structuredClone(parent.testAttempts);
      report.replay = { suiteHash: createHash('sha256').update(JSON.stringify(report.tests)).digest('hex'), states: structuredClone(parent.states) };
      report.model = parent.model;
      report.limitations.push('Saved-test execution makes no model calls. Original analysis and test reviews are reused; diagnoses and mutation measurements are not refreshed. Results may change for time-dependent or nondeterministic target code.');
    }
    signal.throwIfAborted();
    await enqueueRun(report, account.user.id);
    jobs.active.delete(account.user.id);
    const encoder = new TextEncoder();
    let connected = true;
    const stream = new ReadableStream({
      async start(streamController) {
        const send = (event: string, value: unknown) => { if (connected) try { streamController.enqueue(encoder.encode('event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n')); } catch { connected = false; } };
        let last = '';
        try {
          while (connected && !request.signal.aborted) {
            const row = (await database.query('SELECT report FROM runs WHERE id=$1 AND user_id=$2', [id, account.user.id])).rows[0];
            if (!row) break;
            const current: PythonReport = await refreshQueuedRun(row.report);
            if (current.status !== 'running') { send('complete', current); break; }
            const value = JSON.stringify(current);
            if (value !== last) { send('progress', {stage: current.stage, report: current}); last = value; }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch { send('error', {message: 'Progress connection interrupted. The queued run remains saved; reconnect through history.'}); }
        finally { if (connected) streamController.close(); }
      },
      cancel() { connected = false; },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
  } catch (error) {
    jobs.active.delete(account.user.id);
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid project.' }, { status: 422 });
  }
}
