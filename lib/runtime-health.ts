import { PgBoss } from "pg-boss";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { QueryConfig } from "pg";
import { database } from "./auth";
import { queueName, queueSchema } from "./queue-config";

export type RuntimeHealth = {
  checkedAt: string;
  database: "available";
  queue: "available" | "not_initialized" | "unavailable";
  worker: "online" | "offline" | "unknown";
  lastHeartbeat: string | null;
  sandbox: "available" | "unavailable";
  modelConfigured: boolean;
  tasks: { queued: number; active: number; retrying: number } | null;
};
let cachedSandbox: { image: string; expires: number; result: Promise<boolean> } | undefined;
function query(text: string, values: unknown[] = []) {
  const config: QueryConfig & { query_timeout: number } = { text, values, query_timeout: 3000 };
  return database.query(config);
}
async function sandboxAvailable() {
  const image = process.env.REQTEST_SANDBOX_IMAGE || "reqtest-python:1";
  if (!cachedSandbox || cachedSandbox.image !== image || cachedSandbox.expires <= Date.now()) {
    const result = promisify(execFile)("docker", ["image", "inspect", "--format", "{{.Id}}", image], { timeout: 3000 }).then(() => true, () => false);
    cachedSandbox = { image, expires: Date.now() + 5000, result };
  }
  return cachedSandbox.result;
}
export async function runtimeHealth(userId: string, probeSandbox: () => Promise<boolean> = sandboxAvailable): Promise<RuntimeHealth> {
  const tables = await query("SELECT clock_timestamp() AS now, to_regclass($1) AS jobs, to_regclass($2) AS instances", [queueSchema + ".job", queueSchema + ".instance"]);
  const health: RuntimeHealth = { checkedAt: tables.rows[0].now.toISOString(), database: "available", queue: "not_initialized", worker: "unknown", lastHeartbeat: null, sandbox: "unavailable", modelConfigured: !!process.env.OPENAI_API_KEY?.trim(), tasks: null };
  const sandbox = probeSandbox().catch(() => false);
  if (tables.rows[0].jobs && tables.rows[0].instances) {
    try {
      // The read-only adapter does not start pg-boss, initialize a queue or register a worker.
      const reader = new PgBoss({ schema: queueSchema, registerInstance: false, db: { executeSql: query } });
      const instances = await reader.getInstances({ limit: 1000 });
      if (instances.length === 1000) throw new Error("Instance history exceeds the health snapshot limit.");
      const workers = instances.filter(instance => instance.workers.some(worker => worker.queue === queueName && worker.localConcurrency > 0));
      health.worker = workers.some(instance => instance.live) ? "online" : "offline";
      health.lastHeartbeat = workers.length ? new Date(Math.max(...workers.map(instance => new Date(instance.heartbeatOn).getTime()))).toISOString() : null;
      const counts = await query(`SELECT count(*) FILTER (WHERE j.state='created')::int AS queued, count(*) FILTER (WHERE j.state='active')::int AS active, count(*) FILTER (WHERE j.state='retry')::int AS retrying FROM "${queueSchema}".job j JOIN runs r ON r.id=j.id::text WHERE j.name=$1 AND r.user_id=$2 AND r.report->>'status'='running'`, [queueName, userId]);
      health.tasks = counts.rows[0]; health.queue = "available";
    } catch { health.queue = "unavailable"; health.worker = "unknown"; health.lastHeartbeat = null; health.tasks = null; }
  }
  health.sandbox = await sandbox ? "available" : "unavailable";
  return health;
}
