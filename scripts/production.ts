import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { deploymentChecks } from "../lib/deployment";

let stage = "configuration checks";
async function main() {
  Object.assign(process.env, { NODE_ENV: "production" });
  loadEnvConfig(process.cwd(), false);
  const command = process.argv[2] || "check";
  if (!["check", "start"].includes(command)) throw new Error("Use production.ts check or start.");
  const checks = await deploymentChecks(process.cwd(), process.env, command === "start");
  for (const check of checks) console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  if (checks.some(check => check.status === "failed")) throw new Error("Fix the failed configuration checks before production startup.");
  if (command === "check") return;
  stage = "database initialization";
  const auth = await import("../lib/auth");
  await auth.getAuth(); await auth.database.end();
  stage = "service startup";
  const port = new URL(process.env.BETTER_AUTH_URL!).port;
  const commands = [
    [join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", port],
    ["--import", "tsx", "scripts/worker.ts"],
  ];
  const children = commands.map(args => spawn(process.execPath, args, { stdio: "inherit", env: process.env }));
  const names = ["Website", "Verification worker"];
  let stopping = false, failure: Error | undefined;
  const stop = () => {
    if (stopping) return; stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
    setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 20000).unref();
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const results = await Promise.all(children.map((child, index) => new Promise<number>(resolve => {
    child.once("error", error => { failure ||= new Error(`${names[index]} could not start: ${error.message}`); stop(); resolve(1); });
    child.once("exit", (code, signal) => {
      const unexpected = !stopping;
      if (unexpected) failure = new Error(`${names[index]} exited with ${signal ? `signal ${signal}` : `code ${code}`}. Both services have been stopped.`);
      stop(); resolve(unexpected ? code || 1 : code || 0);
    });
  })));
  if (results.some(code => code !== 0)) throw failure || new Error("A production service failed during shutdown.");
}
main().catch(error => {
  let message = error instanceof Error ? error.message : "Review the service messages above.";
  const sensitive = Object.entries(process.env).filter(([name, value]) => value && /KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/i.test(name)).map(([, value]) => value!);
  try { const url = new URL(process.env.DATABASE_URL || ""); sensitive.push(url.username, url.password, decodeURIComponent(url.username), decodeURIComponent(url.password)); } catch {}
  for (const value of sensitive.filter(Boolean).sort((a, b) => b.length - a.length)) message = message.replaceAll(value, "[redacted]");
  console.error(`Production ${stage} failed: ${message}`); process.exitCode = 1;
});
