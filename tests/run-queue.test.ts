import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { PythonReport } from '../lib/python-types';
import JSZip from 'jszip';
import { authFixture } from './fixtures/auth';

test('durable queue executes, survives a killed worker, reuses checkpoints and respects owner cancellation', {
  skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 150000,
}, async context => {
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
  process.env.OPENAI_API_KEY = 'queue-test-not-a-real-key';
  const children: ChildProcess[] = [];
  let pendingQueue: ReturnType<typeof import('../lib/run-queue').getQueue> | undefined = undefined;
  const { database, dataDir, base, account } = await authFixture(context, 'queue', async () => {
    await Promise.all(children.map(child => stop(child)));
    await (await pendingQueue?.catch(() => undefined))?.stop({ graceful: false });
    await database.query('DROP SCHEMA IF EXISTS "' + queueSchema + '" CASCADE');
  });
  const { enqueueRun, getQueue, queueName, queueSchema, checkpointStore, cancelRun, refreshQueuedRun } = await import('../lib/run-queue');
  pendingQueue = getQueue();
  async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'close'); child.kill(signal); await closed;
  }
  const boss = await pendingQueue;
  const { runtimeHealth } = await import('../lib/runtime-health');
  const owner = await account(), other = await account();
  const routes = await import('../app/api/python/route');
  const image = await (await import('../lib/python-tools')).sandboxImage();
  async function fixture(): Promise<PythonReport> {
    const id = randomUUID(), root = join(dataDir, 'runs', id);
    await mkdir(join(root, 'source'), { recursive: true }); await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'source/shipping.py'), 'def fee(amount):\n    return 0 if amount > 10000 else 1000\n');
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ runtime: 'python', services: [] }));
    return { id, title: 'Durable fault verification', createdAt: new Date().toISOString(), model: 'deterministic-test', source: 'Seeded defect fixture', fingerprint: 'fixture', runtime: 'python', execution: { queueId: id, image, attempt: 0, recovered: false }, status: 'running', stage: 'Queued', rules: [{ id: 'R1', text: 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.' }], tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: [] };
  }
  async function saved(id: string): Promise<PythonReport> { return (await database.query('SELECT report FROM runs WHERE id=$1', [id])).rows[0].report; }
  async function until<T>(read: () => Promise<T | undefined>, timeout = 60000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const result = await read(); if (result !== undefined) return result; await new Promise(resolve => setTimeout(resolve, 250)); }
    throw new Error('Timed out waiting for worker evidence');
  }
  const calls = join(dataDir, 'reasoning-calls.txt');
  await writeFile(calls, '');
  function worker(hold: boolean) {
    const child = fork('tests/fixtures/queue-worker.ts', hold ? ['--hold'] : [], { execArgv: ['--import', 'tsx'], env: { ...process.env, QUEUE_TEST_CALLS: calls }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    children.push(child);
    const events = new Set<string>(); let logs = '';
    child.on('message', message => { events.add((message as { event: string }).event); });
    child.stdout!.on('data', chunk => { logs += chunk; }); child.stderr!.on('data', chunk => { logs += chunk; });
    return { child, wait: (event: string) => until(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Worker exited: ' + logs.slice(-1500));
      return events.has(event) ? true : undefined;
    }) };
  }

  // A queued task is durable even before a worker starts. Duplicate inserts roll back.
  const zip = new JSZip(); zip.file('shipping.py', 'def fee(amount):\n    return 0 if amount > 10000 else 1000\n');
  const form = new FormData(); form.set('title', 'Queued through the API'); form.set('model', 'deterministic-test');
  form.set('requirements', 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.');
  form.set('project', new File([new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' }))], 'shipping.zip'));
  const response = await routes.POST(new Request(base + '/api/python', { method: 'POST', headers: { Cookie: owner.cookie, Origin: base }, body: form }));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader(), firstEvent = await reader.read();
  const run: PythonReport = JSON.parse(new TextDecoder().decode(firstEvent.value).split('\ndata: ')[1].trim()).report;
  await reader.cancel();
  assert.equal((await saved(run.id)).status, 'running', 'Disconnecting the browser stream must not cancel queued work');
  const duplicate = await fixture(); await assert.rejects(enqueueRun(duplicate, owner.user.id), /already queued or running/);
  assert.equal((await database.query('SELECT 1 FROM runs WHERE id=$1', [duplicate.id])).rowCount, 0);
  assert.equal((await refreshQueuedRun(run)).status, 'running');
  const first = worker(true); await first.wait('ready'); await first.wait('blocked');
  await until(async () => (await runtimeHealth(owner.user.id, async () => true)).worker === 'online' ? true : undefined);
  assert.ok((await database.query('SELECT key FROM run_checkpoints WHERE run_id=$1', [run.id])).rows.length >= 4);
  const beforeCrash = await saved(run.id);
  assert.equal(beforeCrash.execution?.attempt, 1);
  await stop(first.child, 'SIGKILL');
  await until(async () => (await runtimeHealth(owner.user.id, async () => true)).worker === 'offline' ? true : undefined, 25000);
  assert.equal((await refreshQueuedRun(await saved(run.id))).status, 'running', 'Worker loss must remain recoverable');
  const second = worker(false); await second.wait('ready');
  const complete = await until(async () => { const report = await saved(run.id); return report.status !== 'running' ? report : undefined; }, 90000);
  assert.equal(complete.status, 'completed', complete.error);
  assert.equal(complete.execution?.recovered, true); assert.equal(complete.execution?.attempt, 2);
  assert.equal((await readFile(calls, 'utf8')).split('\n').filter(kind => kind === 'analysis').length, 1, 'Persisted analysis must not call the model again');
  assert.equal(complete.measurements[0].outcomes[0].status, 'failed');
  assert.equal(complete.diagnoses[0].category, 'potential_implementation_defect');
  assert.equal(complete.improvements.length, 0, 'Recovery must retain valid defect assertions');
  await stop(second.child);

  // Cancellation uses the same authenticated endpoint as the UI.
  const active = await fixture(); await enqueueRun(active, owner.user.id);
  const third = worker(true); await third.wait('ready'); await third.wait('blocked');
  const patch = (cookie: string) => routes.PATCH(new Request(base + '/api/python', { method: 'PATCH', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: active.id }) }));
  assert.equal((await patch(other.cookie)).status, 404, 'Other accounts cannot cancel a run');
  assert.equal((await patch(owner.cookie)).status, 200);
  await until(async () => (await boss.findJobs(queueName, { id: active.id }))[0]?.state === 'cancelled' ? true : undefined);
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal((await saved(active.id)).status, 'cancelled', 'A late worker save cannot overwrite owner cancellation');
  assert.equal((await saved(active.id)).stage, 'Stopped');
  await stop(third.child);
  const queued = await fixture(); await enqueueRun(queued, owner.user.id);
  assert.equal(await cancelRun(queued.id, owner.user.id), true);
  assert.equal((await boss.findJobs(queueName, { id: queued.id }))[0].state, 'cancelled');

  // Changed source must never be combined with execution evidence from an earlier attempt.
  const changed = await fixture(); await enqueueRun(changed, owner.user.id);
  const [fetched] = await boss.fetch<{ runId: string; userId: string }>(queueName);
  const job = { ...fetched, signal: new AbortController().signal };
  assert.equal(job.data.runId, changed.id);
  const cache = await checkpointStore(changed.id, job);
  await cache('probe', async () => ({ value: 'original evidence' }));
  await boss.fail(queueName, { id: job.id, retryCount: job.retryCount });
  await assert.rejects(cache('stale-worker', async () => ({ value: 'late evidence' })), /worker lease changed/);
  await writeFile(join(dataDir, 'runs', changed.id, 'source/shipping.py'), 'def fee(amount):\n    return 0\n');
  await assert.rejects(checkpointStore(changed.id, job), /changed since the checkpoint/);
  await cancelRun(changed.id, owner.user.id);

  const exhausted = await fixture(); await enqueueRun(exhausted, owner.user.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const failed = await until(async () => (await boss.fetch(queueName))[0]);
    assert.equal(failed.id, exhausted.id);
    await boss.fail(queueName, { id: failed.id, retryCount: failed.retryCount });
  }
  assert.equal((await refreshQueuedRun(await saved(exhausted.id))).status, 'failed', 'Exhausted retries cannot leave a task permanently running');
});
