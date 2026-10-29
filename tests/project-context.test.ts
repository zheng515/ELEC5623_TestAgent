import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProjectContext } from '../lib/project-context';
import { updateStates } from '../lib/python-agent';
import { verificationGate, runEvaluation } from '../lib/run-evaluation';
import { report, analysis, artifact, recordCoverage } from './fixtures/python-agent';

test('small contexts retain every full file and its original line numbering', () => {
  const files = { 'fee.py': '\n\ndef fee():\n    return 0\n', 'README.md': 'Project' };
  const selected = selectProjectContext(files, 'fee');
  assert.deepEqual(selected.files, files); assert.equal(selected.scope.complete, true);
  assert.equal(selected.files['fee.py'].split('\n')[2], 'def fee():');
});
test('large contexts prefer mapped files and requirement terms within a recorded byte budget', () => {
  const files = { 'unrelated.py': 'x'.repeat(300), 'shipping.py': 'def fee():\n    return 0', 'tests.py': 'assert fee() == 0' };
  const selected = selectProjectContext(files, 'shipping fee threshold', ['tests.py'], 100);
  assert.deepEqual(Object.keys(selected.files), ['tests.py', 'shipping.py']);
  assert.ok(selected.scope.selectedBytes <= 100); assert.equal(selected.scope.complete, false);
  assert.equal(selected.scope.omitted[0].file, 'unrelated.py');
  assert.match(selected.scope.omitted[0].sha256, /^[a-f0-9]{64}$/);
});
test('oversized required files stay explicitly uninspected rather than silently truncated', () => {
  const selected = selectProjectContext({ 'large.py': 'large'.repeat(1000) }, 'large', ['large.py'], 100);
  assert.deepEqual(selected.files, {}); assert.equal(selected.scope.omitted[0].required, true);
  assert.equal(selected.scope.complete, false);
});

test('large-project retrieval does not fill unused capacity with irrelevant files', () => {
  const files = { 'shipping.py': 'def fee(): return 0', 'catalog.py': '# catalogue notes\n'.repeat(12) };
  const result = selectProjectContext(files, 'shipping fee', [], 200);
  assert.deepEqual(Object.keys(result.files), ['shipping.py']);
  assert.equal(result.scope.omitted[0].file, 'catalog.py');
});

test('passing reviewed checks cannot verify a behavior whose mapped source was omitted', () => {
  const saved = report(); saved.status = 'completed'; saved.analysis = analysis();
  saved.tests = [structuredClone(artifact)];
  saved.measurements = [{ outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_threshold', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold', status: 'passed', message: '' }], exitCode: 0, integrity: true, timedOut: false, log: '' }];
  recordCoverage(saved);
  const source = saved.analysis.behaviors[0].files[0];
  saved.contextSelections = [{ stage: 'Analyze requirements', totalBytes: 300_000, selectedBytes: 100, budget: 180_000, selectedFiles: ['other.py'], omitted: [{ file: source, bytes: 200_000, sha256: 'a'.repeat(64), required: true }], complete: false }];
  updateStates(saved);
  assert.equal(saved.states[0].status, 'Partially Verified');
  assert.equal(verificationGate(saved, true), false);
  saved.contextSelections.push({ ...saved.contextSelections[0], selectedFiles: [source], omitted: [{ file: 'unrelated.py', bytes: 200_000, sha256: 'b'.repeat(64), required: false }] });
  updateStates(saved);
  assert.equal(saved.states[0].status, 'Verified', 'Omitted unrelated files do not erase the recorded scope of an inspected mapping.');
  saved.analysis.behaviors[0].files = [];
  updateStates(saved);
  assert.equal(saved.states[0].status, 'Partially Verified', 'An unmapped behavior cannot bypass scoped inspection.');
});

test('focused Python retrieval follows relative local imports and package initializers transitively', () => {
  const files = { 'pkg/service.py': 'from .policy import limit\ndef allowed(n): return n >= limit\n', 'pkg/policy.py': 'from .settings import LIMIT\nlimit = LIMIT\n', 'pkg/settings.py': 'LIMIT = 3\n', 'pkg/__init__.py': '', 'unrelated.py': 'unused = True\n' };
  const selected = selectProjectContext(files, 'allowed', ['pkg/service.py'], 1000, true);
  assert.ok(selected.files['pkg/policy.py']); assert.ok(selected.files['pkg/settings.py']);
  assert.ok(Object.hasOwn(selected.files, 'pkg/__init__.py')); assert.equal(selected.files['unrelated.py'], undefined);
  assert.ok(selected.scope.dependencyLinks.some(link => link.from === 'pkg/policy.py' && link.to === 'pkg/settings.py'));
  assert.equal(selected.files['pkg/service.py'], files['pkg/service.py']);
});

test('dependency selection handles JS re-exports, cycles and emitted JS imports of TypeScript', () => {
  const files = { 'src/main.ts': 'import { value } from "./index.js";\nexport { other } from "./other";', 'src/index.ts': 'export { value } from "./value.js";', 'src/value.ts': 'import "./index.js"; export const value = 3;', 'src/other.ts': 'export const other = 2;', 'unrelated.ts': 'export const value = 999;' };
  const result = selectProjectContext(files, '', ['src/main.ts'], 1000, true);
  assert.deepEqual(new Set(Object.keys(result.files)), new Set(['src/main.ts', 'src/index.ts', 'src/value.ts', 'src/other.ts']));
});

test('oversized dependencies stay recorded with hashes and cannot exceed the source budget', () => {
  const result = selectProjectContext({ 'main.py': 'import helper\n', 'helper.py': '# helper\n'.repeat(100) }, 'main', ['main.py'], 100, true);
  assert.ok(result.files['main.py']); assert.equal(result.files['helper.py'], undefined);
  assert.deepEqual(result.scope.dependencyLinks, [{ from: 'main.py', to: 'helper.py' }]);
  assert.equal(result.scope.complete, false); assert.ok(result.scope.selectedBytes <= 100);
  assert.match(result.scope.omitted[0].sha256, /^[a-f0-9]{64}$/);
});

test('retrieval follows the existing pinned pathspec package without rewriting upstream files', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = 'examples/public-benchmark/pathspec/project', files: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = directory + '/' + entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.py')) files[path.slice(root.length + 1)] = await readFile(path, 'utf8');
    }
  }
  await visit(root);
  const result = selectProjectContext(files, 'match_file', ['pathspec/pathspec.py'], 180_000, true);
  for (const path of ['pathspec/pathspec.py', 'pathspec/__init__.py', 'pathspec/util.py', 'pathspec/pattern.py', 'pathspec/patterns/gitwildmatch.py']) assert.equal(result.files[path], files[path], path);
  assert.ok(result.scope.dependencyLinks.length >= 8);
});

test('uninspected transitive dependencies block new and stale Verified states without mutating saved evidence', () => {
  const saved = report(); saved.status = 'completed'; saved.analysis = analysis(); saved.tests = [structuredClone(artifact)];
  saved.measurements = [{ outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_threshold', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold', status: 'passed', message: '' }], exitCode: 0, integrity: true, timedOut: false, log: '' }];
  recordCoverage(saved); updateStates(saved); assert.equal(saved.states[0].status, 'Verified');
  saved.contextSelections = [{ stage: 'review', selectedFiles: ['shipping.py', 'policy.py'], totalBytes: 300_000, selectedBytes: 100, budget: 180_000, complete: false, omitted: [{ file: 'settings.py', bytes: 200_000, sha256: 'c'.repeat(64), required: false }], dependencyLinks: [{ from: 'shipping.py', to: 'policy.py' }, { from: 'policy.py', to: 'settings.py' }, { from: 'policy.py', to: 'shipping.py' }] }];
  const before = JSON.stringify(saved);
  assert.equal(runEvaluation(saved).requirements[0].status, 'Partially Verified');
  assert.equal(verificationGate(saved, true), false); assert.equal(JSON.stringify(saved), before);
  updateStates(saved); assert.equal(saved.states[0].status, 'Partially Verified');
  saved.contextSelections[0].selectedFiles.push('settings.py');
  updateStates(saved); assert.equal(saved.states[0].status, 'Verified');
});
