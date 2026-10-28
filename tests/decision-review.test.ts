import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decisionCases } from '../examples/benchmark/decision-cases';
import { decisionHash, decisionReferenceSchema } from '../lib/decision-evaluation';
import { prepareDecisionReview } from '../lib/decision-review';

test('review preparation exports actual failure evidence without predictions, draft answers or invented review', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-review-pack-')); t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, 'pack'), cases = [decisionCases.find(item => item.id === 'C13')!];
  await prepareDecisionReview(target, cases, AbortSignal.timeout(15000));
  const pack = JSON.parse(await readFile(join(target, 'cases.json'), 'utf8'));
  assert.equal(pack[0].execution.integrity, true); assert.equal(pack[0].execution.outcomes[0].status, 'failed');
  assert.match(pack[0].execution.log, /invalid amount/);
  assert.equal(pack[0].analysis, undefined); assert.equal(pack[0].prediction, undefined); assert.equal(pack[0].allowed, undefined);
  const template = JSON.parse(await readFile(join(target, 'reference.template.json'), 'utf8'));
  assert.equal(template.reviewed, false); assert.equal(template.reviewer, ''); assert.deepEqual(template.labels[0].allowed, []);
  assert.equal(template.datasetHash, decisionHash(cases)); assert.equal(decisionReferenceSchema.safeParse(template).success, false, 'Blank templates cannot produce accuracy scores.');
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  assert.equal(manifest.modelCalls, 0); assert.equal(manifest.evidenceHash, decisionHash(pack));
  await assert.rejects(prepareDecisionReview(target, cases, AbortSignal.timeout(3000)), /EEXIST/);
});
