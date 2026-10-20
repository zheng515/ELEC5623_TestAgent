import { loadEnvConfig } from "@next/env";
async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const auth = await import('../lib/auth');
  await auth.getAuth();
  const database = auth.database;
  const result = await database.query('SELECT current_database() AS name');
  console.log('PostgreSQL schema ready:', result.rows[0].name);
  await database.end();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
