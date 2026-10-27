import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { signingSecret } from "./operations";

export type ConfigurationCheck = { name: string; status: "passed" | "warning" | "failed"; detail: string };
export function configurationChecks(env: NodeJS.ProcessEnv): ConfigurationCheck[] {
  const checks: ConfigurationCheck[] = [];
  const add = (name: string, valid: boolean, detail: string) => checks.push({ name, status: valid ? "passed" : "failed", detail });
  let databaseURL: URL | undefined, appURL: URL | undefined;
  try { databaseURL = new URL(env.DATABASE_URL || ""); } catch {}
  try { appURL = new URL(env.BETTER_AUTH_URL || ""); } catch {}
  add("Database URL", !!databaseURL && ["postgres:", "postgresql:"].includes(databaseURL.protocol) && !!databaseURL.hostname && databaseURL.pathname.length > 1, "Configure a PostgreSQL DATABASE_URL; credentials are never printed.");
  add("Local application URL", !!appURL && appURL.protocol === "http:" && ["localhost", "127.0.0.1"].includes(appURL.hostname) && Number(appURL.port) > 1024 && !appURL.username && !appURL.password && appURL.pathname === "/" && !appURL.search && !appURL.hash, "Use an explicit loopback HTTP port, for example http://127.0.0.1:3001. This launcher is for local deployment.");
  add("Model credential", !!env.OPENAI_API_KEY?.trim(), "OPENAI_API_KEY must be set. Presence does not confirm model access; use Check model connection in the app.");
  add("Data namespace", /^[\w-]{0,40}$/.test(env.REQTEST_DATA_NAMESPACE || ""), "REQTEST_DATA_NAMESPACE must use at most 40 letters, numbers, underscores or hyphens.");
  const github = !!env.GITHUB_CLIENT_ID, githubSecret = !!env.GITHUB_CLIENT_SECRET;
  if (github || githubSecret) add("GitHub OAuth", github && githubSecret, "Configure both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
  else checks.push({ name: "GitHub OAuth", status: "warning", detail: "OAuth is disabled. Public repositories and temporary repository tokens still work." });
  const localMail = env.REQTEST_LOCAL_MAIL === "true", smtp = !!env.SMTP_HOST && !!env.SMTP_FROM;
  add("SMTP configuration", !env.SMTP_HOST && !env.SMTP_FROM || smtp && Number.isInteger(Number(env.SMTP_PORT || 587)) && Number(env.SMTP_PORT || 587) > 0 && Number(env.SMTP_PORT || 587) <= 65535, "SMTP_HOST and SMTP_FROM must be paired, with a valid SMTP_PORT.");
  add("SMTP credentials", !!env.SMTP_USER === !!env.SMTP_PASSWORD, "Configure SMTP_USER and SMTP_PASSWORD together, or leave both empty for an unauthenticated relay.");
  add("Email verification", env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "true" || localMail || smtp, "Required email verification needs a configured mail service.");
  if (localMail || !smtp) checks.push({ name: "Email delivery", status: "warning", detail: localMail ? "Mailpit captures local emails. Start npm run mail:up; external delivery is disabled." : "Email verification and password recovery are unavailable until SMTP is configured." });
  for (const [name, value] of Object.entries(env)) if (value && /^NEXT_PUBLIC_.*(KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)/i.test(name)) add("Browser secret exposure", false, "Remove secret-bearing NEXT_PUBLIC_ variables. Credentials must remain server-side.");
  return checks;
}
export async function deploymentChecks(root = process.cwd(), env = process.env, requireBuild = false) {
  const checks = configurationChecks(env), run = promisify(execFile);
  const probe = async (name: string, task: () => Promise<unknown>, detail: string) => {
    try { await task(); checks.push({ name, status: "passed", detail }); }
    catch { checks.push({ name, status: "failed", detail }); }
  };
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  checks.push({ name: "Node.js", status: major > 22 || major === 22 && (minor > 22 || minor === 22 && patch >= 2) ? "passed" : "failed", detail: "Node.js 22.22.2 or newer is required." });
  if (requireBuild && !checks.some(check => check.name === "Local application URL" && check.status === "failed")) await probe("Application port", () => new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(Number(new URL(env.BETTER_AUTH_URL!).port), "127.0.0.1", () => server.close(error => error ? reject(error) : resolve()));
  }), "The BETTER_AUTH_URL port on 127.0.0.1 must be free. Stop the existing website before starting another instance.");
  await probe("Signing secret", () => signingSecret(root, env), "A persistent signing secret of at least 32 characters is required. Preserve it when moving or restoring the app.");
  await probe("Writable workspace", () => access(root, constants.W_OK), "The workspace must be writable for .data, snapshots and runtime files.");
  await probe("Writable data directory", async () => { try { await access(join(root, ".data")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } await access(join(root, ".data"), constants.W_OK); }, "An existing .data directory must be writable by the service account.");
  if (!checks.some(check => check.name === "Database URL" && check.status === "failed")) await probe("Database connection", async () => {
    const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
    try { await pool.query("SELECT 1"); } finally { await pool.end(); }
  }, "PostgreSQL must be reachable with the configured account. Run npm run db:up for the local database.");
  await probe("Docker daemon", () => run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 10000 }), "Docker must be running and accessible to both the website and worker.");
  await probe("Sandbox image", () => run("docker", ["image", "inspect", env.REQTEST_SANDBOX_IMAGE || "reqtest-python:1"], { timeout: 10000 }), "Build or select the sandbox image with npm run sandbox:build or REQTEST_SANDBOX_IMAGE.");
  if (requireBuild) await probe("Production build", () => access(join(root, ".next", "BUILD_ID")), "Run npm run build before starting the production website.");
  return checks;
}
