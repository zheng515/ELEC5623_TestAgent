import { loadEnvConfig } from "@next/env";
import { createBackup, inspectBackup, restoreBackup } from "../lib/backup";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production" }); loadEnvConfig(process.cwd(), false);
  const [command, directory] = process.argv.slice(2);
  if (command === "create") console.log("Offline backup created:", await createBackup());
  else if (command === "verify" && directory) { await inspectBackup(directory); console.log("Backup file hashes, ZIP integrity and paths passed. A restore drill is still required."); }
  else if (command === "restore" && directory) { await restoreBackup(directory); console.log("Database and .data restored. Reconfigure external credentials and check required sandbox images before starting services."); }
  else throw new Error("Use backup:create, backup:verify -- DIRECTORY, or backup:restore -- DIRECTORY.");
}
main().catch(error => {
  // Do not print driver errors or connection strings containing credentials.
  console.error(error instanceof Error && !/(postgres(?:ql)?:\/\/|password|connection|ECONN|SASL)/i.test(error.message) ? error.message : "Backup command failed. Check PostgreSQL, Docker and file permissions.");
  process.exitCode = 1;
});
