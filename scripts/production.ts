import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { deploymentChecks } from "../lib/deployment";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production" });
  loadEnvConfig(process.cwd(), false);
  const command = process.argv[2] || "check";
  if (!["check", "start"].includes(command)) throw new Error("Use production.ts check or start.");
  const checks = await deploymentChecks(process.cwd(), process.env, command === "start");
  for (const check of checks) console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  if (checks.some(check => check.status === "failed")) throw new Error("Fix the failed configuration checks before production startup.");
  if (command === "check") return;
  const auth = await import("../lib/auth");
  await auth.getAuth(); await auth.database.end();
  const port = new URL(process.env.BETTER_AUTH_URL!).port;
  const commands = [
    [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", port],
    ["--import", "tsx", "scripts/worker.ts"],
  ];
  const children = commands.map(args => spawn(process.execPath, args, { stdio: "inherit", env: process.env }));
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
    setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 20000).unref();
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const results = await Promise.all(children.map(child => new Promise<number>(resolve => {
    child.once("error", () => { stop(); resolve(1); });
    child.once("exit", code => { const unexpected = !stopping; stop(); resolve(unexpected ? code || 1 : code || 0); });
  })));
  if (results.some(code => code !== 0)) throw new Error("A production service stopped unexpectedly. Both services have been stopped.");
}
main().catch(() => { console.error("Production command failed. Review the configuration checks and service messages above."); process.exitCode = 1; });
