import { PgBoss, type Job } from "pg-boss";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { database, dataDir, getAuth } from "./auth";
import { runPython, reason, type Reason, type Checkpoint } from "./python-agent";
import { interruptedReport } from "./python-jobs";
import type { PythonReport } from "./python-types";
import { readFile, readdir } from "node:fs/promises";
import { queueName, queueSchema } from "./queue-config";
import { modelError } from "./model";
export { queueName, queueSchema } from "./queue-config";

type RunJob = Pick<Job<{ runId: string; userId: string }>, "data" | "retryCount" | "signal">;
const heldLease = `EXISTS (SELECT 1 FROM "${queueSchema}".job WHERE id=$2::uuid AND name='verification' AND state='active' AND retry_count=$4)`;
let queue: Promise<PgBoss> | undefined;
export function getQueue() {
  return queue ||= (async () => {
    await getAuth();
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: queueSchema, max: 3, instanceHeartbeatSeconds: 5, superviseIntervalSeconds: 5, monitorIntervalSeconds: 5 });
    boss.on("error", () => console.error("Queue connection error. Check PostgreSQL."));
    try {
      await boss.start();
      await boss.createQueue(queueName, { policy: "exclusive", retryLimit: 2, retryDelay: 2, expireInSeconds: 900, heartbeatSeconds: 10, retentionSeconds: 604800 });
    } catch (error) { await boss.stop({ graceful: false }); queue = undefined; throw error; }
    return boss;
  })();
}
export async function startWorker(ask: Reason = reason) {
  const boss = await getQueue();
  await boss.work<{ runId: string; userId: string }>(queueName, { localConcurrency: 2, batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => { await executeRun(job, ask); });
  return boss;
}
export async function enqueueRun(report: PythonReport, userId: string) {
  const boss = await getQueue(), client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO runs(id,user_id,report) VALUES($1,$2,$3)", [report.id, userId, JSON.stringify(report)]);
    const id = await boss.send(queueName, { runId: report.id, userId }, { id: report.id, singletonKey: userId, db: { executeSql: (text, values) => client.query(text, values) } });
    if (!id) throw new Error("A verification is already queued or running for your account.");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function cancelRun(runId: string, userId: string) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query("SELECT report FROM runs WHERE id=$1 AND user_id=$2 FOR UPDATE", [runId, userId])).rows[0];
    if (!row?.report.execution || row.report.status !== "running") { await client.query("ROLLBACK"); return false; }
    const report = interruptedReport(row.report);
    report.stage = "Stopped"; report.error = "Run stopped by its owner.";
    await client.query("UPDATE runs SET cancel_requested=true, report=$1 WHERE id=$2 AND user_id=$3", [JSON.stringify(report), runId, userId]);
    await (await getQueue()).cancel(queueName, runId, { db: { executeSql: (text, values) => client.query(text, values) } });
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function checkpointStore(runId: string, job: RunJob): Promise<Checkpoint> {
  const root = join(dataDir, "runs", runId);
  async function sourceFiles(directory: string): Promise<Buffer[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async entry => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Saved source contains a symbolic link. Start a new run.");
      return entry.isDirectory() ? sourceFiles(path) : [Buffer.from(path.slice(root.length)), await readFile(path)];
    }))).flat();
  }
  const files: Buffer[] = await Promise.all(["python-agent.ts", "python-tools.ts", "python-types.ts", "mutation-review.ts", "runtime.ts", "test-services.ts"].map(file => readFile(join(process.cwd(), "lib", file))));
  files.push(...await sourceFiles(join(root, "source")), await readFile(join(root, "runtime.json")).catch(() => Buffer.from("python")));
  const hash = createHash("sha256");
  for (const file of files) hash.update(String(file.length) + ":").update(file);
  const version = hash.digest("hex");
  const pinned = await database.query("INSERT INTO run_checkpoints(run_id,key,value) VALUES($1,'version',$2) ON CONFLICT (run_id,key) DO UPDATE SET key=excluded.key RETURNING value", [runId, JSON.stringify(version)]);
  if (pinned.rows[0].value !== version) throw new Error("Saved source or agent code changed since the checkpoint. Start a new verification run.");
  return async (key, task) => {
    job.signal.throwIfAborted();
    const name = version + ":" + key;
    const cached = await database.query("SELECT value FROM run_checkpoints WHERE run_id=$1 AND key=$2", [runId, name]);
    if (cached.rows[0]) return structuredClone(cached.rows[0].value);
    const value = await task();
    job.signal.throwIfAborted();
    const result = await database.query(`INSERT INTO run_checkpoints(run_id,key,value) SELECT $2,$5,$1 FROM runs WHERE id=$2 AND user_id=$3 AND cancel_requested=false AND ${heldLease} ON CONFLICT (run_id,key) DO UPDATE SET key=excluded.key RETURNING value`, [JSON.stringify(value), runId, job.data.userId, job.retryCount, name]);
    if (!result.rowCount) throw new Error("Run stopped or worker lease changed.");
    return result.rows[0].value;
  };
}
export async function executeRun(job: RunJob, ask: Reason = reason) {
  await getAuth();
  const { runId, userId } = job.data;
  const row = (await database.query("SELECT report,cancel_requested FROM runs WHERE id=$1 AND user_id=$2", [runId, userId])).rows[0];
  if (!row || row.cancel_requested || row.report.status !== "running") return;
  const original: PythonReport = row.report;
  const report: PythonReport = { ...original, status: "running", stage: "Resuming", error: undefined, stopReason: undefined, testAttempts: undefined, improvementProposal: undefined, tests: original.replay ? original.tests : [], measurements: [], mutations: [], diagnoses: [], proposedDiagnoses: undefined, relevance: [], improvements: [], states: [], initialStates: undefined, analysis: original.replay ? original.analysis : undefined, analysisCorrection: undefined };
  report.execution = { ...original.execution!, attempt: job.retryCount + 1, recovered: job.retryCount > 0 };
  const cancelled = new AbortController(), signal = AbortSignal.any([job.signal, cancelled.signal, AbortSignal.timeout(600000)]);
  const timer = setInterval(async () => {
    try { if ((await database.query("SELECT cancel_requested FROM runs WHERE id=$1", [runId])).rows[0]?.cancel_requested) cancelled.abort(); }
    catch { /* A transient database error is not an owner cancellation. */ }
  }, 1000);
  const save = async () => {
    signal.throwIfAborted();
    const saved = await database.query(`UPDATE runs SET report=$1 WHERE id=$2 AND user_id=$3 AND cancel_requested=false AND report->>'status'='running' AND ${heldLease}`, [JSON.stringify(report), runId, userId, job.retryCount]);
    if (!saved.rowCount) throw new Error("Run stopped or worker lease changed.");
  };
  try {
    await runPython(report, join(dataDir, "runs", runId), signal, save, ask, "B3", await checkpointStore(runId, job));
    if (report.stage !== "Complete") await save();
  } catch (error) {
    if (job.signal.aborted && !cancelled.signal.aborted) throw error;
    const stopped = (await database.query("SELECT cancel_requested FROM runs WHERE id=$1", [runId])).rows[0]?.cancel_requested;
    report.status = stopped ? "cancelled" : "failed";
    report.error = stopped ? "Run stopped by its owner." : modelError(error);
    report.states = report.states.map(state => ({ ...state, status: "Uncertain" }));
    await database.query(`UPDATE runs SET report=$1 WHERE id=$2 AND user_id=$3 AND cancel_requested=false AND report->>'status'='running' AND ${heldLease}`, [JSON.stringify(report), runId, userId, job.retryCount]);
  } finally { clearInterval(timer); }
}
export async function refreshQueuedRun(report: PythonReport) {
  if (!report.execution || report.status !== "running") return report;
  const job = (await (await getQueue()).findJobs(queueName, { id: report.execution.queueId }))[0];
  if (!job || ["failed", "cancelled", "completed"].includes(job.state)) {
    const next = interruptedReport(report);
    next.status = job?.state === "cancelled" ? "cancelled" : "failed";
    next.stage = job?.state === "cancelled" ? "Stopped" : "Recovery unavailable";
    next.error = job?.state === "cancelled" ? "Run stopped before completion." : "The worker stopped without a final report and recovery is unavailable or exhausted. Partial evidence is retained; start a new run.";
    const updated = await database.query("UPDATE runs SET report=$1 WHERE id=$2 AND report->>'status'='running' AND report#>>'{execution,attempt}'=$3 RETURNING report", [JSON.stringify(next), report.id, String(report.execution.attempt)]);
    return updated.rows[0]?.report || (await database.query("SELECT report FROM runs WHERE id=$1", [report.id])).rows[0]?.report || report;
  }
  return report;
}
