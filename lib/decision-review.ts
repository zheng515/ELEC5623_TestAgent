import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DecisionCase } from '../examples/benchmark/decision-cases';
import { decisionHash } from './decision-evaluation';
import { measureProject, sandboxImage, writeTests } from './python-tools';

// No model, predictions or draft labels are used to prepare the reviewer pack.
export async function prepareDecisionReview(root: string, cases: DecisionCase[], signal: AbortSignal) {
  const image = await sandboxImage();
  await mkdir(root, { recursive: false });
  const work = await mkdtemp(join(tmpdir(), 'reqtest-decision-review-'));
  const pack = [];
  try {
    for (const item of [...cases].sort((a, b) => decisionHash(a.id).localeCompare(decisionHash(b.id)))) {
      signal.throwIfAborted();
      const directory = join(work, item.id);
      await mkdir(join(directory, 'source'), { recursive: true }); await mkdir(join(directory, 'generated'));
      for (const [file, source] of Object.entries(item.context.files)) if (!file.startsWith('reqtest_generated/')) {
        await mkdir(join(directory, 'source', file, '..'), { recursive: true });
        await writeFile(join(directory, 'source', file), source);
      }
      await writeTests(directory, item.context.tests.map(test => ({ ...test, approved: true })));
      const execution = await measureProject(directory, [], true, signal, image);
      pack.push({ id: item.id, kind: item.kind, rules: item.context.rules, files: item.context.files, tests: item.context.tests, execution });
      await writeFile(join(root, 'cases.json'), JSON.stringify(pack, null, 2));
    }
    const datasetHash = decisionHash(cases);
    await writeFile(join(root, 'reference.template.json'), JSON.stringify({ datasetHash, reviewed: false, reviewer: '', labels: pack.map(item => ({ id: item.id, allowed: [], rationale: '' })) }, null, 2));
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ datasetHash, sandboxImage: image, cases: cases.length, modelCalls: 0, status: 'prepared', evidenceHash: decisionHash(pack) }, null, 2));
    await writeFile(join(root, 'README.md'), [
      '# Independent component review', '',
      'This development pack contains original requirements, source, candidate tests and actual disposable Docker executions. It contains no model predictions or draft reference decisions. Execution pass/fail is not a correctness label.',
      'Read each original rule and every assertion. Ignore scaffolding purpose and mapping metadata as evidence of correctness. Use the recorded trace to distinguish a generated import/setup error from an implementation dependency blocker. A passing test can still be unsupported or omit a stated obligation.', '',
      'Copy reference.template.json to a separate reference.json. For test_review use exactly one of supported or blocked. For diagnosis use generated_test_error, requirement_ambiguity, potential_implementation_defect, environment_failure or uncertain. Explain each choice with exact requirement, file and execution evidence. Use multiple acceptable diagnosis labels only when a unique label cannot be justified; such cases are excluded from confusion/Macro-F1 scoring.',
      'Review independently before viewing model outputs or the repository draft labels. Resolve disagreements explicitly, retain the original annotation, enter your name and set reviewed=true only after all cases are checked. The software checks completeness and fingerprints; it cannot verify reviewer independence.', '',
      'Use the reviewed reference in a separately frozen run: npm run evaluate:decisions -- 3 --reference /absolute/path/reference.json',
      'To annotate an existing frozen run, confirm matching dataset hashes, then use npm run evaluate:decisions -- score RUN_DIRECTORY --reference /absolute/path/reviewed.json --reason "Independent review and reviewer name". This creates a separate revision; never overwrite its sealed reference.json.',
      'These cases are development fixtures, not a held-out or industry sample. Model review/diagnosis classification is separate from whole-agent admission and diagnosis grounding.', '',
    ].join('\n'));
  } finally { await rm(work, { recursive: true, force: true }); }
}
