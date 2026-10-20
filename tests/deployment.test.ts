import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { configurationChecks } from "../lib/deployment";
import { createBackup, inspectBackup, restoreBackup } from "../lib/backup";
import { operationGate, registerRuntime } from "../lib/operations";

test("production configuration rejects unsafe and incomplete settings without exposing credentials", () => {
  const secret = "private-fixture-never-print";
  const valid = { NODE_ENV: "production" as const, DATABASE_URL: "postgresql://fixture:" + secret + "@127.0.0.1:5433/fixture", OPENAI_API_KEY: secret, BETTER_AUTH_URL: "http://127.0.0.1:3001" };
  assert.ok(!configurationChecks(valid).some(check => check.status === "failed"));
  for (const overrides of [{ DATABASE_URL: "https://example.test" }, { OPENAI_API_KEY: "" }, { BETTER_AUTH_URL: "http://0.0.0.0:3001" }, { GITHUB_CLIENT_ID: "fixture" }, { AUTH_REQUIRE_EMAIL_VERIFICATION: "true" }, { SMTP_HOST: "mail.test" }, { SMTP_FROM: "test@example.test", SMTP_HOST: "mail.test", SMTP_PORT: "invalid" }, { NEXT_PUBLIC_OPENAI_API_KEY: secret }, { REQTEST_DATA_NAMESPACE: "../other" }]) {
    const checks = configurationChecks({ ...valid, ...overrides });
    assert.ok(checks.some(check => check.status === "failed"));
    assert.ok(!JSON.stringify(checks).includes(secret));
  }
  assert.ok(!configurationChecks({ ...valid, AUTH_REQUIRE_EMAIL_VERIFICATION: "true", REQTEST_LOCAL_MAIL: "true" }).some(check => check.status === "failed"));
});

test("offline backup and restore preserve PostgreSQL records, binary sources and signing secret", { skip: process.env.REQTEST_DOCKER_TEST !== "1" }, async context => {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID().replaceAll("-", ""), sourceName = "backup_source_" + id, targetName = "backup_target_" + id;
  const temporary = await mkdtemp(join(tmpdir(), "reqtest-backup-")), root = join(temporary, "source"), recovery = join(temporary, "recovery");
  const sourceURL = new URL(process.env.DATABASE_URL!), targetURL = new URL(sourceURL);
  sourceURL.pathname = "/" + sourceName; targetURL.pathname = "/" + targetName;
  await admin.query(`CREATE DATABASE "${sourceName}"`); await admin.query(`CREATE DATABASE "${targetName}"`);
  const pool = new Pool({ connectionString: sourceURL.toString() }), targetPool = new Pool({ connectionString: targetURL.toString() });
  context.after(async () => {
    await pool.end(); await targetPool.end();
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!(await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=ANY($1::text[])", [[sourceName, targetName]])).rowCount) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await admin.query(`DROP DATABASE IF EXISTS "${sourceName}"`); await admin.query(`DROP DATABASE IF EXISTS "${targetName}"`);
    await admin.end(); await rm(temporary, { recursive: true, force: true });
  });
  for (const directory of [root, recovery]) { await mkdir(directory); await copyFile("compose.yaml", join(directory, "compose.yaml")); }
  const secret = "fixture-persistent-signing-secret-" + id, original = Buffer.from([0, 1, 255, 100]);
  const env = { ...process.env, DATABASE_URL: sourceURL.toString(), BETTER_AUTH_SECRET: secret, REQTEST_DATA_NAMESPACE: "" };
  const settings = { root, env }, destination = { root: recovery, env: { ...env, DATABASE_URL: targetURL.toString() } };
  await mkdir(join(root, ".data", "documents"), { recursive: true });
  await writeFile(join(root, ".data", "documents", "original"), original);
  await writeFile(join(root, ".data", "auth-secret"), "old-fallback-secret-not-used-by-this-instance");
  await pool.query("CREATE TABLE runs(id text PRIMARY KEY, report jsonb NOT NULL)");
  await pool.query("INSERT INTO runs VALUES ('fixture', '{\"status\":\"running\",\"tests\":[\"saved-evidence\"]}')");
  await assert.rejects(() => createBackup(settings), /Finish or cancel/);
  await pool.query("UPDATE runs SET report=jsonb_set(report,'{status}','\"completed\"')");
  await registerRuntime(pool, root);
  await assert.rejects(() => createBackup(settings), /Stop the website/);
  await rm(join(root, ".data", ".runtime", process.pid + ".pid"));
  await operationGate(pool, root, true, async () => { await assert.rejects(() => registerRuntime(pool, root), /maintenance operation/); });
  const directory = await createBackup(settings), backup = await inspectBackup(directory);
  assert.equal(backup.contents["signing-secret"].toString(), secret);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, "database.dump"))).mode & 0o777, 0o600);
  assert.ok(!Object.keys(backup.zip.files).some(name => name.startsWith(".runtime/")));
  await assert.rejects(() => restoreBackup(directory, { ...destination, env: { ...destination.env, BETTER_AUTH_SECRET: "different-secret" } }), /does not match/);
  const saved = await readFile(join(directory, "data.zip"));
  await writeFile(join(directory, "data.zip"), Buffer.concat([saved, Buffer.from("tampered")]));
  await assert.rejects(() => restoreBackup(directory, destination), /integrity check/);
  assert.equal((await targetPool.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count, "0");
  await writeFile(join(directory, "data.zip"), saved);
  await restoreBackup(directory, destination);
  assert.deepEqual((await targetPool.query("SELECT * FROM runs")).rows, [{ id: "fixture", report: { status: "completed", tests: ["saved-evidence"] } }]);
  assert.deepEqual(await readFile(join(recovery, ".data", "documents", "original")), original);
  assert.equal(await readFile(join(recovery, ".data", "auth-secret"), "utf8"), secret);
  await assert.rejects(() => restoreBackup(directory, destination), /empty database/);
  await targetPool.query("DROP TABLE runs");
  await assert.rejects(() => restoreBackup(directory, destination), /empty .data/);
  // Hash-valid archives still cannot introduce paths outside the recovery directory.
  const zip = new (await import("jszip")).default(); zip.file("../outside", "invalid");
  const malicious = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(join(directory, "data.zip"), malicious);
  backup.manifest.files["data.zip"] = createHash("sha256").update(malicious).digest("hex");
  await writeFile(join(directory, "manifest.json"), JSON.stringify(backup.manifest));
  await assert.rejects(() => inspectBackup(directory), /Unsafe backup/);
});
