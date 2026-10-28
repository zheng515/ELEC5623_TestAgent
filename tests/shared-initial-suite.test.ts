import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { runPython, validateAnalysis, type Reason } from '../lib/python-agent';
import { executableSuiteHash } from '../lib/test-suite';
import { importProject } from '../lib/python-tools';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema } from '../lib/python-types';
import { report, analysis, artifact, code, rule, project } from './fixtures/python-agent';

test('shared-suite analysis cannot move a test to another requirement or renumber its behavior', () => {
  const r = report(), a = analysis(), snapshot = { files: { 'shipping.py': code }, functions: [], nodes: [], errors: [], collection: { exitCode: 5, log: '' } };
  for (const change of [{ id: 'B2' }, { ruleId: 'R2' }]) {
    const changed = structuredClone(a); Object.assign(changed.behaviors[0], change);
    assert.throws(() => validateAnalysis(changed, r, snapshot, a.behaviors), /unchanged behavior IDs/);
  }
});

test('a shared B1 suite is not regenerated; one additive boundary check exposes the defect', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 50000 }, async t => {
  const root = await project(t), zip = new JSZip(), implementation = code.replace('>=', '>');
  zip.file('shipping.py', implementation);
  const source = await importProject(root, await zip.generateAsync({ type: 'nodebuffer' }));
  const initial = report(); initial.id = 'shared-prefix'; initial.fingerprint = source.fingerprint;
  const interior = { ...artifact, functionName: 'test_above', code: 'from shipping import fee\ndef test_above():\n    assert fee(20000) == 0\n' };
  let initialGenerations = 0;
  const generate: Reason = async (schema) => {
    assert.ok(Object.is(schema, testsSchema)); initialGenerations++;
    return schema.parse({ tests: [interior] });
  };
  await runPython(initial, root, AbortSignal.timeout(15000), () => {}, generate, 'B1');
  assert.equal(initialGenerations, 1); assert.equal(initial.measurements[0].outcomes[0].status, 'passed');
  const frozen = JSON.stringify(initial);
  const nextRoot = await project(t); await importProject(nextRoot, await zip.generateAsync({ type: 'nodebuffer' }));
  const next = report(); next.fingerprint = source.fingerprint;
  let additions = 0, reviews = 0;
  const ask: Reason = async (schema, task, raw) => {
    if (Object.is(schema, analysisSchema)) {
      assert.equal((raw as { initialTests: typeof initial.tests }).initialTests[0].code, interior.code);
      return schema.parse(analysis());
    }
    if (Object.is(schema, reviewTestsSchema)) {
      const second = reviews++ > 0;
      return schema.parse({ decisions: [{ testId: second ? 'T2' : 'T1', supported: true, quote: rule, reason: 'Supported focused witness.' }], coverage: [{ ruleId: 'R1', quote: rule, complete: second, reason: second ? 'Boundary check added.' : 'Inclusive boundary is missing.', testIds: second ? ['T1', 'T2'] : ['T1'], missingExamples: second ? [] : ['>= 10000'] }] });
    }
    if (Object.is(schema, testsSchema)) {
      additions++; assert.match(task, /Add NEW tests/);
      return schema.parse({ tests: [{ ...artifact, id: 'T2' }] });
    }
    if (Object.is(schema, diagnosisSchema)) return schema.parse({ decisions: [{ testId: 'T2', category: 'potential_implementation_defect', quote: rule, executionQuote: 'assert 1000 == 0', reason: 'The implementation excludes the inclusive boundary.', evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }, { file: 'reqtest_generated/test_reqtest_T2.py', quote: 'assert fee(10000) == 0' }] }] });
    throw new Error('Unexpected continuation stage.');
  };
  await runPython(next, nextRoot, AbortSignal.timeout(30000), () => {}, ask, 'B3', undefined, initial);
  assert.equal(additions, 1); assert.equal(reviews, 2);
  assert.equal(executableSuiteHash(next.testAttempts![0].tests), executableSuiteHash(initial.tests));
  assert.equal(next.initialSuite!.reportId, initial.id);
  assert.equal(next.tests[0].code, interior.code);
  assert.equal(next.measurements.at(-1)!.outcomes.find(outcome => outcome.file.endsWith('T2.py'))?.status, 'failed');
  assert.equal(next.diagnoses[0].category, 'potential_implementation_defect');
  assert.equal(next.improvements.length, 1);
  assert.equal(JSON.stringify(initial), frozen);
  assert.equal(await readFile(join(nextRoot, 'source/shipping.py'), 'utf8'), implementation);
  for (const changed of [ { ...initial, model: 'different' }, { ...initial, fingerprint: 'different' }, { ...initial, rules: [{ id: 'R1', text: 'Different rule' }] } ]) {
    await assert.rejects(runPython(report(), nextRoot, AbortSignal.timeout(5000), () => {}, async () => { throw new Error('No model request allowed.'); }, 'B3', undefined, changed), /identical source/);
  }
});

test('paired CLI stops at its follow-up budget without making another provider request', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 40000 }, async t => {
  const root = await project(t), projectPath = join(root, 'source');
  const requirements = join(root, 'requirements.txt'), gold = join(root, 'gold.json'), manifest = join(root, 'manifest.json'), transport = join(root, 'transport.mjs');
  await writeFile(requirements, 'R1: ' + rule);
  await writeFile(gold, JSON.stringify({ reviewed: false, reviewer: '', issues: [], inconsistencies: [], behaviors: [{ id: 'threshold', ruleId: 'R1', description: rule, initialGap: true }] }));
  await writeFile(manifest, JSON.stringify({ purpose: 'pilot', repeat: 1, variants: ['B1', 'B3'], sharedInitialSuite: true, followupRequestLimit: 1, cases: [{ id: 'budget', project: projectPath, requirements, gold }] }));
  await writeFile(transport, `globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') throw Error('External network is forbidden in this fixture.');
    const body = JSON.parse(init.body), message = body.input.find(m => m.role === 'user');
    const context = JSON.parse(typeof message.content === 'string' ? message.content : message.content.find(c => c.type === 'input_text').text);
    const output = context.initialTests ? { behaviors: [{ id: 'B1', ruleId: 'R1', quote: context.rules[0].text, text: 'Threshold', category: 'boundary', issue: 'none', reason: 'Scripted budget fixture.', files: ['shipping.py'], existingTests: [], evidence: [{ file: 'shipping.py', line: 1 }], gaps: [] }], inconsistencies: [] } : { tests: [{ id: 'T1', behaviorId: 'B1', functionName: 'test_threshold', code: ${JSON.stringify(artifact.code)}, gapIndexes: [0], quote: context.rules[0].text, purpose: 'Threshold' }] };
    return Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: body.model, output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
  };`);
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--import', transport, 'scripts/evaluate.ts', manifest], { cwd: process.cwd(), timeout: 35000, env: { ...process.env, OPENAI_API_KEY: 'scripted-fixture-not-a-key', REQTEST_LLM_MODEL: 'scripted-fixture' } });
  const output = /Experiment: (.*); 2 planned runs/.exec(stdout)?.[1];
  assert.ok(output?.startsWith(join(process.cwd(), '.evidence/evaluation/')));
  t.after(() => rm(output!, { recursive: true, force: true }));
  const index = JSON.parse(await readFile(join(output!, 'index.json'), 'utf8'));
  const initial = JSON.parse(await readFile(join(output!, index.runs[0].report), 'utf8'));
  const stopped = JSON.parse(await readFile(join(output!, index.runs[1].report), 'utf8'));
  const requests = JSON.parse(await readFile(join(output!, index.runs[1].requests), 'utf8'));
  assert.equal(initial.status, 'completed'); assert.equal(stopped.status, 'failed');
  assert.match(stopped.error, /^Follow-up model request budget exhausted/);
  assert.equal(requests.length, 1);
  assert.equal(index.runs[1].initialReport, index.runs[0].report);
  assert.equal(executableSuiteHash(stopped.testAttempts[0].tests), executableSuiteHash(initial.tests));
  assert.ok(stopped.states.every((state: { status: string }) => state.status !== 'Verified'));
});
