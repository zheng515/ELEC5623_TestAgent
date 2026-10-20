import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { importProject, sandboxImage, retainSandboxImage, inspectProject, measureProject, mutateProject, writeTests, dockerTool } from '../lib/python-tools';
import { prepareEnvironment } from '../lib/environments';
import { prepareProject, copyPreparedProject } from '../lib/project-setup';
import { dataDir } from '../lib/auth';
import { testServices } from '../lib/test-services';
import { runPython, type Reason } from '../lib/python-agent';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema, type PythonReport } from '../lib/python-types';

const enabled = process.env.REQTEST_DOCKER_TEST === '1';
const rule = 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.';
const shipping = 'export function fee(amount: number) {\n  return amount >= 10000 ? 0 : 1000;\n}\n';
const nodeTest = (name: string, amount: number, expected: number) => "import test from 'node:test';import assert from 'node:assert/strict';import{fee}from'./shipping.ts';\ntest('" + name + "',()=>{assert.equal(fee(" + amount + '),' + expected + ')});\n';
async function archive(files: Record<string, string>) {
  const zip = new JSZip(); for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function rootFor(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-runtime-'));
  await mkdir(join(root, 'generated'));
  const snapshot = await importProject(root, await archive(files));
  return { root, snapshot };
}
const activeResources = (scope: string) => {
  const args = ['--filter', 'label=reqtest.scope=' + scope, '--format', '{{.ID}}'];
  return execFileSync('docker', ['ps', '-a', ...args], { encoding: 'utf8' }).trim() + execFileSync('docker', ['network', 'ls', ...args], { encoding: 'utf8' }).trim();
};
let npmMetadata: Promise<{ dist: { tarball: string; integrity: string } }>;
async function nodeFiles() {
  npmMetadata ||= fetch('https://registry.npmjs.org/is-number/7.0.0').then(async response => { assert.ok(response.ok, 'npm registry must be reachable for automatic setup'); return response.json(); });
  const { dist } = await npmMetadata;
  const dependencies = { 'is-number': '7.0.0' };
  return {
    'shipping.ts': "import isNumber from 'is-number';\n" + shipping,
    'package.json': JSON.stringify({ name: 'runtime-fixture', version: '1.0.0', type: 'module', engines: { node: '>=18' }, dependencies, scripts: { postinstall: "node -e \"require('fs').writeFileSync('hook-ran','unexpected')\"" } }),
    'package-lock.json': JSON.stringify({ name: 'runtime-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'runtime-fixture', version: '1.0.0', dependencies }, 'node_modules/is-number': { version: '7.0.0', resolved: dist.tarball, integrity: dist.integrity } } }),
  };
}

test('a retained image remains executable when its original tag is rebuilt', { skip: !enabled, timeout: 90000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reqtest-image-retention-')), tag = 'reqtest-retention:' + randomUUID();
  let retained = '';
  const base = 'reqtest-retention-base:' + randomUUID();
  try {
    execFileSync('docker', ['image', 'tag', await sandboxImage(), base]);
    for (const version of ['before', 'after']) {
      await writeFile(join(directory, 'Dockerfile'), 'FROM ' + base + '\nLABEL org.reqtest.retention=' + version + '\n');
      execFileSync('docker', ['build', '--provenance=true', '-t', tag, directory], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
      if (!retained) retained = await retainSandboxImage(tag);
    }
    const current = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', tag], { encoding: 'utf8' }).trim();
    assert.notEqual(current, retained);
    assert.equal(execFileSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'python', retained, '-c', 'print("retained")'], { encoding: 'utf8', timeout: 10000 }).trim(), 'retained');
  } finally {
    for (const reference of [tag, base, ...(retained ? ['reqtest-pinned:' + retained.replace('sha256:', '')] : [])]) {
      try { execFileSync('docker', ['image', 'rm', reference], { stdio: 'ignore', timeout: 10000 }); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('Python wheels install in a pinned image, connect to isolated services and start with fresh state', { skip: !enabled, timeout: 240000 }, async context => {
  const user = randomUUID(), root = await mkdtemp(join(tmpdir(), 'reqtest-services-'));
  await mkdir(join(root, 'generated'));
  context.after(async () => { await rm(root, { recursive: true, force: true }); await rm(join(dataDir, 'preflights', createHash('sha256').update(user).digest('hex')), { recursive: true, force: true }); });
  const code = [
    'import os', 'import psycopg', 'import redis', 'from urllib.parse import urlparse',
    'def test_services():',
    '    assert "OPENAI_API_KEY" not in os.environ and "REQTEST_HOST_SENTINEL" not in os.environ',
    '    assert urlparse(os.environ["DATABASE_URL"]).hostname == "postgres"',
    '    with psycopg.connect(os.environ["DATABASE_URL"]) as db:',
    '        assert db.execute("SELECT current_database()").fetchone()[0] == "reqtest"',
    '        assert db.execute("SELECT to_regclass(\'public.fixture\')").fetchone()[0] is None',
    '        db.execute("CREATE TABLE fixture(value INTEGER)")',
    '        db.execute("INSERT INTO fixture VALUES (42)")',
    '        assert db.execute("SELECT value FROM fixture").fetchone()[0] == 42',
    '    cache = redis.Redis.from_url(os.environ["REDIS_URL"])',
    '    assert cache.get("fixture") is None',
    '    cache.set("fixture", "value")', '    assert cache.get("fixture") == b"value"',
  ].join('\n');
  const form = new FormData(); form.set('automaticSetup', 'true'); form.append('service', 'postgres'); form.append('service', 'redis');
  form.set('project', new File([new Uint8Array(await archive({ 'test_service.py': code, 'requirements.txt': 'psycopg[binary]==3.2.3\nredis==5.2.1\n' }))], 'services.zip'));
  process.env.REQTEST_HOST_SENTINEL = 'not-for-sandbox';
  const signal = AbortSignal.timeout(220000), setup = await prepareProject(user, form, signal);
  assert.equal(setup.setup.status, 'ready'); assert.ok(setup.installed.includes('redis==5.2.1'));
  assert.ok(setup.installed.includes('psycopg-binary==3.2.3'));
  await copyPreparedProject(user, setup.id, root);
  const cached = await prepareEnvironment(root, setup.baseImage!, signal);
  assert.equal(cached.cached, true); assert.equal(cached.image, setup.sandboxImage); assert.deepEqual(cached.installed, setup.installed);
  const snapshot = await inspectProject(root, signal, setup.sandboxImage);
  assert.equal(snapshot.collection.exitCode, 0, snapshot.collection.log);
  for (let attempt = 0; attempt < 2; attempt++) {
    const measured = await measureProject(root, snapshot.nodes, false, signal, setup.sandboxImage);
    assert.equal(measured.exitCode, 0, measured.log); assert.equal(measured.outcomes[0].status, 'passed'); assert.equal(measured.integrity, true);
    assert.equal(activeResources(basename(root)), '', 'Disposable containers and networks must be removed after execution');
  }
  assert.equal(await readFile(join(root, 'source/test_service.py'), 'utf8'), code);
  await writeFile(join(root, 'source/wait_test.py'), 'import time\nfrom pathlib import Path\ndef test_wait():\n    Path("/tmp/reqtest_started").write_text("ready")\n    time.sleep(30)\n');
  const controller = new AbortController();
  const running = measureProject(root, ['wait_test.py::test_wait'], false, controller.signal, setup.sandboxImage).then(() => new Error('Cancelled execution unexpectedly completed'), error => error as Error);
  try {
    const deadline = Date.now() + 45000;
    let started = false;
    while (Date.now() < deadline && !started) {
      const id = execFileSync('docker', ['ps', '--filter', 'label=reqtest.scope=' + basename(root), '--filter', 'label=reqtest.role=sandbox', '-q'], { encoding: 'utf8' }).trim();
      if (id) try { execFileSync('docker', ['exec', id, 'test', '-f', '/tmp/reqtest_started'], { stdio: 'ignore' }); started = true; } catch {}
      if (!started) await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal(started, true, 'The test body must be running before cancellation');
    controller.abort();
    assert.match((await running).message, /cancelled/i);
  } finally { controller.abort(); await running; }
  assert.equal(activeResources(basename(root)), '', 'Cancelling a running sandbox must remove it before removing its network');
});

test('Node setup preserves actual versions, disables project hooks and selects exact test cases', { skip: !enabled, timeout: 150000 }, async () => {
  const files = await nodeFiles();
  const { root } = await rootFor({ ...files, 'shipping.test.ts': nodeTest('test_nominal', 0, 1000) + nodeTest('test_unselected', 0, 1).split('\n').slice(1).join('\n') });
  try {
    const signal = AbortSignal.timeout(140000), base = await sandboxImage();
    const missing = await dockerTool<{ status: string }>(root, { action: 'preflight' }, signal, base); assert.equal(missing.status, 'needs_setup');
    const environment = await prepareEnvironment(root, base, signal);
    assert.ok(environment.installed.includes('node_modules/is-number@7.0.0'));
    const cached = await prepareEnvironment(root, base, signal); assert.equal(cached.cached, true); assert.equal(cached.image, environment.image);
    const ready = await dockerTool<{ status: string }>(root, { action: 'preflight' }, signal, environment.image); assert.equal(ready.status, 'ready');
    const snapshot = await inspectProject(root, signal, environment.image);
    assert.equal(snapshot.collection.exitCode, 0, 'A normal assertion failure during discovery is not an import/collection error');
    assert.ok(snapshot.nodes.includes('shipping.test.ts::test_unselected'));
    const selected = await measureProject(root, ['shipping.test.ts::test_nominal'], false, signal, environment.image);
    assert.equal(selected.exitCode, 0, selected.log); assert.deepEqual(selected.outcomes.map(item => item.name), ['test_nominal']);
    const failed = await measureProject(root, ['shipping.test.ts::test_unselected'], false, signal, environment.image);
    assert.equal(failed.exitCode, 1); assert.equal(failed.outcomes[0].status, 'failed'); assert.match(failed.outcomes[0].message, /1000 !== 1/);
    await writeFile(join(root, 'source/hooks.test.ts'), "import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import isNumber from 'is-number';test('test_dependency',()=>{assert.equal(isNumber(2),true);assert.equal(fs.existsSync('/opt/reqtest-node/hook-ran'),false)});");
    assert.equal((await measureProject(root, ['hooks.test.ts::test_dependency'], false, signal, environment.image)).exitCode, 0);
    await writeFile(join(root, 'source/package.json'), JSON.stringify({ type: 'module', engines: { node: '>=99' }, dependencies: { 'is-number': '>=99' } }));
    const invalid = await dockerTool<{ status: string; checks: { status: string }[] }>(root, { action: 'preflight' }, signal, environment.image);
    assert.equal(invalid.status, 'needs_setup'); assert.equal(invalid.checks.filter(item => item.status === 'failed').length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the Node agent repairs a generated import once, then preserves the real boundary defect', { skip: !enabled, timeout: 90000 }, async () => {
  const { root, snapshot } = await rootFor({ 'shipping.ts': shipping.replace('>= 10000', '> 10000'), 'package.json': '{"type":"module"}' });
  try {
    const artifact = { id: 'T1', behaviorId: 'B1', functionName: 'test_threshold', gapIndexes: [0], quote: rule, purpose: 'Exact threshold', code: "import test from 'node:test';import assert from 'node:assert/strict';import{fee}from'../shipping.ts';\nfunction test_threshold(){assert.equal(fee(10000),0)}\ntest('test_threshold',test_threshold);" };
    const report: PythonReport = { id: randomUUID(), title: 'Node boundary defect', createdAt: new Date().toISOString(), model: 'deterministic', runtime: 'node', source: 'fixture', fingerprint: snapshot.fingerprint, status: 'running', stage: '', rules: [{ id: 'R1', text: rule }], tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: [] };
    let generations = 0;
    const ask: Reason = async (schema, _task, context) => {
      if (Object.is(schema, analysisSchema)) return schema.parse({ behaviors: [{ id: 'B1', ruleId: 'R1', quote: rule, text: 'Exact threshold', category: 'boundary', issue: 'none', reason: 'Inclusive boundary', files: ['shipping.ts'], existingTests: [], evidence: [{ file: 'shipping.ts', quote: 'export function fee(amount: number)' }], gaps: ['Exact threshold missing'] }], inconsistencies: [] });
      if (Object.is(schema, testsSchema)) { generations++; return schema.parse({ tests: [generations === 1 ? { ...artifact, code: artifact.code.replace('../shipping.ts', './shipping.ts') } : artifact] }); }
      if (Object.is(schema, reviewTestsSchema)) return schema.parse({ decisions: [{ testId: 'T1', supported: true, reason: 'Original inclusive contract', quote: rule }] });
      if (Object.is(schema, diagnosisSchema) && (context as { measurement: { outcomes: { status: string }[] } }).measurement.outcomes.some(item => item.status === 'error')) return schema.parse({ decisions: [{ testId: 'T1', category: 'generated_test_error', reason: 'The artifact is stored in a child directory, so its relative import targets a missing file.', quote: rule, executionQuote: 'Cannot find module', evidence: [{ file: 'shipping.ts', quote: 'export function fee(amount: number)' }, { file: 'reqtest_generated/test_reqtest_T1.test.ts', quote: "import{fee}from'./shipping.ts'" }] }] });
      if (Object.is(schema, diagnosisSchema)) return schema.parse({ decisions: [{ testId: 'T1', category: 'potential_implementation_defect', reason: 'The exact threshold returns 1000.', quote: rule, executionQuote: '1000 !== 0', evidence: [{ file: 'shipping.ts', quote: 'amount > 10000' }, { file: 'reqtest_generated/test_reqtest_T1.test.ts', quote: 'assert.equal(fee(10000),0)' }] }] });
      throw new Error('A valid defect must not trigger test repair');
    };
    await runPython(report, root, AbortSignal.timeout(80000), () => {}, ask);
    assert.equal(report.status, 'completed'); assert.equal(report.tests[0].approved, true);
    assert.equal(report.measurements.at(-1)!.outcomes[0].file, 'reqtest_generated/test_reqtest_T1.test.ts');
    assert.equal(report.measurements[0].outcomes[0].status, 'error'); assert.equal(report.measurements.at(-1)!.outcomes[0].status, 'failed'); assert.equal(report.diagnoses.at(-1)!.category, 'potential_implementation_defect');
    assert.equal(report.improvements.length, 1); assert.equal(report.states[0].status, 'Uncertain');
    assert.equal(report.improvements[0].after[0].code, artifact.code);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real Node mutation results retain exact source patches and respond to an added boundary check', { skip: !enabled, timeout: 180000 }, async () => {
  const { root } = await rootFor({ 'shipping.ts': shipping, 'package.json': '{"type":"module"}' });
  const artifact = (id: string, name: string, amount: number) => ({ id, behaviorId: 'B1', functionName: name, quote: rule, purpose: 'Boundary', gapIndexes: [0], approved: true, code: "import test from 'node:test';import assert from 'node:assert/strict';import{fee}from'../shipping.ts';\nfunction " + name + '(){assert.equal(fee(' + amount + "),0)}\ntest('" + name + "'," + name + ');' });
  try {
    const signal = AbortSignal.timeout(170000), weak = artifact('T1', 'test_above', 20000);
    await writeTests(root, [weak]);
    const before = await mutateProject(root, 'shipping.ts', signal);
    assert.equal(before.incomplete, false, before.log); assert.ok(before.mutants.some(item => item.status === 'killed'));
    const boundary = before.mutants.find(item => /\+.*amount > 10000/.test(item.diff));
    assert.equal(boundary?.status, 'survived'); assert.match(boundary!.diff, /@@/); assert.ok(!boundary!.diff.includes('+replacement:'));
    await writeTests(root, [weak, artifact('T2', 'test_threshold', 10000)]);
    const after = await mutateProject(root, 'shipping.ts', signal);
    assert.equal(after.incomplete, false, after.log); assert.equal(after.mutants.find(item => /\+.*amount > 10000/.test(item.diff))?.status, 'killed');
    assert.equal(await readFile(join(root, 'source/shipping.ts'), 'utf8'), shipping);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Node import errors, unsupported suites and source edits cannot silently pass', { skip: !enabled, timeout: 90000 }, async () => {
  const { root } = await rootFor({ 'shipping.ts': shipping, 'package.json': '{"type":"module"}', 'bad.test.ts': "import 'reqtest_nonexistent_module';" });
  try {
    const signal = AbortSignal.timeout(80000), snapshot = await inspectProject(root, signal);
    assert.equal(snapshot.collection.exitCode, 2); assert.match(snapshot.collection.log, /Cannot find package/);
    await rm(join(root, 'source/bad.test.ts'));
    await writeFile(join(root, 'source/nested.test.ts'), "import{describe,test}from'node:test';describe('suite',()=>{test('nested',()=>{})});");
    assert.equal((await inspectProject(root, signal)).collection.exitCode, 2);
    await rm(join(root, 'source/nested.test.ts'));
    await writeFile(join(root, 'source/edit.test.ts'), "import test from 'node:test';import fs from 'node:fs';test('test_edit',()=>{fs.writeFileSync('shipping.ts','changed')});");
    assert.equal((await measureProject(root, ['edit.test.ts::test_edit'], false, signal)).integrity, false);
    assert.equal(await readFile(join(root, 'source/shipping.ts'), 'utf8'), shipping);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsupported dependency declarations fail explicitly and cancelled services leave no resources', { skip: !enabled, timeout: 90000 }, async () => {
  const { root } = await rootFor({ 'service.py': 'pass\n', 'requirements.txt': 'requests @ https://example.invalid/untrusted.whl\n' });
  try {
    const signal = AbortSignal.timeout(80000), base = await sandboxImage();
    await assert.rejects(prepareEnvironment(root, base, signal), /Direct URL dependencies are unsupported/);
    await writeFile(join(root, 'source/requirements.txt'), 'redis==999.0.0\n');
    await assert.rejects(prepareEnvironment(root, base, signal), /Dependency installation failed/);
    const scope = 'cancel-' + randomUUID(), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    try { await assert.rejects(testServices(['postgres'], controller.signal, scope), /abort/i); }
    finally { clearTimeout(timer); }
    assert.equal(activeResources(scope), '', 'Service startup cancellation must clean up its resources');
  } finally { await rm(root, { recursive: true, force: true }); }
});
