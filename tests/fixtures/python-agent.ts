import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import type { Reason } from '../../lib/python-agent';
import { analysisSchema, type PythonReport, type PythonTest } from '../../lib/python-types';

export const rule = 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.';
export const code = 'def fee(amount):\n    return 0 if amount >= 10000 else 1000\n';
export const artifact: PythonTest = {
  id: 'T1', behaviorId: 'B1', functionName: 'test_threshold', gapIndexes: [0], quote: rule,
  purpose: 'Exact threshold', code: 'from shipping import fee\ndef test_threshold():\n    assert fee(10000) == 0\n', approved: true,
};

export function report(): PythonReport {
  return {
    id: 'test', title: 'Test', createdAt: new Date().toISOString(), model: 'unused',
    source: 'synthetic fixture', fingerprint: 'test', status: 'running', stage: '',
    rules: [{ id: 'R1', text: rule }], tests: [], measurements: [], mutations: [],
    diagnoses: [], relevance: [], improvements: [], states: [], limitations: [],
  };
}

export function analysis() {
  return analysisSchema.parse({
    behaviors: [{ id: 'B1', ruleId: 'R1', quote: rule, text: 'Exact threshold', category: 'boundary',
      issue: 'none', reason: 'Explicit boundary', files: ['shipping.py'], existingTests: [],
      evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }], gaps: ['No exact-threshold test'] }],
    inconsistencies: [],
  });
}

export async function project(t: TestContext, files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-python-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'generated'));
  for (const [file, text] of Object.entries({ 'source/shipping.py': code, ...files })) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  return root;
}

export const approval = (...ids: string[]) => ({
  decisions: ids.map(testId => ({ testId, supported: true, reason: 'Exact contract', quote: rule })),
});

// Fixed responses keep real sandbox workflows reproducible without calling a model.
export function scripted(...responses: unknown[]): Reason {
  return async (schema, _task, context) => {
    if (!responses.length) throw new Error('Unexpected reasoning stage');
    const response = responses.shift();
    return schema.parse(typeof response === 'function' ? response(context) : response);
  };
}
