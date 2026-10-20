import { loadEnvConfig } from "@next/env";
/** Explicit paid benchmark. Reference labels and patches never enter model context. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { z } from 'zod';
import { runPython, reason } from '../lib/python-agent';
import { importProject } from '../lib/python-tools';
import { goldSchema, reviewTemplate, type FaultProbe } from '../lib/evaluation';
import { probeFault } from '../lib/evaluation-tools';
import type { PythonReport } from '../lib/python-types';

const manifestSchema = z.object({
  purpose: z.enum(['pilot', 'held-out']).default('pilot'),
  repeat: z.number().int().min(1).max(5).default(1),
  variants: z.array(z.enum(['B0', 'B1', 'B2', 'B3'])).min(1).max(4),
  cases: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), project: z.string(), requirements: z.string(), gold: z.string() })).min(1).max(20),
});
async function main() {
  loadEnvConfig(process.cwd(), true);
  if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY first. This command makes paid model requests.');
  const manifestText = await readFile(process.argv[2] || 'examples/evaluation.json', 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  if (new Set(manifest.variants).size !== manifest.variants.length || new Set(manifest.cases.map((item) => item.id)).size !== manifest.cases.length) throw new Error('Benchmark variants and case IDs must be unique.');
  const sandboxImage = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1'], { encoding: 'utf8' }).trim();
  process.env.REQTEST_SANDBOX_IMAGE = sandboxImage;
  const agentFiles = await Promise.all(['lib/python-agent.ts', 'lib/python-types.ts', 'lib/python-tools.ts'].map((file) => readFile(file)));
  const agentFingerprint = createHash('sha256').update(Buffer.concat(agentFiles)).digest('hex');
  const output = resolve('.evidence/evaluation', new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'manifest.json'), manifestText);
  const index: { purpose: 'pilot' | 'held-out'; createdAt: string; model: string; manifestHash: string; sandboxImage: string; agentFingerprint: string; runs: { caseId: string; variant: string; repeat: number; report: string; gold: string; review: string; fault?: FaultProbe }[] } = { purpose: manifest.purpose, createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || 'gpt-6-luna', manifestHash: createHash('sha256').update(manifestText).digest('hex'), sandboxImage, agentFingerprint, runs: [] };
  const interrupted = new AbortController();
  process.once('SIGINT', () => interrupted.abort());
  for (const item of manifest.cases) {
    const directory = resolve(item.project), goldPath = resolve(item.gold), goldRelative = relative(directory, goldPath);
    if (!goldRelative.startsWith('../') && !isAbsolute(goldRelative)) throw new Error('Reference labels must be outside the model-visible project directory.');
    const gold = goldSchema.parse(JSON.parse(await readFile(goldPath, 'utf8')));
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
    const rules = (await readFile(item.requirements, 'utf8')).split(/\r?\n/).filter((line) => line.trim()).map((text, position) => ({ id: 'R' + (position + 1), text }));
    if (!rules.length || rules.length > 12 || JSON.stringify(rules).length > 13000) throw new Error('Benchmark requirements must fit the supported input limits.');
    await writeFile(join(output, `${item.id}.gold.json`), JSON.stringify(gold, null, 2));
    for (const variant of manifest.variants) for (let repeat = 1; repeat <= manifest.repeat; repeat++) {
      if (interrupted.signal.aborted) return;
      const name = `${item.id}-${variant}-${repeat}`, root = join(output, name);
      await mkdir(join(root, 'generated'), { recursive: true });
      const snapshot = await importProject(root, archive);
      const report: PythonReport = { id: randomUUID(), variant, title: item.id, createdAt: new Date().toISOString(), model: index.model, source: item.project, fingerprint: snapshot.fingerprint, status: 'running', stage: '', rules, tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: ['Dataset purpose: ' + manifest.purpose + '. Labels and outputs require independent human review. B0/B1 scaffolding is not a semantic verification claim. B2 omits evidence-based diagnosis.'] };
      const entry: typeof index.runs[number] = { caseId: item.id, variant, repeat, report: `${name}/report.json`, gold: `${item.id}.gold.json`, review: `${name}/review.json` };
      if (gold.fault) entry.fault = { id: gold.fault.id, beforeDetected: null, afterDetected: null, corrected: [] };
      index.runs.push(entry);
      await writeFile(join(output, 'index.json'), JSON.stringify(index, null, 2));
      const save = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
      try {
        await runPython(report, root, AbortSignal.any([interrupted.signal, AbortSignal.timeout(600000)]), async (stage) => { console.log(item.id, variant, repeat, stage); await save(); }, reason, variant);
      } catch (error) {
        report.status = interrupted.signal.aborted ? 'cancelled' : 'failed';
        report.error = (error instanceof Error ? error.message : 'Failed').replaceAll(process.env.OPENAI_API_KEY, '[redacted]');
      }
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
  console.log(`Saved benchmark: ${join(output, 'index.json')}`);
  console.log('Review the copied gold labels and review.json files independently, then run npm run score -- <index.json>.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
