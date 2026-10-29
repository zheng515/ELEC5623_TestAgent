import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { importProject, inspectProject, measureProject, verifySavedSource } from '../lib/python-tools';
import { projectFingerprint } from '../lib/project-files';
import { runPython, type Reason } from '../lib/python-agent';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema, type PythonReport, type Measurement } from '../lib/python-types';

test('text snapshot hashes remain compatible and asset byte changes invalidate saved source', async () => {
  const entries: [string, string][] = [['z.py', 'x=1'], ['A.py', 'x=2'], ['_a.py', '\ufeffx=3']];
  assert.equal(projectFingerprint(entries.map(([file, text]) => [file, Buffer.from(text)])), createHash('sha256').update(JSON.stringify([...entries].sort())).digest('hex'));
  const root = await mkdtemp(join(tmpdir(), 'reqtest-assets-'));
  try {
    const zip = new JSZip(), binary = Buffer.from([0, 255, 128, 10]);
    zip.file('app.py', 'VALUE = 1\n'); zip.file('tests/fixtures/opaque', binary); zip.file('tests/fixtures/data.metadata', 'Name: demo\n'); zip.file('docs/guide.rst', 'Original guide\n');
    const snapshot = await importProject(root, await zip.generateAsync({ type: 'nodebuffer' }));
    assert.deepEqual(await readFile(join(root, 'source/tests/fixtures/opaque')), binary);
    assert.equal(snapshot.files['tests/fixtures/opaque'], undefined);
    assert.equal(snapshot.assets[0].sha256, createHash('sha256').update(binary).digest('hex'));
    assert.equal(snapshot.files['docs/guide.rst'], 'Original guide\n');
    await verifySavedSource(root, snapshot.fingerprint);
    await writeFile(join(root, 'source/tests/fixtures/opaque'), Buffer.from([0, 254, 128, 10]));
    await assert.rejects(verifySavedSource(root, snapshot.fingerprint), /fingerprint changed/);
    const oversized = new JSZip(); oversized.file('app.py', 'x=1'); oversized.file('tests/fixtures/large.bin', Buffer.alloc(500_001));
    await assert.rejects(importProject(join(root, 'oversized'), await oversized.generateAsync({ type: 'nodebuffer' })), /Expanded project/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('structured collection and execution retain more than 200 exact parameterized and class IDs', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-catalog-'));
  try {
    const zip = new JSZip();
    zip.file('pyproject.toml', '[project]\nname="catalog-demo"\nversion="1.2.3"\n');
    zip.file('demo.py', 'VALUE = 42\n');
    zip.file('tests/fixtures/opaque', Buffer.from([0, 255, 128]));
    zip.file('tests/test_many.py', `import pytest\nfrom pathlib import Path\nimport subprocess, sys, os\n@pytest.mark.parametrize('number', range(550), ids=lambda i: 'case_"quoted"_http::value_' + str(i) + '_' + 'long' * 15)\ndef test_many(number):\n    assert number >= 0\nclass TestOne:\n    def test_same(self): pass\nclass TestTwo:\n    def test_same(self): pass\ndef test_assets_and_static_metadata():\n    assert Path('tests/fixtures/opaque').read_bytes() == bytes([0,255,128])\n    env = dict(os.environ, PYTHONPATH='')\n    result = subprocess.run([sys.executable, '-c', "import demo; from importlib.metadata import version; assert demo.VALUE == 42; assert version('catalog-demo') == '1.2.3'"], env=env, capture_output=True, text=True)\n    assert result.returncode == 0, result.stderr\n`);
    const imported = await importProject(root, await zip.generateAsync({ type: 'nodebuffer' }));
    await mkdir(join(root, 'generated'));
    const snapshot = await inspectProject(root, AbortSignal.timeout(15000));
    assert.equal(snapshot.nodes.length, 553);
    assert.equal(snapshot.collection.complete, true);
    assert.equal(snapshot.collection.totalNodes, 553);
    assert.equal(snapshot.files['tests/fixtures/opaque'], undefined);
    assert.equal(snapshot.assets?.[0].bytes, 3);
    const measured = await measureProject(root, snapshot.testFiles!, false, AbortSignal.timeout(20000));
    assert.equal(measured.exitCode, 0, measured.log);
    assert.equal(measured.integrity, true);
    assert.equal(measured.outcomes.length, 553);
    assert.deepEqual(new Set(measured.outcomes.map(item => item.node)), new Set(snapshot.nodes));
    await verifySavedSource(root, imported.fingerprint);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('repair receives a bounded model view while full baseline and both executions remain saved', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-repair-context-'));
  try {
    const zip = new JSZip(); zip.file('demo.py', 'VALUE = 42\n');
    zip.file('tests/test_many.py', "import pytest\n@pytest.mark.parametrize('number', range(500))\ndef test_many(number):\n    assert number >= 0\n");
    const source = await importProject(root, await zip.generateAsync({ type: 'nodebuffer' }));
    await mkdir(join(root, 'generated'));
    const rule = 'R1: demo.VALUE is the integer 42.';
    const makeTest = (expected: number) => ({ id: 'T1', behaviorId: 'B1', functionName: 'test_value', gapIndexes: [0], quote: rule, purpose: 'Scripted context-bound regression', code: `from demo import VALUE\ndef test_value():\n    assert VALUE == ${expected}\n` });
    let repairRequested = false;
    const ask: Reason = async (schema, _task, raw) => {
      const context = raw as { eligible?: string[]; measurement?: Measurement & { outcomeScope: { total: number; counts: { failed: number } } } };
      if (Object.is(schema, analysisSchema)) return schema.parse({ behaviors: [{ id: 'B1', ruleId: 'R1', quote: rule, text: 'Value', category: 'rule', issue: 'none', reason: 'Scripted fixture.', files: ['demo.py'], existingTests: [], evidence: [{ file: 'demo.py', quote: 'VALUE = 42' }], gaps: ['Value not checked'] }], inconsistencies: [] });
      if (Object.is(schema, reviewTestsSchema)) return schema.parse({ decisions: [{ testId: 'T1', supported: true, quote: rule, reason: 'Deliberately scripted admission to exercise runtime repair; not a model-quality label.' }], coverage: [{ ruleId: 'R1', quote: rule, complete: true, reason: 'Scripted coverage fixture.', testIds: ['T1'], missingExamples: [] }] });
      if (Object.is(schema, diagnosisSchema)) return schema.parse({ decisions: [{ testId: 'T1', category: 'generated_test_error', reason: '999 contradicts the original stated value 42.', quote: rule, executionQuote: 'assert 42 == 999', evidence: [{ file: 'demo.py', quote: 'VALUE = 42' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: 'assert VALUE == 999' }] }] });
      if (Object.is(schema, testsSchema)) {
        if (context.eligible) {
          repairRequested = true;
          assert.ok(context.measurement!.outcomes.length <= 200);
          assert.equal(context.measurement!.outcomeScope.total, 501);
          assert.equal(context.measurement!.outcomeScope.counts.failed, 1);
        }
        return schema.parse({ tests: [makeTest(context.eligible ? 42 : 999)] });
      }
      throw new Error('Unexpected scripted model stage');
    };
    const report: PythonReport = { id: 'context-regression', title: 'Context regression', createdAt: new Date().toISOString(), source: 'Scripted fixture', model: 'scripted', fingerprint: source.fingerprint, status: 'running', stage: '', policy: { mutationChecks: false }, rules: [{ id: 'R1', text: rule }], tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: [] };
    await runPython(report, root, AbortSignal.timeout(35000), () => {}, ask);
    assert.equal(repairRequested, true);
    assert.equal(report.baseline?.outcomes.length, 500);
    assert.deepEqual(report.measurements.map(measured => measured.outcomes.length), [501, 501]);
    assert.equal(report.measurements[1].exitCode, 0);
    assert.equal(report.testDiscovery?.modelSelectedNodes, 200);
  } finally { await rm(root, { recursive: true, force: true }); }
});
