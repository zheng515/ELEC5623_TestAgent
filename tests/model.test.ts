import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APICallError, generateText, Output } from 'ai';
import { z } from 'zod';
import { modelError, options, ModelTimeoutError } from '../lib/model';
import { reason } from '../lib/python-agent';

test('model requests use official Responses API even with a stale gateway setting', async context => {
  const original = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL, fetch: globalThis.fetch };
  context.after(() => {
    for (const [name, value] of [['OPENAI_API_KEY', original.key], ['OPENAI_BASE_URL', original.base]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    globalThis.fetch = original.fetch;
  });
  process.env.OPENAI_API_KEY = 'official-test-fixture';
  process.env.OPENAI_BASE_URL = 'https://gateway.example.invalid/v1';
  let requests = 0;
  let expectedCap: number | undefined = undefined;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.max_output_tokens, expectedCap, 'Only an explicit caller limit caps output');
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    return Response.json({ id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: body.model,
      output: [{ id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
  };
  const result = await generateText({ ...options({ model: 'gpt-6-luna' }, new AbortController().signal),
    prompt: 'Connection fixture', output: Output.object({ schema: z.object({ ok: z.boolean() }) }) });
  assert.equal(result.output.ok, true); assert.equal(requests, 1);
  expectedCap = 256;
  await generateText({ ...options({ model: 'gpt-6-luna', maxOutputTokens: 256 }, new AbortController().signal),
    prompt: 'Connection fixture', output: Output.object({ schema: z.object({ ok: z.boolean() }) }) });
  assert.equal(requests, 2);
  process.env.OPENAI_API_KEY = 'sk-or-test-fixture';
  assert.throws(() => options({ model: 'gpt-6-luna' }, new AbortController().signal), /Use an OpenAI API key/);
});

test('authentication errors do not expose actual or masked key fragments', () => {
  const error = new APICallError({ message: 'Incorrect API key: sk-proj-********fixture', url: 'https://example.invalid', requestBodyValues: {}, statusCode: 401 });
  assert.match(modelError(error), /OpenAI rejected the API key/);
  assert.ok(!modelError(error).includes('sk-'));
  assert.ok(!modelError(new Error('Provider error sk-proj-********fixture')).includes('sk-'));
});

test('per-call timeouts stop stalled transport while owner cancellation stays distinct', async context => {
  const original = { key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  context.after(() => { globalThis.fetch = original.fetch; if (original.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original.key; });
  process.env.OPENAI_API_KEY = 'local-timeout-fixture';
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      const guard = setTimeout(() => reject(new Error('Mock transport was not aborted.')), 500);
      const stop = () => { clearTimeout(guard); reject(init!.signal!.reason); };
      if (init?.signal?.aborted) stop(); else init?.signal?.addEventListener('abort', stop, { once: true });
    });
  };
  await assert.rejects(reason(z.object({ ok: z.boolean() }), 'Timeout fixture', {}, 'fixture', new AbortController().signal, undefined, 20), ModelTimeoutError);
  assert.equal(calls, 1, 'A timed-out request is not silently retried.');
  const owner = new AbortController();
  const timer = setTimeout(() => owner.abort(new Error('Stopped by owner.')), 10);
  try { await assert.rejects(reason(z.object({ ok: z.boolean() }), 'Cancel fixture', {}, 'fixture', owner.signal, undefined, 0), error => !(error instanceof ModelTimeoutError)); }
  finally { clearTimeout(timer); }
  const noTimeout = options({ model: 'fixture', timeoutMs: 0 }, owner.signal);
  assert.equal(noTimeout.abortSignal, owner.signal);
});
