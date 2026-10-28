import { loadEnvConfig } from "@next/env";
/** Explicit paid experiment. Reference labels and patches never enter model context. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { z } from 'zod';
import { runPython, reason, type Reason, type ReasonUsage } from '../lib/python-agent';
import { importProject } from '../lib/python-tools';
import { goldSchema, reviewTemplate } from '../lib/evaluation';
import { probeFault, probeReferenceSuite, validateReference } from '../lib/evaluation-tools';
import type { PythonReport, Measurement } from '../lib/python-types';
import { parseRequirementInput } from '../lib/requirement-input';
import type { ExperimentEntry } from '../lib/experiment-metrics';
import { verificationPolicySchema } from '../lib/verification-policy';

const manifestSchema = z.object({
  purpose: z.enum(['pilot', 'held-out']).default('pilot'),
  repeat: z.number().int().min(1).max(5).default(1),
  variants: z.array(z.enum(['B0', 'B1', 'B2', 'B3'])).min(1).max(4),
  sharedInitialSuite: z.boolean().default(false),
  followupRequestLimit: z.number().int().min(1).max(12).default(6),
  // Benchmarks keep their frozen 12-request budget; interactive runs default to no limit.
  policy: verificationPolicySchema.default(() => verificationPolicySchema.parse({ modelRequestLimit: 12 })),
  cases: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), project: z.string(), requirements: z.string(), gold: z.string(), oracle: z.string().optional() })).min(1).max(20),
});
async function main() {
  loadEnvConfig(process.cwd(), true);
  const validateOnly = process.argv.includes('--validate-only');
  if (!validateOnly && !process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY first. This command makes paid model requests.');
  const manifestText = await readFile(process.argv[2] || 'examples/evaluation.json', 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  if (manifest.sharedInitialSuite && (manifest.variants.length !== 2 || !manifest.variants.includes('B1') || !manifest.variants.includes('B3'))) throw new Error('Shared initial suites require exactly B1 and B3.');
  if (new Set(manifest.variants).size !== manifest.variants.length || new Set(manifest.cases.map((item) => item.id)).size !== manifest.cases.length) throw new Error('Benchmark variants and case IDs must be unique.');
  const sandboxImage = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1'], { encoding: 'utf8' }).trim();
  process.env.REQTEST_SANDBOX_IMAGE = sandboxImage;
  const agentPaths = ['lib/python-agent.ts', 'lib/python-types.ts', 'lib/verification-policy.ts', 'lib/requirement-coverage.ts', 'lib/test-suite.ts', 'lib/python-tools.ts', 'lib/model.ts', 'lib/runtime.ts', 'lib/mutation-review.ts', 'lib/test-services.ts', 'lib/evaluation.ts', 'lib/evaluation-tools.ts', 'lib/experiment-metrics.ts', 'lib/requirement-input.ts', 'lib/requirements.ts', 'lib/run-evaluation.ts', 'scripts/evaluate.ts', 'scripts/analyze-experiment.ts', 'sandbox/worker.py', 'sandbox/node-worker.cjs', 'package-lock.json'];
  const agentFiles = await Promise.all(agentPaths.map(async file => [file, await readFile(file, 'utf8')]));
  const agentFingerprint = createHash('sha256').update(JSON.stringify(agentFiles)).digest('hex');
  const output = resolve('.evidence/evaluation', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'manifest.json'), manifestText);
  await writeFile(join(output, 'agent-snapshot.json'), JSON.stringify(agentFiles));
  const index: { purpose: 'pilot' | 'held-out'; createdAt: string; model: string; manifestHash: string; sandboxImage: string; agentFingerprint: string; expectedRuns: number; status: string; inputs: Record<string, { archiveHash: string; requirementHash: string }>; runs: ExperimentEntry[] } = { purpose: manifest.purpose, createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || 'gpt-6-luna', manifestHash: createHash('sha256').update(manifestText).digest('hex'), sandboxImage, agentFingerprint, expectedRuns: validateOnly ? 0 : manifest.cases.length * manifest.variants.length * manifest.repeat, status: 'preflight', inputs: {}, runs: [] };
  await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Experiment: ${output}; ${index.expectedRuns} planned runs. ${validateOnly ? 'Reference validation only; no model requests.' : 'Paid model requests; no automatic retries.'}`);
  const interrupted = new AbortController();
  process.once('SIGINT', () => interrupted.abort());
  process.once('SIGTERM', () => interrupted.abort());
  const prepared = [];
  try {
  for (const item of manifest.cases) {
    const directory = resolve(item.project), goldPath = resolve(item.gold), goldRelative = relative(directory, goldPath);
    if (!goldRelative.startsWith('../') && !isAbsolute(goldRelative)) throw new Error('Reference labels must be outside the model-visible project directory.');
    const gold = goldSchema.parse(JSON.parse(await readFile(goldPath, 'utf8')));
    if (item.oracle) {
      const oracleRelative = relative(directory, resolve(item.oracle));
      if (!oracleRelative.startsWith('../') && !isAbsolute(oracleRelative)) throw new Error('Contract witnesses must be outside the model-visible project.');
    }
    const zip = new JSZip();
    async function visit(path: string) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ['node_modules', '__pycache__'].includes(entry.name)) continue;
        const file = join(path, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && /\.(py|md|txt|cfg|toml)$/.test(file)) zip.file(relative(directory, file), await readFile(file));
      }
    }
    await visit(directory);
    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    await writeFile(join(output, `${item.id}.zip`), archive);
    const requirementText = await readFile(item.requirements, 'utf8');
    const parsed = parseRequirementInput(requirementText);
    const { rules, ...requirementInput } = parsed;
    await writeFile(join(output, `${item.id}.gold.json`), JSON.stringify(gold, null, 2));
    await writeFile(join(output, `${item.id}.requirements.txt`), requirementText);
    index.inputs[item.id] = { archiveHash: createHash('sha256').update(archive).digest('hex'), requirementHash: createHash('sha256').update(requirementText).digest('hex') };
    let reference: string | undefined;
    if (item.oracle) {
      const oracle = await readFile(item.oracle, 'utf8');
      await writeFile(join(output, `${item.id}.oracle.py`), oracle);
      const validation = await validateReference(join(output, `${item.id}-reference`), archive, gold, oracle, interrupted.signal);
      reference = `${item.id}.reference.json`;
      await writeFile(join(output, reference), JSON.stringify(validation, null, 2));
      if (!validation.valid) throw new Error(`Contract witnesses failed for ${item.id}; no model calls for this case.`);
    }
    prepared.push({ item, archive, gold, rules, requirementInput, reference });
    await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
  }
  if (validateOnly) { index.status = 'validated'; return; }
  index.status = 'running';
  for (const { item, archive, gold, rules, requirementInput, reference } of prepared) {
    const initialSuites = new Map<number, { report: PythonReport; path: string }>();
    const variants = manifest.sharedInitialSuite ? ['B1', 'B3'] as const : manifest.variants;
    const attempts = Array.from({ length: manifest.repeat }, (_, i) => variants.map((_, offset) => ({ repeat: i + 1, variant: variants[manifest.sharedInitialSuite ? offset : (i + offset) % variants.length] }))).flat();
    for (const { variant, repeat } of attempts) {
      if (interrupted.signal.aborted) { index.status = 'cancelled'; await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2)); return; }
      const currentAgent = await Promise.all(agentPaths.map(async file => [file, await readFile(file, 'utf8')]));
      if (createHash('sha256').update(JSON.stringify(currentAgent)).digest('hex') !== agentFingerprint) throw new Error('Agent inputs changed during the experiment. Start a new frozen experiment.');
      const name = `${item.id}-${variant}-${repeat}`, root = join(output, name);
      await mkdir(join(root, 'generated'), { recursive: true });
      const snapshot = await importProject(root, archive);
      const report: PythonReport = { policy: manifest.policy, id: randomUUID(), variant, title: item.id, createdAt: new Date().toISOString(), model: index.model, source: item.project, fingerprint: snapshot.fingerprint, requirementInput, status: 'running', stage: '', rules, tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: ['Dataset purpose: ' + manifest.purpose + '. Labels and outputs require independent human review. B0/B1 scaffolding is not a semantic verification claim. B2 omits evidence-based diagnosis.'] };
      const entry: typeof index.runs[number] = { caseId: item.id, variant, repeat, report: `${name}/report.json`, gold: `${item.id}.gold.json`, review: `${name}/review.json`, reference, requests: `${name}/requests.json` };
      const initial = manifest.sharedInitialSuite && variant === 'B3' ? initialSuites.get(repeat) : undefined;
      if (initial) entry.initialReport = initial.path;
      if (gold.fault) entry.fault = { id: gold.fault.id, beforeDetected: null, afterDetected: null, corrected: [] };
      index.runs.push(entry);
      await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
      const save = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
      const requests: { stage: string; taskHash: string; contextHash: string; contextBytes: number; elapsedMs: number; usage?: ReasonUsage; error?: string }[] = [];
      await writeFile(join(root, 'requests.json'), '[]');
      const measuredReason: Reason = async (schema, task, context, model, signal, onUsage) => {
        if (manifest.sharedInitialSuite && variant === 'B3' && requests.length >= manifest.followupRequestLimit) throw new Error('Follow-up model request budget exhausted. Saved evidence is retained; unresolved checks are not verified.');
        const serialized = JSON.stringify(context);
        const started = Date.now(), request: typeof requests[number] = { stage: report.stage, taskHash: createHash('sha256').update(task).digest('hex'), contextHash: createHash('sha256').update(serialized).digest('hex'), contextBytes: Buffer.byteLength(serialized), elapsedMs: 0 };
        try { return await reason(schema, task, context, model, signal, usage => { request.usage = usage; onUsage?.(usage); }); }
        catch (error) { request.error = (error instanceof Error ? error.message : 'Request failed.').replaceAll(process.env.OPENAI_API_KEY!, '[redacted]').slice(0, 1500); throw error; }
        finally { request.elapsedMs = Date.now() - started; requests.push(request); await writeFile(join(root, 'requests.json'), JSON.stringify(requests, null, 2)); }
      };
      const started = Date.now();
      try {
        if (manifest.sharedInitialSuite && variant === 'B3' && !initial) throw new Error('The shared B1 prefix did not complete. No replacement initial suite is generated.');
        await runPython(report, root, AbortSignal.any([interrupted.signal, AbortSignal.timeout(600000)]), async (stage) => { console.log(item.id, variant, repeat, stage); await save(); }, measuredReason, variant, undefined, initial?.report);
      } catch (error) {
        report.status = interrupted.signal.aborted ? 'cancelled' : 'failed';
        report.error = (error instanceof Error ? error.message : 'Failed').replaceAll(process.env.OPENAI_API_KEY!, '[redacted]');
        if (/invalid.api.key|incorrect.api.key|insufficient.quota|authentication|status.?401/i.test(report.error)) interrupted.abort();
      }
      entry.elapsedMs = Date.now() - started;
      if (report.status === 'completed' && !interrupted.signal.aborted) {
        let referenceExecution: Measurement | undefined;
        try {
          referenceExecution = await probeReferenceSuite(join(root, 'final-reference'), archive, gold, report, AbortSignal.any([interrupted.signal, AbortSignal.timeout(120000)]));
          entry.referenceExecution = `${name}/reference-execution.json`;
          await writeFile(join(root, 'reference-execution.json'), JSON.stringify(referenceExecution, null, 2));
        } catch { console.log(name, 'Final reference replay incomplete; reference failures remain unavailable.'); }
        try { entry.fault = await probeFault(root, archive, gold, report, AbortSignal.any([interrupted.signal, AbortSignal.timeout(220000)]), referenceExecution); }
        catch { console.log(name, 'Reference probe incomplete; detection remains unavailable.'); }
      }
      await save();
      if (manifest.sharedInitialSuite && variant === 'B1' && report.status === 'completed') initialSuites.set(repeat, { report: structuredClone(report), path: entry.report });
      await writeFile(join(root, 'review.json'), JSON.stringify(reviewTemplate(report, gold), null, 2));
      await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
      console.log(name, report.status, `${report.tests.filter((test) => test.approved).length} approved tests`);
    }
  }
  index.status = 'completed';
  console.log(`Saved experiment: ${join(output, 'index.json')}`);
  console.log('Review the copied gold labels and review.json files independently, then run npm run score -- <index.json>.');
  } catch (error) { index.status = interrupted.signal.aborted ? 'cancelled' : 'failed'; throw error; }
  finally { await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2)); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
