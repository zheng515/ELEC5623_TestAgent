import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("runtime health distinguishes queue clients from workers and keeps task counts private", async context => {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  process.env.REQTEST_DATA_NAMESPACE = "health_" + randomUUID().replaceAll("-", "");
  process.env.REQTEST_LOCAL_MAIL = "false"; process.env.SMTP_HOST = "";
  process.env.OPENAI_API_KEY = "health-fixture-secret-never-return";
  const authModule = await import("../lib/auth"), auth = await authModule.getAuth(), db = authModule.database;
  const { runtimeHealth } = await import("../lib/runtime-health");
  const { GET } = await import("../app/api/system/health/route");
  const { getQueue, queueName, queueSchema } = await import("../lib/run-queue");
  let boss: Awaited<ReturnType<typeof getQueue>> | undefined = undefined;
  context.after(async () => {
    await boss?.stop({ graceful: false });
    await db.query('DROP SCHEMA IF EXISTS "' + queueSchema + '" CASCADE');
    await db.query('DROP SCHEMA IF EXISTS "' + process.env.REQTEST_DATA_NAMESPACE + '" CASCADE');
    await db.end(); await rm(authModule.dataDir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:3001";
  async function account() {
    const response = await auth.handler(new Request(base + "/api/auth/sign-up/email", { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": "127.0.0.1" }, body: JSON.stringify({ name: "Health fixture", email: randomUUID() + "@example.test", password: "Abcd1234" }) }));
    assert.equal(response.status, 200);
    return { user: (await response.json()).user, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
  }
  const owner = await account(), other = await account();
  const request = new Request(base + "/api/system/health", { headers: { Cookie: owner.cookie } });
  assert.equal((await GET(new Request(base + "/api/system/health"))).status, 401);
  const fresh = await runtimeHealth(owner.user.id, async () => true);
  assert.equal(fresh.queue, "not_initialized"); assert.equal(fresh.worker, "unknown"); assert.equal(fresh.tasks, null);
  assert.equal((await db.query("SELECT to_regnamespace($1) AS schema", [queueSchema])).rows[0].schema, null, "Health reads must not initialize a queue");
  boss = await getQueue();
  const clientOnly = await runtimeHealth(owner.user.id, async () => true);
  assert.equal(clientOnly.worker, "offline", "A web queue client is not a verification worker");
  assert.equal(clientOnly.queue, "available"); assert.deepEqual(clientOnly.tasks, { queued: 0, active: 0, retrying: 0 });
  const ids = [randomUUID(), randomUUID()];
  for (const [index, user] of [owner.user, other.user].entries()) {
    await db.query("INSERT INTO runs(id,user_id,report) VALUES($1,$2,$3)", [ids[index], user.id, JSON.stringify({ status: "running", title: index ? "Other private project" : "Owner project" })]);
    await boss.send(queueName, { runId: ids[index], userId: user.id }, { id: ids[index], singletonKey: user.id, startAfter: new Date(Date.now() + 3600000) });
  }
  assert.deepEqual((await runtimeHealth(owner.user.id, async () => true)).tasks, { queued: 1, active: 0, retrying: 0 });
  const before = (await db.query('SELECT count(*) FROM "' + queueSchema + '".instance')).rows[0].count;
  const response = await GET(request), snapshot = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  for (const privateValue of [process.env.OPENAI_API_KEY!, owner.user.id, other.user.id, ...ids, "Other private project"]) assert.ok(!JSON.stringify(snapshot).includes(privateValue));
  assert.equal((await db.query('SELECT count(*) FROM "' + queueSchema + '".instance')).rows[0].count, before, "Reading health must not register another instance");
  await boss.work(queueName, async () => { throw new Error("Future fixture tasks must not execute"); });
  const deadline = Date.now() + 10000;
  while ((await runtimeHealth(owner.user.id, async () => true)).worker !== "online") {
    assert.ok(Date.now() < deadline, "Worker registration was not published by its heartbeat");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const online = await runtimeHealth(owner.user.id, async () => false);
  assert.equal(online.sandbox, "unavailable"); assert.ok(online.lastHeartbeat);
  await boss.stop({ graceful: false });
  assert.equal((await runtimeHealth(owner.user.id, async () => true)).worker, "offline", "Gracefully stopped workers cannot remain online");
  await db.query('UPDATE "' + queueSchema + '".instance SET stopped_on=NULL, heartbeat_on=now()-interval \'1 day\' WHERE jsonb_array_length(workers)>0');
  assert.equal((await runtimeHealth(owner.user.id, async () => true)).worker, "offline", "Old heartbeats cannot establish liveness");
  assert.equal((await db.query("SELECT count(*) FROM runs WHERE report->>'status'='running'")).rows[0].count, "2", "Missing heartbeats must not rewrite saved task outcomes");
  const query = db.query;
  try {
    db.query = ((...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { text: string }).text;
      if (text.includes("clock_timestamp() AS now")) return Promise.reject(new Error("postgresql://private:secret@fixture/database"));
      return query.apply(db, args as Parameters<typeof query>);
    }) as typeof query;
    const failed = await GET(request);
    assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("private:secret"));
  } finally { db.query = query; }
});
