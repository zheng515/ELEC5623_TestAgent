import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionEvidence } from '../lib/execution-evidence';
import { groundedDiagnosisSchema, originalQuoteSchema } from '../lib/python-types';
import type { Measurement } from '../lib/python-types';
import { asSchema } from 'ai';
import { reason } from '../lib/python-agent';
import { diagnosisSchema } from '../lib/python-types';

test('execution references restore exact trace indentation and reject invented or rewritten quotes', async () => {
  const line = 'E           assert [1, 3] == [1]';
  const measured: Measurement = { outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_value', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_value', status: 'failed', message: 'test body\n' + line }], log: line, exitCode: 1, integrity: true, timedOut: false };
  const before = structuredClone(measured);
  const catalog = executionEvidence(measured);
  const reference = catalog.references.find(item => item.quote === line)!;
  assert.ok(reference);
  assert.deepEqual(measured, before);
  const provider = asSchema(groundedDiagnosisSchema(['T1'], originalQuoteSchema(['', 'Value contract']), undefined, undefined, catalog.references));
  const decision = { testId: 'T1', category: 'generated_test_error', reason: 'Fixture trace', quote: 'Value contract', executionQuote: reference.id, evidence: [] };
  const accepted = await provider.validate!({ decisions: [decision] });
  assert.equal(accepted.success, true);
  if (accepted.success) assert.equal(accepted.value.decisions[0].executionQuote, line);
  for (const executionQuote of ['E999', line, line.trim()]) assert.equal((await provider.validate!({ decisions: [{ ...decision, executionQuote }] })).success, false);
  assert.ok(!JSON.stringify(provider.jsonSchema).includes('[1, 3]'));
  assert.ok(executionEvidence(measured, 50).scope.selectedBytes <= 50);
});

test('official SDK sends execution IDs and restores only supplied raw trace lines', async t => {
  const savedKey = process.env.OPENAI_API_KEY, savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey; });
  process.env.OPENAI_API_KEY = 'execution-reference-fixture-not-a-key';
  const line = 'E           assert [1, 3] == [1]';
  const context = { rules: [{ id: 'R1', text: 'R1\nThe recorded callback list is checked.' }], failedTestIds: ['T1'], files: { 'value.py': 'VALUE = 42\n' }, measurement: { outcomes: [{ node: 'reqtest_generated/test_reqtest_T1.py::test_value', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_value', status: 'failed', message: line }], log: line, exitCode: 1, integrity: true, timedOut: false } };
  const before = structuredClone(context);
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const user = body.input.find((message: { role: string }) => message.role === 'user');
    const prompt = typeof user.content === 'string' ? user.content : user.content.find((item: { type: string }) => item.type === 'input_text').text;
    const input = JSON.parse(prompt);
    const reference = input.executionReferences.find((item: { quote: string }) => item.quote === line);
    assert.ok(reference);
    assert.ok(!JSON.stringify(body.text.format.schema).includes('[1, 3]'));
    const output = { decisions: [{ testId: 'T1', category: 'generated_test_error', reason: 'Scripted SDK fixture.', quote: 'R1', executionQuote: reference.id, evidence: [] }] };
    return Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: body.model,
      output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
  };
  const result = await reason(diagnosisSchema, 'Execution quote fixture', context, 'gpt-6-luna', new AbortController().signal);
  assert.equal(result.decisions[0].executionQuote, line);
  assert.deepEqual(context, before);
});
