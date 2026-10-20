import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

// One local workspace per database. The gate prevents startup during an offline backup.
export async function operationGate<T>(pool: Pool, root: string, offline: boolean, task: () => Promise<T>) {
  const client = await pool.connect();
  let locked = false;
  try {
    for (let attempt = 0; attempt < (offline ? 1 : 40); attempt++) {
      locked = (await client.query("SELECT pg_try_advisory_lock(5623,3001) AS locked")).rows[0].locked;
      if (locked) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!locked) throw new Error("Another startup or maintenance operation is running. Retry after it finishes.");
    if (offline) {
      const directory = join(root, ".data", ".runtime");
      const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
      for (const file of files) {
        if (!/^\d+\.pid$/.test(file)) throw new Error("Unexpected runtime lease. Inspect .data/.runtime before maintenance.");
        const pid = Number(file.slice(0, -4));
        let alive = true;
        try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
        if (alive) throw new Error("Stop the website, worker and other ReqTest commands before backup or restore.");
        await rm(join(directory, file));
      }
    }
    return await task();
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(5623,3001)"); }
    finally { client.release(); }
  }
}
export async function registerRuntime(pool: Pool, root = process.cwd()) {
  await operationGate(pool, root, false, async () => {
    const directory = join(root, ".data", ".runtime");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, process.pid + ".pid"), String(process.pid), { mode: 0o600 });
  });
}
export async function signingSecret(root: string, env: NodeJS.ProcessEnv = process.env) {
  const secret = env.BETTER_AUTH_SECRET || await readFile(join(root, ".data", env.REQTEST_DATA_NAMESPACE || "", "auth-secret"), "utf8").catch(() => "");
  if (secret.length < 32) throw new Error("Set BETTER_AUTH_SECRET to at least 32 characters or initialize the persisted local signing secret.");
  return secret;
}
