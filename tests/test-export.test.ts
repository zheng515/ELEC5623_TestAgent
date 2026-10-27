import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testArchive } from '../lib/test-export';
import { browserPlugin } from '../lib/browser-plugin';
import { testFile } from '../lib/runtime';
import type { PythonReport } from '../lib/python-types';

test('exported tests include run instructions and provenance without unapproved artifacts', async () => {
  const report = { id: 'fixture', runtime: 'python', status: 'completed', source: 'https://github.com/owner/project/tree/fixed-commit', fingerprint: 'fixed-fingerprint', tests: [{ id: 'T1', code: 'def test_fee(): assert fee(10000) == 0', approved: true }, { id: 'T2', code: 'unapproved-code', approved: false }], measurements: [{ outcomes: [{ status: 'failed' }, { status: 'passed' }] }] } as PythonReport;
  for (const runtime of ['python', 'node'] as const) {
    const snapshot = { ...report, runtime }, zip = testArchive(snapshot);
    assert.ok(zip.file(testFile('T1', runtime)));
    assert.equal(zip.file(testFile('T2', runtime)), null);
    const instructions = await zip.file('README.md')!.async('string');
    assert.ok(instructions.includes(runtime === 'python' ? 'python -m pytest reqtest_generated' : 'tsx@4.23.0 --test reqtest_generated/*.test.ts'));
    assert.ok(instructions.includes(snapshot.source)); assert.ok(instructions.includes(snapshot.fingerprint));
    assert.match(instructions, /1 passed, 1 failed, 0 errors/);
    assert.match(instructions, /does not include the implementation/);
    assert.deepEqual(JSON.parse(await zip.file('verification.json')!.async('string')), snapshot);
  }
  assert.ok(testArchive(report, 'report.json').file('report.json'), 'CLI evidence keeps its report filename');
});

test('Python export preserves mutation collection setup without running original assertions', async () => {
  const report = { runtime: 'python', tests: [], measurements: [], mutations: [{ scope: { setupFiles: ['tests/test_existing.py', "tests/test team's helper.py"] } }] } as unknown as PythonReport;
  const instructions = await testArchive(report).file('README.md')!.async('string');
  assert.ok(instructions.includes('--deselect=tests/test_existing.py'));
  assert.ok(instructions.includes("'--deselect=tests/test team'\"'\"'s helper.py'"));
  assert.ok(instructions.includes('-- tests/test_existing.py'));
  assert.match(instructions, /Only generated test functions execute/);
});

test('run-directory exports place browser tests and their fixtures where pytest runs', async () => {
  const code = 'def test_login_default(tmp_path, live_server, page):\n    page.goto(live_server(app))\n';
  const report = { runtime: 'python', projectSetup: { runDirectory: 'backend' }, tests: [{ id: 'T1', code, approved: true }], measurements: [], mutations: [{ scope: { setupFiles: ['backend/tests/conftest.py'] } }] } as unknown as PythonReport;
  const zip = testArchive(report), instructions = await zip.file('README.md')!.async('string');
  assert.equal(await zip.file('backend/' + testFile('T1'))!.async('string'), code);
  assert.equal(await zip.file('backend/reqtest_generated/conftest.py')!.async('string'), browserPlugin);
  assert.match(instructions, /cd backend\n/);
  assert.ok(instructions.includes('-- tests/conftest.py reqtest_generated'));
  assert.match(instructions, /playwright install chromium/);
  const unit = testArchive({ ...report, tests: [{ id: 'T1', code: 'def test_fee():\n    assert fee() == 0\n', approved: true }] } as unknown as PythonReport);
  assert.equal(unit.file('backend/reqtest_generated/conftest.py'), null, 'Unit-only exports need no browser fixtures');
});

test('exported browser fixtures match the sandbox plugin', async () => {
  assert.equal(browserPlugin, await readFile('sandbox/plugins/reqtest_browser.py', 'utf8'));
});
