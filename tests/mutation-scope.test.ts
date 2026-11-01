import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mutateProject, dockerTool } from '../lib/python-tools';
import { project } from './fixtures/python-agent';
import type { Mutation } from '../lib/python-types';

const source = 'IMPORT_ONLY = 12345\nclass Calculator:\n    def fee(self, amount):\n        if amount >= 10000:\n            return 0\n        return 1000\n    def setup_only(self):\n        return 98765\n';
const generated = 'from business import Calculator\ndef test_fee():\n    assert Calculator().fee(20000) == 0\n';
const enabled = process.env.REQTEST_DOCKER_TEST === '1';

test('indirect calls use generated-test execution lines and freeze mutation scope for remeasurement', { skip: !enabled, timeout: 45000 }, async t => {
  const root = await project(t, { 'source/business.py': source,
    'source/tests/conftest.py': 'from business import Calculator\nCalculator().setup_only()\n',
    'source/tests/test_setup.py': 'def test_other():\n    assert False\n' });
  await mkdir(join(root, 'generated'), { recursive: true });
  await writeFile(join(root, 'generated/test_reqtest_T1.py'), generated);
  const nodes = ['tests/test_setup.py::test_other'], signal = AbortSignal.timeout(40000);
  const before = await mutateProject(root, 'business.py', signal, undefined, undefined, nodes);
  assert.equal(before.incomplete, false, before.log);
  assert.equal(before.scope?.kind, 'executed_lines');
  assert.deepEqual(before.scope?.lines, [4, 5], 'Imports, definitions, unused branches and setup calls are excluded.');
  assert.ok(before.mutants.length > 0);
  assert.ok(before.mutants.every(mutant => before.scope!.lines.includes(mutant.line)));
  await writeFile(join(root, 'generated/test_reqtest_T1.py'), generated + '    assert Calculator().fee(0) == 1000\n');
  const after = await mutateProject(root, 'business.py', signal, undefined, before.scope!.functions, nodes, before.scope!.lines);
  assert.equal(after.incomplete, true, 'Newly executed lines outside the frozen selection remain unassessed.');
  assert.deepEqual(after.unassessedExecutedLines, [6]);
  assert.deepEqual(after.scope, before.scope, 'New inputs must not silently change paired mutation candidates.');
  assert.deepEqual(after.mutants.map(({ id, diff }) => ({ id, diff })), before.mutants.map(({ id, diff }) => ({ id, diff })));
  const fresh = await mutateProject(root, 'business.py', signal, undefined, undefined, nodes);
  assert.ok(fresh.scope!.lines.includes(6), 'A fresh assessment can observe newly executed lines.');
  assert.deepEqual(fresh.unassessedExecutedLines, []);
  assert.equal(await readFile(join(root, 'source/business.py'), 'utf8'), source);
});

test('absent or failing execution evidence never falls back to whole-file mutation', { skip: !enabled, timeout: 20000 }, async t => {
  for (const code of [
    'from business import Calculator\ndef test_import_only():\n    assert Calculator\n',
    generated.replace('== 0', '== 1'),
  ]) {
    const root = await project(t, { 'source/business.py': source });
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), code);
    const result = await mutateProject(root, 'business.py', AbortSignal.timeout(8000));
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.mutants, []);
    assert.deepEqual(result.scope?.lines, []);
    assert.equal(result.scope?.kind, 'executed_lines');
    assert.match(result.log, /No generated-test execution lines/);
  }
});

test('frozen mutation line requests reject invalid source locations', { skip: !enabled, timeout: 10000 }, async t => {
  const root = await project(t, { 'source/business.py': source });
  await writeFile(join(root, 'generated/test_reqtest_T1.py'), generated);
  for (const lines of [[0], [1000], [1.5]]) await assert.rejects(dockerTool<Mutation>(root, { action: 'mutate', file: 'business.py', lines }, AbortSignal.timeout(2500)), /Frozen mutation lines/);
});
