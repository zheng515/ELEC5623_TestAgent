/** Only independently reviewed labels contribute to semantic and accuracy metrics. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { goldSchema, reviewSchema, faultProbeSchema, scoreReports } from '../lib/evaluation';
import type { PythonReport } from '../lib/python-types';

async function main() {
  if (!process.argv[2]) throw new Error('Usage: npm run score -- <benchmark/index.json>');
  const path = resolve(process.argv[2]), root = dirname(path);
  const index = z.object({ purpose: z.enum(['pilot', 'held-out']).default('pilot'), runs: z.array(z.object({ caseId: z.string(), variant: z.enum(['B0', 'B1', 'B2', 'B3']), repeat: z.number(), report: z.string(), gold: z.string(), review: z.string(), fault: faultProbeSchema.optional() })) }).parse(JSON.parse(await readFile(path, 'utf8')));
  const load = async (file: string) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
  const items = await Promise.all(index.runs.map(async (entry) => {
    const report: PythonReport = await load(entry.report);
    if (report.variant !== entry.variant || report.title !== entry.caseId) throw new Error('Benchmark entry does not match its report.');
    const gold = goldSchema.parse(await load(entry.gold));
    if (entry.fault && entry.fault.id !== gold.fault?.id) throw new Error('Fault probe does not match the reference fault.');
    return { report, gold, review: reviewSchema.parse(await load(entry.review)), fault: entry.fault || (gold.fault ? { id: gold.fault.id, beforeDetected: null, afterDetected: null, corrected: [] } : undefined) };
  }));
  for (const item of items) if (items.some((other) => other.report.title === item.report.title && (other.report.fingerprint !== item.report.fingerprint || other.report.model !== item.report.model || JSON.stringify(other.report.rules) !== JSON.stringify(item.report.rules)))) throw new Error('Variants for the same case must use the same frozen source, requirements and model.');
  const results = scoreReports(items);
  const note = 'Dataset purpose: ' + index.purpose + '; not a validated product-quality claim. Null means unavailable or unreviewed. Fault probes compare recorded generated-test failures with a separately corrected disposable snapshot and remain provisional until the reference patches are independently reviewed. Accuracy, semantic coverage and relevant non-equivalent mutation scores require independent reference and output reviews.';
  await writeFile(resolve(root, 'metrics.json'), JSON.stringify({ note, results }, null, 2));
  const format = (value: number | null) => value === null ? 'Pending / unavailable' : `${(value * 100).toFixed(1)}%`;
  const table = [
    '# Benchmark summary', '', note, '',
    '| Variant | Runs | Completed | Completed with execution | Reviewed | Semantic coverage | Fault detection after refinement | Incorrect repair rate |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...results.map((item) => `| ${item.variant} | ${item.runs} | ${format(item.completionRate)} | ${item.completedRunsWithExecution} | ${item.reviewedRuns} | ${format(item.semanticCoverageAfter)} | ${format(item.faultDetectionAfter)}${item.faultCasesPendingReferenceReview ? ' (draft reference)' : ''} | ${format(item.incorrectRepairRate)} |`),
    '', '## Run evidence', '',
    ...index.runs.map((entry, i) => `- ${entry.caseId} / ${entry.variant} / repeat ${entry.repeat}: **${items[i].report.status}**, ${items[i].report.tests.filter((test) => test.approved).length} approved tests. [Report](${entry.report}) · [Review](${entry.review})`), '',
  ].join('\n');
  await writeFile(resolve(root, 'summary.md'), table);
  console.log(JSON.stringify(results, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
