import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const docker = promisify(execFile);
export async function testServices(selected: string[], signal = new AbortController().signal, scope: string = randomUUID()) {
  signal.throwIfAborted();
  const network = "reqtest-network-" + randomUUID(), containers: string[] = [], env: string[] = [];
  const cleanup = async () => {
    await Promise.all(containers.map(name => docker("docker", ["rm", "-f", "-v", name], { timeout: 10000 }).catch(() => {})));
    await docker("docker", ["network", "rm", network], { timeout: 10000 }).catch(() => {});
  };
  if (!selected.length) return { network: "none", env, cleanup: async () => {} };
  if (selected.some(service => !["postgres", "redis"].includes(service))) throw new Error("Unsupported test service.");
  // Empty networks from crashed workers are safe to reclaim after the service lifetime.
  const stale = (await docker("docker", ["network", "ls", "--filter", "label=reqtest.temporary=true", "-q"], { timeout: 10000 })).stdout.trim().split(/\s+/).filter(Boolean);
  for (const id of stale) {
    try {
      const [details] = JSON.parse((await docker("docker", ["network", "inspect", id], { timeout: 10000 })).stdout);
      if (!Object.keys(details.Containers || {}).length && Date.now() - Date.parse(details.Created) > 360000) await docker("docker", ["network", "rm", id], { timeout: 10000 });
    } catch { /* Another worker may have reclaimed this empty network. */ }
  }
  try {
    await docker("docker", ["network", "create", "--internal", "--label", "reqtest.temporary=true", "--label", "reqtest.scope=" + scope, network], { timeout: 10000 });
    signal.throwIfAborted();
    for (const service of selected) {
      signal.throwIfAborted();
      const name = "reqtest-service-" + randomUUID(), password = randomBytes(16).toString("hex");
      containers.push(name);
      const common = ["run", "-d", "--rm", "--name", name, "--label", "reqtest.temporary=true", "--label", "reqtest.scope=" + scope, "--network", network, "--network-alias", service, "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit", "64", "--cpus", "0.5", "--memory", service === "postgres" ? "256m" : "64m", "--tmpfs", "/tmp:rw,size=128m,mode=1777", "--entrypoint", "timeout"];
      // The lifetime also bounds services left behind by a forcibly killed worker.
      const entrypoint = ["-k", "5", "300", "/usr/local/bin/docker-entrypoint.sh"];
      if (service === "postgres") {
        await docker("docker", [...common, "--user", "postgres", "--tmpfs", "/var/run/postgresql:rw,mode=1777", "-e", "PGDATA=/tmp/pgdata", "-e", "POSTGRES_USER=reqtest", "-e", "POSTGRES_DB=reqtest", "-e", "POSTGRES_PASSWORD=" + password, "postgres:17", ...entrypoint, "postgres"], { timeout: 60000 });
        env.push("DATABASE_URL=postgresql://reqtest:" + password + "@postgres:5432/reqtest");
      } else {
        await docker("docker", [...common, "--user", "redis", "--tmpfs", "/data:rw,mode=1777", "redis:7-alpine", ...entrypoint, "redis-server", "--save", "", "--appendonly", "no"], { timeout: 60000 });
        env.push("REDIS_URL=redis://redis:6379/0");
      }
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        signal.throwIfAborted();
        try {
          const { stdout } = await docker("docker", ["exec", name, ...(service === "postgres" ? ["pg_isready", "-h", "127.0.0.1", "-U", "reqtest", "-d", "reqtest"] : ["redis-cli", "ping"])], { timeout: 3000 });
          if (service === "postgres" || stdout.trim() === "PONG") { ready = true; break; }
        } catch {}
        await delay(500, undefined, { signal });
      }
      if (!ready) throw new Error("The disposable " + service + " service did not become ready. Check Docker and the service image.");
    }
    signal.throwIfAborted();
    return { network, env, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
