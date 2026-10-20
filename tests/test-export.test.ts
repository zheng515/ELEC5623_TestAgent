import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testArchive } from '../lib/test-export';
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
