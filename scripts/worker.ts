import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
async function main() {
  const { startWorker } = await import("../lib/run-queue");
  const auth = await import("../lib/auth");
  let boss: Awaited<ReturnType<typeof startWorker>> | undefined;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("Stopping verification worker; unfinished work will be retried.");
    try { await boss?.stop({ graceful: true, timeout: 10000 }); }
    finally { await auth.database?.end(); }
  };
  try {
    boss = await startWorker();
    console.log("Verification worker ready. Completed checkpoints survive process restarts.");
    process.once("SIGINT", () => { void stop().catch(error => { console.error(error instanceof Error ? error.message : "Worker shutdown failed."); process.exitCode = 1; }); });
    process.once("SIGTERM", () => { void stop().catch(error => { console.error(error instanceof Error ? error.message : "Worker shutdown failed."); process.exitCode = 1; }); });
  } catch (error) { await stop(); throw error; }
}
main().catch(error => { console.error((error instanceof Error ? error.message : "Worker failed.").replaceAll(process.env.OPENAI_API_KEY || "\0", "[redacted]")); process.exitCode = 1; });
