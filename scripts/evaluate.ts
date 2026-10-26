import { loadEnvConfig } from "@next/env";
/** Explicit paid benchmark. Reference labels and patches never enter model context. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { z } from 'zod';
import { runPython, reason, type Reason, type ReasonUsage } from '../lib/python-agent';
import { importProject } from '../lib/python-tools';
import { goldSchema, reviewTemplate, type FaultProbe } from '../lib/evaluation';
import { probeFault, validateReference } from '../lib/evaluation-tools';
import type { PythonReport } from '../lib/python-types';

const manifestSchema = z.object({
  purpose: z.enum(['pilot', 'held-out']).default('pilot'),
  repeat: z.number().int().min(1).max(5).default(1),
  variants: z.array(z.enum(['B0', 'B1', 'B2', 'B3'])).min(1).max(4),
  cases: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), project: z.string(), requirements: z.string(), gold: z.string(), oracle: z.string().optional() })).min(1).max(20),
});
async function main() {
  loadEnvConfig(process.cwd(), true);
  const validateOnly = process.argv.includes('--validate-only');
  if (!validateOnly && !process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY first. This command makes paid model requests.');
  const manifestText = await readFile(process.argv[2] || 'examples/evaluation.json', 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  if (new Set(manifest.variants).size !== manifest.variants.length || new Set(manifest.cases.map((item) => item.id)).size !== manifest.cases.length) throw new Error('Benchmark variants and case IDs must be unique.');
  const sandboxImage = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1'], { encoding: 'utf8' }).trim();
  process.env.REQTEST_SANDBOX_IMAGE = sandboxImage;
  const agentPaths = ['lib/python-agent.ts', 'lib/python-types.ts', 'lib/python-tools.ts', 'lib/model.ts', 'lib/runtime.ts', 'lib/mutation-review.ts', 'lib/test-services.ts', 'lib/evaluation-tools.ts', 'scripts/evaluate.ts', 'sandbox/worker.py', 'sandbox/node-worker.cjs', 'package-lock.json'];
  const agentFiles = await Promise.all(agentPaths.map(async file => [file, await readFile(file, 'utf8')]));
  const agentFingerprint = createHash('sha256').update(JSON.stringify(agentFiles)).digest('hex');
  const output = resolve('.evidence/evaluation', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'manifest.json'), manifestText);
  await writeFile(join(output, 'agent-snapshot.json'), JSON.stringify(agentFiles));
  const index: { purpose: 'pilot' | 'held-out'; createdAt: string; model: string; manifestHash: string; sandboxImage: string; agentFingerprint: string; expectedRuns: number; status: string; runs: { caseId: string; variant: string; repeat: number; report: string; gold: string; review: string; fault?: FaultProbe; reference?: string; requests: string; elapsedMs?: number }[] } = { purpose: manifest.purpose, createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || 'gpt-6-luna', manifestHash: createHash('sha256').update(manifestText).digest('hex'), sandboxImage, agentFingerprint, expectedRuns: manifest.cases.length * manifest.variants.length * manifest.repeat, status: 'running', runs: [] };
  await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
  if (validateOnly) index.expectedRuns = 0;
  console.log(`Experiment: ${output}; ${index.expectedRuns} planned runs. ${validateOnly ? 'Reference validation only; no model requests.' : 'Paid model requests; no automatic retries.'}`);
  const interrupted = new AbortController();
  process.once('SIGINT', () => interrupted.abort());
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
    const rules = (await readFile(item.requirements, 'utf8')).split(/\r?\n/).filter((line) => line.trim()).map((text, position) => ({ id: 'R' + (position + 1), text }));
    if (!rules.length || rules.length > 12 || JSON.stringify(rules).length > 13000) throw new Error('Benchmark requirements must fit the supported input limits.');
    await writeFile(join(output, `${item.id}.gold.json`), JSON.stringify(gold, null, 2));
    let reference: string | undefined;
    if (item.oracle) {
      const oracle = await readFile(item.oracle, 'utf8');
      await writeFile(join(output, `${item.id}.oracle.py`), oracle);
      const validation = await validateReference(join(output, `${item.id}-reference`), archive, gold, oracle, interrupted.signal);
      reference = `${item.id}.reference.json`;
      await writeFile(join(output, reference), JSON.stringify(validation, null, 2));
      if (!validation.valid) throw new Error(`Contract witnesses failed for ${item.id}; no model calls for this case.`);
    }
    if (validateOnly) continue;
    for (const variant of manifest.variants) for (let repeat = 1; repeat <= manifest.repeat; repeat++) {
      if (interrupted.signal.aborted) { index.status = 'cancelled'; await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2)); return; }
      const currentAgent = await Promise.all(agentPaths.map(async file => [file, await readFile(file, 'utf8')]));
      if (createHash('sha256').update(JSON.stringify(currentAgent)).digest('hex') !== agentFingerprint) throw new Error('Agent inputs changed during the experiment. Start a new frozen experiment.');
      const name = `${item.id}-${variant}-${repeat}`, root = join(output, name);
      await mkdir(join(root, 'generated'), { recursive: true });
      const snapshot = await importProject(root, archive);
      const report: PythonReport = { id: randomUUID(), variant, title: item.id, createdAt: new Date().toISOString(), model: index.model, source: item.project, fingerprint: snapshot.fingerprint, status: 'running', stage: '', rules, tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: ['Dataset purpose: ' + manifest.purpose + '. Labels and outputs require independent human review. B0/B1 scaffolding is not a semantic verification claim. B2 omits evidence-based diagnosis.'] };
      const entry: typeof index.runs[number] = { caseId: item.id, variant, repeat, report: `${name}/report.json`, gold: `${item.id}.gold.json`, review: `${name}/review.json`, reference, requests: `${name}/requests.json` };
      if (gold.fault) entry.fault = { id: gold.fault.id, beforeDetected: null, afterDetected: null, corrected: [] };
      index.runs.push(entry);
      await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
      const save = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
      const requests: { taskHash: string; elapsedMs: number; usage?: ReasonUsage; error?: string }[] = [];
      const measuredReason: Reason = async (schema, task, context, model, signal) => {
        const started = Date.now(), request: typeof requests[number] = { taskHash: createHash('sha256').update(task).digest('hex'), elapsedMs: 0 };
        try { return await reason(schema, task, context, model, signal, usage => { request.usage = usage; }); }
        catch (error) { request.error = (error instanceof Error ? error.message : 'Request failed.').replaceAll(process.env.OPENAI_API_KEY!, '[redacted]').slice(0, 1500); throw error; }
        finally { request.elapsedMs = Date.now() - started; requests.push(request); await writeFile(join(root, 'requests.json'), JSON.stringify(requests, null, 2)); }
      };
      const started = Date.now();
      try {
        await runPython(report, root, AbortSignal.any([interrupted.signal, AbortSignal.timeout(600000)]), async (stage) => { console.log(item.id, variant, repeat, stage); await save(); }, measuredReason, variant);
      } catch (error) {
        report.status = interrupted.signal.aborted ? 'cancelled' : 'failed';
        report.error = (error instanceof Error ? error.message : 'Failed').replaceAll(process.env.OPENAI_API_KEY!, '[redacted]');
        if (/invalid.api.key|incorrect.api.key|insufficient.quota|authentication|status.?401/i.test(report.error)) interrupted.abort();
      }
      entry.elapsedMs = Date.now() - started;
      if (report.status === 'completed' && !interrupted.signal.aborted) {
        try { entry.fault = await probeFault(root, archive, gold, report, AbortSignal.any([interrupted.signal, AbortSignal.timeout(220000)])); }
        catch { console.log(name, 'Reference probe incomplete; detection remains unavailable.'); }
      }
      await save();
      await writeFile(join(root, 'review.json'), JSON.stringify(reviewTemplate(report, gold), null, 2));
      await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
      console.log(name, report.status, `${report.tests.filter((test) => test.approved).length} approved tests`);
    }
  }
  index.status = 'completed';
  await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Saved benchmark: ${join(output, 'index.json')}`);
  console.log('Review the copied gold labels and review.json files independently, then run npm run score -- <index.json>.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
