import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { validateAnalysis, updateStates, runPython, reviewSurvivingMutations } from '../lib/python-agent';
import { survivorReviews } from '../lib/mutation-review';
import { importProject, measureProject, mutateProject, dockerTool, type Inspection } from '../lib/python-tools';
import { analysisSchema, reviewTestsSchema, relevanceSchema, testsSchema, type PythonReport, type Measurement, type Mutation } from '../lib/python-types';
import { rule, code, artifact, report, analysis, project, approval, scripted } from './fixtures/python-agent';

const docker = { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 60000 };
const snapshot: Inspection = { files: { 'shipping.py': code }, functions: [], nodes: [], collection: { exitCode: 5, log: '' }, errors: [] };
const signal = () => new AbortController().signal;
const run = (r: PythonReport, root: string, ask: typeof import('../lib/python-agent').reason) => runPython(r, root, signal(), () => {}, ask);

function mutationReport(count = 1) {
  const r = report();
  r.analysis = analysis();
  r.mutations = [{ incomplete: false, timedOut: false, log: '', mutants: Array.from({ length: count }, (_, index) => ({ id: `Mutant #${index + 1}`, file: 'shipping.py', line: 2, status: 'survived', diff: `- >= 10000\n+ >= ${10001 + index}` })) }];
  return r;
}
const mutationDecision = (mutantId: string) => ({ mutantId, behaviorId: 'B1', relevant: true, quote: rule, reason: 'Changes the stated inclusive threshold.' });

test('analysis requires real evidence and scopes conflicts to named behaviors', () => {
  const r = report(), a = analysis();
  a.behaviors[0].evidence[0].quote = 'invented';
  assert.throws(() => validateAnalysis(a, r, snapshot), /unsupported/);
  a.behaviors[0].evidence[0].quote = 'def fee(amount):';
  a.behaviors[0].existingTests = ['tests/test_fake.py::test_x'];
  assert.throws(() => validateAnalysis(a, r, snapshot), /unknown/);
  a.behaviors[0].existingTests = [];
  a.behaviors.push({ ...a.behaviors[0], id: 'B2' });
  a.inconsistencies.push({ ruleId: 'R1', behaviorIds: ['B1'], quote: rule, description: 'Threshold conflict', evidence: a.behaviors[0].evidence });
  validateAnalysis(a, r, snapshot);
  r.analysis = a;
  updateStates(r);
  assert.deepEqual(r.states.map(state => state.status), ['Uncertain', 'Unverified']);
  a.inconsistencies[0].behaviorIds = ['B999'];
  assert.throws(() => validateAnalysis(a, r, snapshot), /unknown or unrelated behavior/);
  const omitted = analysisSchema.parse({ behaviors: [], inconsistencies: [] });
  validateAnalysis(omitted, r, snapshot);
  assert.equal(omitted.behaviors[0].issue, 'not_testable');
});

test('survivor reviews cover every batch and expire when the exact diff changes', async () => {
  const r = mutationReport(33), sizes: number[] = [];
  const review = async (mutants: Mutation['mutants']) => {
    sizes.push(mutants.length);
    return { decisions: mutants.map(mutant => mutationDecision(mutant.id)) };
  };
  await reviewSurvivingMutations(r, review);
  assert.deepEqual(sizes, [16, 16, 1]);
  assert.equal(survivorReviews(r).filter(row => row.category === 'test_gap').length, 33);
  await reviewSurvivingMutations(r, review);
  assert.equal(sizes.length, 3);
  r.mutations[0].mutants[0].diff = '- >= 10000\n+ > 10000';
  r.mutations[0].mutants[1].status = 'killed';
  await reviewSurvivingMutations(r, review);
  assert.deepEqual(sizes, [16, 16, 1, 1]);
  assert.equal(survivorReviews(r).length, 32);
});

test('invalid reviews and ambiguous contracts cannot resolve surviving mutants', async () => {
  const r = mutationReport(5);
  r.analysis!.behaviors.push({ ...r.analysis!.behaviors[0], id: 'B2', files: ['other.py'] });
  r.mutations[0].mutants[4].diff = '';
  await reviewSurvivingMutations(r, async () => ({ decisions: [
    mutationDecision('Mutant #1'), mutationDecision('Mutant #1'),
    { ...mutationDecision('Mutant #2'), behaviorId: 'B2' },
    { ...mutationDecision('Mutant #3'), quote: 'Invented contract' }, mutationDecision('Mutant #999'),
  ] }));
  assert.ok(survivorReviews(r).every(row => row.category === 'unreviewed'));
  assert.ok(!r.relevance.some(decision => decision.mutantId === 'Mutant #999'));
  r.relevance = [{ ...mutationDecision('Mutant #4'), relevant: false, grounded: true }];
  assert.equal(survivorReviews(r)[3].category, 'unreviewed', 'Legacy decisions lack file and diff evidence');
  r.analysis!.behaviors[0].issue = 'ambiguous';
  await reviewSurvivingMutations(r, async mutants => ({ decisions: mutants.map(mutant => mutationDecision(mutant.id)) }));
  assert.equal(survivorReviews(r)[0].category, 'clarification');
  r.relevance.forEach(decision => { decision.relevant = false; });
  assert.equal(survivorReviews(r)[0].category, 'clarification');
  updateStates(r);
  assert.equal(r.states[0].status, 'Uncertain');
});

test('verification requires the named execution and each behavior keeps its own mutation review', async () => {
  const r = mutationReport();
  r.analysis!.behaviors.push({ ...r.analysis!.behaviors[0], id: 'B2' });
  r.tests = [artifact, { ...artifact, id: 'T2', behaviorId: 'B2' }];
  updateStates(r);
  assert.deepEqual(r.states.map(state => state.status), ['Unverified', 'Unverified']);
  r.measurements = [{ outcomes: r.tests.map(test => ({ node: `reqtest_generated/test_reqtest_${test.id}.py::test_threshold`, file: `reqtest_generated/test_reqtest_${test.id}.py`, name: test.functionName, status: 'passed', message: '' })), exitCode: 0, log: '', timedOut: false, integrity: true }];
  await reviewSurvivingMutations(r, async () => ({ decisions: [{ ...mutationDecision('Mutant #1'), relevant: false }] }));
  updateStates(r);
  assert.deepEqual(r.states.map(state => state.status), ['Verified', 'Partially Verified']);
  r.mutations[0].mutants[0].diff += '\nchanged';
  updateStates(r);
  assert.equal(r.states[0].status, 'Partially Verified');
  r.mutations = [];
  const outcome = r.measurements[0].outcomes[0];
  for (const [file, name, status, expected] of [
    ['wrong.py', 'test_threshold', 'passed', 'Unverified'],
    ['reqtest_generated/test_reqtest_T1.py', '<module>', 'passed', 'Unverified'],
    ['reqtest_generated/test_reqtest_T1.py', '<module>', 'error', 'Uncertain'],
  ] as const) {
    Object.assign(outcome, { file, name, status });
    updateStates(r);
    assert.equal(r.states[0].status, expected);
  }
  Object.assign(outcome, { name: 'test_threshold', status: 'passed' });
  updateStates(r);
  assert.equal(r.states[0].status, 'Verified');
  r.mutations = [{ mutants: [], incomplete: true, timedOut: true, log: 'timeout' }];
  updateStates(r);
  assert.equal(r.states[0].status, 'Partially Verified');
  r.mutations = [];
  r.collection = { exitCode: -1, log: 'Collection timed out.', timedOut: true };
  updateStates(r);
  assert.equal(r.states[0].status, 'Uncertain');
});

test('ZIP traversal and expanded-size limits are rejected', async t => {
  const root = await project(t);
  for (const [name, contents, error] of [['../escape.py', 'pass', /Unsafe/], ['big.py', 'x'.repeat(200001), /exceeds/]] as const) {
    const zip = new JSZip();
    zip.file(name, contents);
    await assert.rejects(importProject(root, await zip.generateAsync({ type: 'nodebuffer' })), error);
  }
});

test('timed-out commands stop child processes and retain partial output', { ...docker, timeout: 15000 }, () => {
  const script = `import runpy,sys,time
from pathlib import Path
command=runpy.run_path('/tool/worker.py')['command']
child="import time;from pathlib import Path;time.sleep(0.8);Path('/tmp/leaked-child').write_text('leaked')"
parent="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',"+repr(child)+"]);print('partial progress',flush=True);time.sleep(10)"
code,log,timed=command([sys.executable,'-c',parent],0.2)
assert timed and code==-1 and 'partial progress' in log and 'process group was stopped' in log
time.sleep(1)
assert not Path('/tmp/leaked-child').exists()
`;
  execFileSync('docker', ['run', '--rm', '-i', '--network', 'none', '--read-only', '--tmpfs', '/work:rw,exec,size=32m,mode=1777', '--tmpfs', '/tmp:rw,exec,size=32m,mode=1777', '--entrypoint', 'python', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', '-'], { input: script, timeout: 12000 });
});

test('mutation scope uses approved direct calls and preserves collection setup without existing assertions', docker, async t => {
  const existing = 'tests/test_existing.py::test_existing';
  const root = await project(t, {
    'source/shipping.py': code + '\ndef unrelated(value):\n    return value + 12345\n',
    'source/pyproject.toml': '[tool.pytest.ini_options]\ntestpaths=["tests"]\n',
    'source/tests/conftest.py': 'import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).parent))\n',
    'source/tests/local_support.py': 'AMOUNT = 20000\n',
    'source/tests/test_existing.py': 'def test_existing():\n    assert False, "Existing assertions must be deselected"\n',
    'generated/test_reqtest_T1.py': 'from local_support import AMOUNT\nfrom shipping import fee as shipping_fee\ndef test_above():\n    assert shipping_fee(AMOUNT) == 0\n',
  });
  const result = await mutateProject(root, 'shipping.py', AbortSignal.timeout(40000), undefined, undefined, [existing]);
  assert.equal(result.incomplete, false, result.log);
  assert.deepEqual(result.scope?.functions, ['fee']);
  assert.equal(result.scope?.suite, 'approved_generated');
  assert.deepEqual(result.scope?.setupFiles, ['tests/conftest.py']);
  assert.ok(result.mutants.every(mutant => mutant.line <= 2 && mutant.diff.includes('shipping.py')));
  assert.ok(result.mutants.some(mutant => mutant.status === 'killed'));
  assert.ok(result.mutants.some(mutant => mutant.status === 'survived'));
});

test('mutation timeout retains completed and untested outcomes without claiming completeness', docker, async t => {
  const root = await project(t, {
    'source/business.py': 'def calculate(value):\n' + '    value += 1\n'.repeat(80) + '    return value\n',
    'generated/test_reqtest_T1.py': 'import business as target\ndef test_total():\n    assert target.calculate(0) == 80\n',
  });
  const result = await dockerTool<Mutation>(root, { action: 'mutate', file: 'business.py', seconds: 10 }, AbortSignal.timeout(35000));
  assert.equal(result.timedOut, true);
  assert.equal(result.incomplete, true);
  assert.ok(result.mutants.some(mutant => mutant.status === 'killed'), result.log);
  assert.ok(result.mutants.some(mutant => mutant.status === 'unknown'));
  assert.ok(result.mutants.every(mutant => mutant.diff.trim()));
  assert.match(result.log, /process group was stopped/);
});

test('real failures in original and generated tests preserve a genuine implementation defect', docker, async t => {
  const original = 'tests/test_existing.py::test_threshold';
  const root = await project(t, {
    'source/shipping.py': code.replace('>= 10000', '> 10000'),
    'source/tests/test_existing.py': artifact.code,
  });
  const a = analysis(), r = report();
  a.behaviors[0].existingTests = [original];
  a.behaviors[0].evidence.push({ file: 'tests/test_existing.py', quote: 'assert fee(10000) == 0' });
  const defect = (testId: string) => ({ testId, category: 'potential_implementation_defect', reason: 'The implementation excludes the required exact threshold.', quote: rule, executionQuote: 'assert 1000 == 0', evidence: [{ file: 'shipping.py', quote: '> 10000' }, { file: testId === 'T1' ? 'reqtest_generated/test_reqtest_T1.py' : 'tests/test_existing.py', quote: 'assert fee(10000) == 0' }] });
  await run(r, root, scripted(a, { decisions: [defect(original)] }, { tests: [artifact] }, approval('T1'), { decisions: [defect(original), defect('T1')] }));
  assert.equal(r.status, 'completed');
  assert.equal(r.baseline?.outcomes[0].status, 'failed');
  assert.ok(r.measurements[0].outcomes.every(outcome => outcome.status === 'failed'));
  assert.deepEqual(r.diagnoses.map(item => item.phase), ['baseline', 'execution', 'execution']);
  assert.ok(r.diagnoses.every(item => item.category === 'potential_implementation_defect'));
  assert.equal(r.improvements.length, 0);
  assert.equal(r.states[0].status, 'Uncertain');
  assert.equal(await readFile(join(root, 'source/tests/test_existing.py'), 'utf8'), artifact.code);
  assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code.replace('>= 10000', '> 10000'));
});

test('only a unique grounded diagnosis authorizes one repair of the recorded generated failure', docker, async t => {
  for (const mode of ['valid', 'duplicate', 'unsupported', 'function-id', 'unknown-id'] as const) {
    const root = await project(t), r = report();
    const bad = { ...artifact, code: artifact.code.replace('== 0', '== 1') };
    const rejectedId = mode === 'function-id' ? 'test_threshold' : mode === 'unknown-id' ? 'T999' : '';
    const diagnosis = (context: unknown) => {
      const { measurement, failedTestIds } = context as { measurement: Measurement; failedTestIds: string[] };
      assert.deepEqual(failedTestIds, ['T1']);
      const decision = { testId: rejectedId || measurement.outcomes.find(outcome => outcome.status === 'failed')!.node, category: 'generated_test_error', reason: 'The contract requires 0 rather than the generated expectation 1.', quote: rule, executionQuote: 'assert 0 == 1', evidence: [{ file: 'shipping.py', quote: 'return 0 if amount >= 10000 else 1000' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: mode === 'unsupported' ? 'invented assertion' : 'assert fee(10000) == 1' }] };
      return { decisions: mode === 'duplicate' ? [decision, { ...decision, testId: 'T1' }] : [decision] };
    };
    await run(r, root, scripted(analysis(), { tests: [bad] }, approval('T1'), diagnosis, { tests: [artifact] }, approval('T1')));
    assert.equal(r.diagnoses[0].testId, 'T1');
    if (rejectedId) assert.equal(r.proposedDiagnoses![0].testId, rejectedId);
    else assert.match(r.proposedDiagnoses![0].testId, /^reqtest_generated\//);
    assert.equal(r.improvements.length, mode === 'valid' ? 1 : 0);
    assert.equal(r.diagnoses[0].category, mode === 'valid' ? 'generated_test_error' : 'uncertain');
    assert.equal(r.measurements.at(-1)!.outcomes[0].status, mode === 'valid' ? 'passed' : 'failed');
    assert.ok(r.measurements.every(measurement => measurement.integrity));
    assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
  }
});

test('collection and baseline dependency failures are diagnosed without generating or repairing tests', docker, async t => {
  const root = await project(t, { 'source/tests/test_missing.py': 'import reqtest_missing_dependency\n' }), r = report();
  const diagnosis = (context: unknown) => ({ decisions: (context as { failedTestIds: string[] }).failedTestIds.map(testId => ({ testId, category: 'environment_failure', reason: 'An existing test needs an unavailable dependency.', quote: '', executionQuote: "ModuleNotFoundError: No module named 'reqtest_missing_dependency'", evidence: [{ file: 'tests/test_missing.py', quote: 'import reqtest_missing_dependency' }] })) });
  await run(r, root, scripted(analysis(), diagnosis, diagnosis, { tests: [] }));
  assert.equal(r.collection?.exitCode, 2);
  assert.equal(r.baseline?.exitCode, 2);
  assert.equal(r.measurements[0].exitCode, 5);
  assert.deepEqual(r.diagnoses.map(item => item.phase), ['collection', 'baseline']);
  assert.ok(r.diagnoses.every(item => item.category === 'environment_failure' && item.executionQuote));
  assert.equal(r.tests.length, 0);
  assert.equal(r.improvements.length, 0);
  assert.equal(r.states[0].status, 'Uncertain');
});

test('sandbox evidence distinguishes runtime SQLite files from tampering and preserves original mounts', docker, async t => {
  const root = await project(t);
  const generated = join(root, 'generated/test_reqtest_T1.py');
  await writeFile(generated, 'import sqlite3\ndef test_runtime_database():\n    with sqlite3.connect("users.db") as connection:\n        connection.execute("CREATE TABLE users (id INTEGER)")\n');
  const runtime = await measureProject(root, [], true, signal());
  assert.equal(runtime.integrity, true);
  assert.equal(runtime.outcomes[0].status, 'passed');
  assert.equal(runtime.runtimeArtifacts?.[0].file, 'users.db');
  assert.match(runtime.runtimeArtifacts![0].sha256, /^[a-f0-9]{64}$/);
  for (const statement of ['Path("fake.db").write_text("not a SQLite database")', 'Path(__file__).write_text("# changed")']) {
    const tampering = `from pathlib import Path\ndef test_tamper():\n    ${statement}\n`;
    await writeFile(generated, tampering);
    const measurement = await measureProject(root, [], true, signal());
    assert.equal(measurement.outcomes[0].status, 'passed');
    assert.equal(measurement.integrity, false);
    assert.deepEqual(measurement.runtimeArtifacts, []);
    assert.equal(await readFile(generated, 'utf8'), tampering);
    assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
  }
});

test('one analysis correction retains the rejected response and still enforces real evidence', docker, async t => {
  for (const corrected of [true, false]) {
    const root = await project(t), r = report(), invalid = analysis();
    invalid.behaviors[0].evidence[0].quote = code.replaceAll('\n', '\\n');
    const ask = scripted(invalid, corrected ? analysis() : invalid, { tests: [] });
    if (corrected) {
      await run(r, root, ask);
      assert.equal(r.status, 'completed');
      assert.equal(r.analysis!.behaviors[0].evidence[0].quote, 'def fee(amount):');
    } else await assert.rejects(run(r, root, ask), /unsupported/);
    assert.match(r.analysisCorrection!.error, /unsupported/);
    assert.equal(r.analysisCorrection!.original.behaviors[0].evidence[0].quote, invalid.behaviors[0].evidence[0].quote);
    assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
  }
});

test('real mutmut survivors trigger one targeted improvement and re-measurement', { ...docker, timeout: 180000 }, async t => {
  const root = await project(t, {
    'source/README.md': 'Shipping fee API: import fee from shipping.',
    'source/tests/test_shipping.py': 'from shipping import fee\ndef test_standard():\n    assert fee(0) == 1000\n',
  });
  const r = report();
  let generation = 0;
  const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
    if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
    if (Object.is(schema, testsSchema)) return schema.parse({ tests: generation++ === 0 ? [{ ...artifact, gapIndexes: [], functionName: 'test_above', code: 'from shipping import fee\ndef test_above():\n    assert fee(20000) == 0\n' }] : [{ ...artifact, id: 'T2' }] });
    if (Object.is(schema, reviewTestsSchema)) return schema.parse(approval(...(context as { tests: { id: string }[] }).tests.map(test => test.id)));
    if (Object.is(schema, relevanceSchema)) return schema.parse({ decisions: (context as { mutants: Mutation['mutants'] }).mutants.map(mutant => ({ ...mutationDecision(mutant.id), relevant: /\+.*(?:amount > 10000|amount >= 10001)/.test(mutant.diff), reason: 'Only the inclusive boundary belongs to the stated >=10000 contract.' })) });
    throw new Error('Unexpected diagnosis for a passing fixture');
  };
  await run(r, root, ask);
  const boundaries = r.mutations[0].mutants.filter(mutant => mutant.status === 'survived' && /\+.*(?:amount > 10000|amount >= 10001)/.test(mutant.diff));
  assert.ok(boundaries.length);
  assert.ok(boundaries.every(before => r.mutations[1].mutants.some(after => after.id === before.id && after.status === 'killed')));
  assert.ok(r.mutations.every(attempt => attempt.mutants.every(mutant => mutant.diff.trim())));
  assert.equal(r.improvements.length, 1);
  assert.equal(r.measurements.length, 2);
  assert.equal(r.mutations.length, 2);
  assert.deepEqual(r.mutations[0].scope, r.mutations[1].scope);
  assert.equal(r.tests.length, 2);
  assert.equal(r.initialStates?.[0].status, 'Partially Verified');
  assert.equal(r.states[0].status, 'Verified');
  assert.equal(r.retrieval?.documents[0].file, 'README.md');
  assert.equal(r.retrieval?.documents[0].text, 'Shipping fee API: import fee from shipping.');
  assert.match(r.retrieval!.documents[0].sha256, /^[a-f0-9]{64}$/);
});
