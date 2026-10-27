import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { probeReferenceSuite, validateReference } from '../lib/evaluation-tools';
import type { Gold } from '../lib/evaluation';
import { report, artifact } from './fixtures/python-agent';

test('external contract witnesses reject invalid references and preserve the original project', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-reference-'));
  try {
    const zip = new JSZip(); zip.file('booking.py', 'def fee(hours):\n    return 0 if hours > 24 else 2500\n');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    const gold: Gold = { reviewed: false, reviewer: '', issues: [], inconsistencies: [], behaviors: [{ id: 'threshold', ruleId: 'R1', description: '24 hours is free.', initialGap: true }], fault: { id: 'exclusive', file: 'booking.py', before: 'hours > 24', after: 'hours >= 24' } };
    const oracle = 'from booking import fee\ndef test_contract():\n    assert fee(24) == 0\n    assert fee(23) == 2500\n';
    const checked = await validateReference(join(root, 'valid'), archive, gold, oracle, new AbortController().signal);
    assert.equal(checked.valid, true); assert.equal(checked.original.exitCode, 1); assert.equal(checked.corrected?.exitCode, 0);
    assert.match(await readFile(join(root, 'valid/original/source/booking.py'), 'utf8'), /hours > 24/);
    assert.match(checked.sourceFingerprint, /^[a-f0-9]{64}$/); assert.match(checked.oracleHash, /^[a-f0-9]{64}$/);
    assert.equal(gold.reviewed, false, 'Automatic validation must not impersonate a human reviewer.');
    const candidate = report(); candidate.fingerprint = checked.sourceFingerprint; candidate.tests = [{ ...artifact, approved: true, code: 'from booking import fee\ndef test_fee():\n    assert fee(24) == 0\n    assert fee(23) == 0\n', functionName: 'test_fee' }];
    const replay = await probeReferenceSuite(join(root, 'replay'), archive, gold, candidate, new AbortController().signal);
    assert.equal(replay.exitCode, 1, 'An unsupported interior assertion must remain visible on the corrected copy.');
    assert.equal(replay.outcomes[0].status, 'failed');
    assert.match(await readFile(join(root, 'valid/original/source/booking.py'), 'utf8'), /hours > 24/);
    const invalid = await validateReference(join(root, 'invalid'), archive, { ...gold, fault: undefined }, oracle, new AbortController().signal);
    assert.equal(invalid.valid, false, 'An unlabelled fault must fail the no-fault reference check.');
  } finally { await rm(root, { recursive: true, force: true }); }
});
