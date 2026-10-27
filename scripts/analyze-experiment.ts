/** Export objective experiment measurements; unreviewed semantic metrics stay unavailable. */
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { summarizeExperiment, type ExperimentEntry, type ExperimentItem, type ReferenceCheck, type ReferenceExecution, type RequestRecord } from '../lib/experiment-metrics';
import { goldSchema } from '../lib/evaluation';
import type { PythonReport } from '../lib/python-types';
import { verificationSummary } from '../lib/run-evaluation';

async function main() {
  if (!process.argv[2]) throw new Error('Usage: npm run experiment:analyze -- <index.json> [output-directory]');
  const indexPath = resolve(process.argv[2]), root = dirname(indexPath);
  const output = resolve(process.argv[3] || join(root, 'analysis'));
  const load = async <T>(file: string): Promise<T> => {
    const path = resolve(root, file), child = relative(root, path);
    if (isAbsolute(child) || child.startsWith('..')) throw new Error('Evidence paths must stay within the experiment directory.');
    return JSON.parse(await readFile(path, 'utf8')) as T;
  };
  const index = await load<{ status?: string; model: string; sandboxImage: string; agentFingerprint: string; manifestHash: string; expectedRuns?: number; inputs?: Record<string, { archiveHash: string; requirementHash: string }>; runs: ExperimentEntry[] }>('index.json');
  const manifestText = await readFile(join(root, 'manifest.json'), 'utf8');
  if (createHash('sha256').update(manifestText).digest('hex') !== index.manifestHash) throw new Error('Frozen manifest changed.');
  const agentSnapshot = await readFile(join(root, 'agent-snapshot.json'), 'utf8');
  if (createHash('sha256').update(agentSnapshot).digest('hex') !== index.agentFingerprint) throw new Error('Frozen agent snapshot changed.');
  const manifest = JSON.parse(manifestText) as { purpose?: string; variants: string[]; repeat: number; cases: { id: string; oracle?: string }[] };
  if (index.expectedRuns !== manifest.cases.length * manifest.variants.length * manifest.repeat) throw new Error('Planned run count does not match the frozen manifest.');
  for (const [id, hashes] of Object.entries(index.inputs || {})) {
    if (!manifest.cases.some(item => item.id === id)) throw new Error('Unexpected frozen input.');
    if (createHash('sha256').update(await readFile(join(root, `${id}.zip`))).digest('hex') !== hashes.archiveHash || createHash('sha256').update(await readFile(join(root, `${id}.requirements.txt`))).digest('hex') !== hashes.requirementHash) throw new Error('Frozen project or requirements changed.');
  }
  const items: ExperimentItem[] = [];
  for (const item of manifest.cases) for (const variant of manifest.variants) for (let repeat = 1; repeat <= manifest.repeat; repeat++) {
    const entry = index.runs.find(entry => entry.caseId === item.id && entry.variant === variant && entry.repeat === repeat) || { caseId: item.id, variant, repeat, report: '', gold: `${item.id}.gold.json`, review: '' };
    const gold = goldSchema.parse(await load(entry.gold));
    let report: PythonReport | undefined, requests: RequestRecord[] | undefined, reference: ReferenceCheck | undefined, referenceExecution: ReferenceExecution | undefined;
    if (entry.report) report = await load(entry.report);
    if (entry.requests) requests = await load(entry.requests);
    if (entry.referenceExecution) referenceExecution = await load(entry.referenceExecution);
    if (entry.reference) {
      reference = await load(entry.reference);
      if (createHash('sha256').update(await readFile(join(root, `${item.id}.oracle.py`))).digest('hex') !== reference!.oracleHash) throw new Error('Frozen contract witnesses changed.');
    }
    if (report && report.model !== index.model) throw new Error('Report model does not match the frozen experiment.');
    if (report?.configuration && report.configuration.sandboxImage !== index.sandboxImage) throw new Error('Report image does not match the frozen experiment.');
    items.push({ entry, report, gold, requests, reference, referenceExecution });
  }
  if (index.runs.length !== new Set(index.runs.map(entry => `${entry.caseId}:${entry.variant}:${entry.repeat}`)).size || index.runs.some(entry => !items.some(item => item.entry === entry))) throw new Error('Unexpected or duplicate experiment entry.');
  const metrics = summarizeExperiment(items);
  const csv = (rows: object[]) => {
    const columns = Object.keys(rows[0] || {});
    const cell = (value: unknown) => value === null || value === undefined ? '' : '"' + String(value).replaceAll('"', '""') + '"';
    return [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell((row as Record<string, unknown>)[key])).join(','))].join('\n') + '\n';
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'metrics.json'), JSON.stringify({
    scope: 'Controlled synthetic development cases, not held-out product accuracy. See protocol.repeat for the number of observations.',
    protocol: { purpose: manifest.purpose || 'pilot', status: index.status, plannedRuns: index.expectedRuns, cases: manifest.cases.map(item => item.id), repeat: manifest.repeat, stabilityAssessed: manifest.repeat > 1, variants: manifest.variants, model: index.model, sandboxImage: index.sandboxImage, agentFingerprint: index.agentFingerprint, manifestHash: index.manifestHash },
    definitions: {
      correctedCopyDetectionRate: 'A generated assertion fails on original code and passes on a separately corrected copy. References are checked by fixed external contract witnesses. This is specific seeded-fault evidence, not independent semantic accuracy.',
      preservedDetectionRate: 'Final detection among runs with an initial detection; requires a usable final probe. No initial detections means unavailable.',
      latency: 'Wall time for the complete agent run, including failed runs; excludes external corrected-copy probes. Grouped by repeated run, not by project-independent samples.',
      mutation: 'Paired raw killed counts require complete measurements, identical scope, mutant IDs and diffs. They are not a relevance/equivalence-reviewed mutation score.',
      tokens: 'Provider-reported tokens; failed requests without usage make totals unavailable. No currency cost is inferred.',
      missing: 'Every planned run stays in completion denominators. Missing observations remain unavailable rather than zero.',
      semanticMetrics: 'Independent semantic accuracy, diagnosis F1, finding precision/recall and reviewed mutation scores remain unavailable without human-reviewed references and outputs.',
      referenceFailureRate: 'Runs whose final generated suite still has a failed assertion on a separately replayed, fixed-witness-validated reference copy. This is a reference disagreement, not independently established false-positive precision. Errors, skips, empty suites and incomplete replays remain unavailable.',
      stability: 'Distinct approved-suite hashes describe literal output variation only. One repeat cannot measure repeatability; matching hashes do not prove semantic correctness.',
    }, ...metrics,
  }, null, 2));
  await writeFile(join(output, 'runs.csv'), csv(metrics.rows));
  await writeFile(join(output, 'variants.csv'), csv(metrics.summary));
  await writeFile(join(output, 'workflow-evidence.json'), JSON.stringify({
    scope: 'Observed workflow records on identical case inputs. Counts do not establish semantic correctness or superiority over external products.',
    baseline: 'B0 is this repository\'s direct-generation configuration, not a measurement of Codex, Claude, CoverUp or TestGen-LLM.',
    rows: items.map(({ entry, report }) => {
      const summary = report && verificationSummary(report);
      return { caseId: entry.caseId, variant: entry.variant, repeat: entry.repeat,
        inputItems: report?.rules.length ?? null,
        behaviorsWithArtifactQuotes: report?.analysis?.behaviors.filter(behavior => behavior.evidence.length > 0).length ?? null,
        recordedDiagnoses: report?.diagnoses.length ?? null,
        retainedPotentialDefectFailures: summary?.preserved.length ?? null,
        acceptedImprovementActions: report?.improvements.length ?? null,
        evidence: entry.report ? 'evidence/' + entry.report : null };
    }),
    tradeoffs: metrics.summary.map(summary => ({ variant: summary.variant, completed: summary.completed,
      planned: summary.plannedRuns, seededFaultDetection: summary.correctedCopyDetectionRate,
      medianSeconds: summary.medianSeconds, totalTokens: summary.totalTokens })),
  }, null, 2));
  const evidenceFiles = new Set(['index.json', 'manifest.json', 'agent-snapshot.json', ...manifest.cases.flatMap(item => [`${item.id}.zip`, `${item.id}.gold.json`, ...(index.inputs ? [`${item.id}.requirements.txt`] : []), ...(item.oracle ? [`${item.id}.oracle.py`] : [])]), ...index.runs.flatMap(entry => [entry.report, entry.review, ...(entry.reference ? [entry.reference] : []), ...(entry.referenceExecution ? [entry.referenceExecution] : []), ...(entry.requests ? [entry.requests] : [])])]);
  for (const file of evidenceFiles) {
    const path = resolve(root, file), child = relative(root, path);
    if (isAbsolute(child) || child.startsWith('..')) throw new Error('Evidence export paths must remain within the experiment.');
    const destination = join(output, 'evidence', child);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(path, destination);
  }
  await copyFile(join(root, 'source-equivalence.json'), join(output, 'evidence/source-equivalence.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const failures = items.flatMap(({ entry, report }) => report ? [{
    caseId: entry.caseId, variant: entry.variant, repeat: entry.repeat, status: report.status, stage: report.stage, error: report.error,
    initialFailedNodes: report.measurements[0]?.outcomes.filter(outcome => ['failed', 'error'].includes(outcome.status)).map(outcome => outcome.node) || [],
    finalFailedNodes: report.measurements.at(-1)?.outcomes.filter(outcome => ['failed', 'error'].includes(outcome.status)).map(outcome => outcome.node) || [],
    diagnoses: report.diagnoses, improvements: report.improvements.length,
    stopReason: report.stopReason,
    proposalRounds: report.testAttempts,
    referenceExecution: entry.referenceExecution ? 'evidence/' + entry.referenceExecution : null,
    blocked: report.tests.filter(test => !test.approved).map(test => ({ id: test.id, reason: test.review })),
    evidence: 'evidence/' + entry.report,
  }] : []);
  await writeFile(join(output, 'failure-cases.json'), JSON.stringify(failures.filter(item => item.status !== 'completed' || item.finalFailedNodes.length || item.blocked.length || item.improvements), null, 2));
  await writeFile(join(output, 'analysis-notes.json'), JSON.stringify({
    scope: 'Automatic observations for a development pilot, not a final report or external product benchmark.',
    repeatability: manifest.repeat > 1 ? 'Repeated development cases; inspect per-case observations, not population accuracy.' : 'One run per case/configuration. Stability and run-to-run variance are not assessed.',
    comparison: 'B0 uses schema/original-quote checks without model admission review. B3 adds decomposition, retrieval, model review, diagnosis and optional mutation/improvement. Model and case inputs are shared, but this bundled comparison cannot isolate the causal contribution of each component.',
    constraints: ['Development cases are not held out.', 'Reference witnesses cover specified examples, not all possible inputs.', 'No independent semantic or diagnosis labels are available.', 'Model alias, API time drift and caching are not frozen.', 'More tests or higher pass counts do not establish higher requirement coverage.'],
    observations: metrics.summary.map(item => ({ variant: item.variant, completed: `${item.completed}/${item.plannedRuns}`, usableExecutionRate: item.completedWithExecutionRate,
      faultDetectionRate: item.correctedCopyDetectionRate, unresolvedFaultRuns: item.unresolvedFaultRuns,
      referenceFailureRuns: item.referenceFailureRuns, referenceObservedRuns: item.referenceObservedRuns,
      medianSeconds: item.medianSeconds, totalTokens: item.totalTokens })),
    nextDecision: 'Inspect every blocked proposal, reference disagreement and unresolved probe before choosing a larger repeated experiment. Do not tune on a future held-out case set.',
  }, null, 2));
  console.log(JSON.stringify({ output, plannedRuns: items.length, variants: metrics.summary }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Experiment analysis failed.'); process.exitCode = 1; });
