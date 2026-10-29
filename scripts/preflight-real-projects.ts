/** Import the original complete archives with the production importer; no model calls. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importProject, inspectProject, measureProject, sandboxImage } from '../lib/python-tools';

async function main() {
  const results = [];
  const output = resolve(process.argv[2] || '.evidence/real-projects-v16/preflight');
  await mkdir(output, { recursive: true });
  const image = await sandboxImage();
  for (const name of ['click', 'packaging', 'werkzeug']) {
    const base = resolve('.evidence/opensource-candidates', name);
    const root = join(output, name);
    await mkdir(root, { recursive: true });
    await mkdir(join(root, 'generated'), { recursive: true });
    const inventory = JSON.parse(await readFile(join(base, 'inventory.json'), 'utf8'));
    try {
      const snapshot = await importProject(root, await readFile(join(base, 'upstream.zip')));
      const imported = [...Object.keys(snapshot.files), ...snapshot.assets.map(asset => asset.file)];
      const expected: string[] = inventory.fileInventory.map((file: { path: string }) => file.path);
      const runtimeFiles = expected.filter(file => file.startsWith(inventory.runtimeDirectory + '/') && file.endsWith('.py'));
      const missingRuntime = runtimeFiles.filter(file => !imported.includes(file));
      if (missingRuntime.length) throw new Error('Runtime source lost: ' + missingRuntime.join(', '));
      const inspection = await inspectProject(root, AbortSignal.timeout(110_000), image);
      await writeFile(join(root, 'inspection.json'), JSON.stringify(inspection, null, 2));
      const baseline = await measureProject(root, inspection.testFiles || inspection.nodes, false, AbortSignal.timeout(110_000), image);
      await writeFile(join(root, 'baseline.json'), JSON.stringify(baseline, null, 2));
      const exact = new Set(baseline.outcomes.map(outcome => outcome.node));
      const complete = inspection.collection.complete === true && exact.size === inspection.nodes.length && inspection.nodes.every(node => exact.has(node));
      results.push({ project: name, status: 'imported', fingerprint: snapshot.fingerprint, importedFiles: imported.length, importedRuntimeFiles: runtimeFiles.length, missingRuntimeFiles: missingRuntime,
        sandboxImage: image, assets: snapshot.assets, excludedFiles: expected.filter(file => !imported.includes(file)), collection: inspection.collection, retainedBaselineNodes: inspection.nodes.length,
        baseline: { counts: Object.fromEntries(['passed', 'failed', 'error', 'skipped'].map(status => [status, baseline.outcomes.filter(outcome => outcome.status === status).length])), exitCode: baseline.exitCode, integrity: baseline.integrity, exactCompleteCatalog: complete },
        limitation: 'Full imported Python suite runs by file. Only model node context is bounded; no execution node is silently dropped.' });
      if (!complete || baseline.exitCode !== 0 || !baseline.integrity) throw new Error('Full-suite preflight failed; inspect exact saved collection/baseline evidence.');
    } catch (error) {
      results.push({ project: name, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
    console.log(name, results.at(-1)?.status);
  }
  await writeFile(join(output, 'index.json'), JSON.stringify(results, null, 2));
  if (results.some(result => result.status !== 'imported')) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
