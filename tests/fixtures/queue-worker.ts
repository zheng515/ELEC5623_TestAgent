import { appendFile } from 'node:fs/promises';
import { startWorker } from '../../lib/run-queue';
import { database } from '../../lib/auth';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema } from '../../lib/python-types';
import type { Reason } from '../../lib/python-agent';

const rule = 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.';
const ask: Reason = async (schema, _task, _context, _model, signal) => {
  const kind = Object.is(schema, analysisSchema) ? 'analysis' : Object.is(schema, testsSchema) ? 'generation' : Object.is(schema, reviewTestsSchema) ? 'review' : 'diagnosis';
  await appendFile(process.env.QUEUE_TEST_CALLS!, kind + '\n');
  if (kind === 'generation' && process.argv.includes('--hold')) {
    process.send?.({ event: 'blocked' });
    await new Promise<void>((_resolve, reject) => {
      signal.throwIfAborted();
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }
  if (kind === 'analysis') return schema.parse({ behaviors: [{ id: 'B1', ruleId: 'R1', quote: rule, text: 'Exact threshold', category: 'boundary', issue: 'none', reason: 'Explicit inclusive boundary', files: ['shipping.py'], existingTests: [], evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }], gaps: ['Exact threshold not tested'] }], inconsistencies: [] });
  if (kind === 'generation') return schema.parse({ tests: [{ id: 'T1', behaviorId: 'B1', functionName: 'test_threshold', gapIndexes: [0], quote: rule, purpose: 'Exact threshold', code: 'from shipping import fee\ndef test_threshold():\n    assert fee(10000) == 0\n' }] });
  if (kind === 'review') return schema.parse({ decisions: [{ testId: 'T1', supported: true, reason: 'Explicit original contract', quote: rule }] });
  if (Object.is(schema, diagnosisSchema)) return schema.parse({ decisions: [{ testId: 'T1', category: 'potential_implementation_defect', reason: 'The exact threshold returns 1000 instead of the required zero.', quote: rule, executionQuote: 'assert 1000 == 0', evidence: [{ file: 'shipping.py', quote: '> 10000' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: 'assert fee(10000) == 0' }] }] });
  throw new Error('Unexpected reasoning action');
};

async function main() {
  const boss = await startWorker(ask);
  process.send?.({ event: 'ready' });
  const stop = async () => { await boss.stop({ graceful: true, timeout: 1000 }); await database.end(); process.disconnect?.(); };
  process.once('SIGTERM', () => { void stop(); });
}
main().catch(error => { console.error(error.message); process.exit(1); });
