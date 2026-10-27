import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSchema } from 'ai';
import { createHash } from 'node:crypto';
import { sourceEvidenceSchema, groundedAnalysisSchema, groundedDiagnosisSchema, originalQuoteSchema, analysisSchema, diagnosisSchema, reviewTestsSchema } from '../lib/python-types';
import { reason, validateAnalysis, assertionPolicy, testReviewTask, type ReasonUsage } from '../lib/python-agent';
import { analysis, artifact, code, rule, report } from './fixtures/python-agent';

test('source references resolve exact lines and reject invented, blank and out-of-file references', () => {
  const files = { 'shipping.py': code, 'README.md': 'Heading\r\n  Original wording.\r\n', 'empty.txt': '' };
  const schema = sourceEvidenceSchema(files);
  assert.deepEqual(schema.parse({ file: 'README.md', line: 2 }), { file: 'README.md', line: 2, quote: '  Original wording.\r' });
  assert.deepEqual(schema.parse({ file: 'shipping.py', line: 1 }), { file: 'shipping.py', line: 1, quote: 'def fee(amount):' });
  for (const reference of [
    { file: 'invented.py', line: 1 }, { file: 'empty.txt', line: 1 }, { file: 'shipping.py', line: 3 },
    { file: 'README.md', line: 4 }, { file: 'shipping.py', line: 0 }, { file: 'shipping.py', line: -1 },
    { file: 'shipping.py', line: 1.5 }, { file: 'shipping.py', line: '1' }, { file: 'shipping.py', quote: 'Invented quotation' },
  ]) assert.equal(schema.safeParse(reference).success, false, JSON.stringify(reference));
  const extra = schema.parse({ file: 'shipping.py', line: 1, quote: 'Invented quotation' });
  assert.equal(extra.quote, 'def fee(amount):', 'Never use a model-supplied quotation even if the response includes an extra field.');
});

test('provider schemas decode line references while legacy saved quotes remain supported', async () => {
  const original = 'R1\n' + rule;
  const files = { 'shipping.py': code };
  const source = analysis();
  const encoded = { ...source, behaviors: source.behaviors.map(behavior => ({ ...behavior, quote: 'R1', evidence: [{ file: 'shipping.py', line: 1 }] })) };
  const provider = asSchema(groundedAnalysisSchema(files, [], [original], ['R1'], true));
  const accepted = await provider.validate!(encoded);
  assert.equal(accepted.success, true);
  if (accepted.success) {
    assert.equal(accepted.value.behaviors[0].quote, original);
    assert.deepEqual(accepted.value.behaviors[0].evidence[0], { file: 'shipping.py', line: 1, quote: 'def fee(amount):' });
  }
  const json = JSON.stringify(provider.jsonSchema);
  assert.ok(json.includes('"line"')); assert.ok(!json.includes('def fee(amount):'), 'The schema does not enumerate source text.');
  assert.equal((await provider.validate!({ ...encoded, behaviors: [{ ...encoded.behaviors[0], evidence: [{ file: 'shipping.py', line: 99 }] }] })).success, false);
  const diagnosis = asSchema(groundedDiagnosisSchema(['T1'], originalQuoteSchema([original], ['R1']), files));
  const decoded = await diagnosis.validate!({ decisions: [{ testId: 'T1', category: 'uncertain', reason: 'No semantic support claimed.', quote: 'R1', executionQuote: 'raw log', evidence: [{ file: 'shipping.py', line: 2 }] }] });
  assert.equal(decoded.success, true);
  if (decoded.success) assert.equal(decoded.value.decisions[0].evidence[0].quote, '    return 0 if amount >= 10000 else 1000');
  assert.equal(groundedAnalysisSchema(files, [], [rule]).safeParse(source).success, true, 'Legacy quote-based data remains readable.');
  const wrongLine = analysis(); wrongLine.behaviors[0].evidence[0] = { ...wrongLine.behaviors[0].evidence[0], line: 2 };
  assert.throws(() => validateAnalysis(wrongLine, report(), { files, functions: [], nodes: [], errors: [], collection: { exitCode: 5, log: '' } }), /unsupported/);
  validateAnalysis(source, report(), { files, functions: [], nodes: [], errors: [], collection: { exitCode: 5, log: '' } });
});

test('mocked official SDK requests send numbered files, restore originals and fail closed on invalid lines', async t => {
  const savedKey = process.env.OPENAI_API_KEY, savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey; });
  process.env.OPENAI_API_KEY = 'source-citation-fixture-not-a-key';
  const original = 'R1\n' + rule;
  const context = { rules: [{ id: 'R1', text: original }], files: { 'shipping.py': code, 'reqtest_generated/test_reqtest_T1.py': artifact.code }, existingTests: [], failedTestIds: ['T1'] };
  const before = structuredClone(context), prompts: string[] = [];
  let numbered = true;
  const base = analysis();
  let output: unknown = { ...base, behaviors: base.behaviors.map(behavior => ({ ...behavior, quote: 'R1', evidence: [{ file: 'shipping.py', line: 1 }] })) };
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    const user = body.input.find((message: { role: string }) => message.role === 'user');
    const prompt = typeof user.content === 'string' ? user.content : user.content.find((item: { type: string }) => item.type === 'input_text').text;
    const system = body.input.find((message: { role: string }) => ['system', 'developer'].includes(message.role));
    const instructions = typeof system.content === 'string' ? system.content : system.content.find((item: { type: string }) => item.type === 'input_text').text;
    assert.equal(instructions.split(assertionPolicy).length - 1, 1, 'Every stage receives one shared assertion policy.');
    assert.equal(body.max_output_tokens, 8000);
    prompts.push(prompt);
    assert.equal(JSON.parse(prompt).files['shipping.py'], numbered ? '1: def fee(amount):\n2:     return 0 if amount >= 10000 else 1000\n3: ' : code);
    assert.equal(JSON.parse(prompt).rules[0].text, original, 'Numbering never rewrites requirement text.');
    return Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: body.model,
      output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
  };
  let usage: ReasonUsage | undefined;
  const decoded = await reason(analysisSchema, 'Analysis fixture', context, 'gpt-6-luna', new AbortController().signal, value => { usage = value; });
  assert.equal(decoded.behaviors[0].quote, original);
  assert.deepEqual(decoded.behaviors[0].evidence[0], { file: 'shipping.py', line: 1, quote: 'def fee(amount):' });
  assert.equal(usage?.promptBytes, Buffer.byteLength(prompts[0]));
  assert.equal(usage?.promptHash, createHash('sha256').update(prompts[0]).digest('hex'));
  output = { decisions: [{ testId: 'T1', category: 'uncertain', reason: 'Decode fixture only.', quote: 'R1', executionQuote: 'raw log', evidence: [{ file: 'reqtest_generated/test_reqtest_T1.py', line: 3 }] }] };
  const diagnosis = await reason(diagnosisSchema, 'Diagnosis fixture', context, 'gpt-6-luna', new AbortController().signal);
  assert.equal(diagnosis.decisions[0].evidence[0].quote, '    assert fee(10000) == 0');
  output = { ...base, behaviors: base.behaviors.map(behavior => ({ ...behavior, quote: 'R1', evidence: [{ file: 'shipping.py', line: 99 }] })) };
  await assert.rejects(reason(analysisSchema, 'Invalid source reference', context, 'gpt-6-luna', new AbortController().signal));
  assert.equal(prompts.length, 3, 'Invalid lines do not trigger automatic provider retries or a fallback to copied quotes.');
  numbered = false;
  output = { decisions: [{ testId: 'T1', supported: true, reason: 'Review wire fixture.', quote: 'R1' }] };
  const review = await reason(reviewTestsSchema, testReviewTask, context, 'gpt-6-luna', new AbortController().signal);
  assert.equal(review.decisions[0].quote, original);
  assert.equal(prompts.length, 4, 'Review keeps the unmodified source view and a single policy copy.');
  assert.deepEqual(context, before, 'Saved source and caller input remain unchanged.');
});
