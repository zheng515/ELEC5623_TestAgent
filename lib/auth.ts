import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, passwordError } from "./password";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { mailConfigured, sendAccountMail } from "./mail";
import { githubConfigured } from "./github-config";
import { registerRuntime } from "./operations";

const namespace = process.env.REQTEST_DATA_NAMESPACE || "";
if (!/^[\w-]*$/.test(namespace)) throw new Error("Invalid data namespace.");
export const dataDir = join(process.cwd(), ".data", namespace);
let instance: ReturnType<typeof betterAuth>;
let ready: Promise<unknown>;
export let database: Pool;
export async function getAuth() {
  if (!ready) ready = initialize();
  await ready;
  return instance;
}
async function initialize() {
  try {
    if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL and run npm run db:up before starting ReqTest.");
    const schema = namespace ? namespace.replaceAll('-', '_') : 'public';
    database = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 5, connectionTimeoutMillis: 5000 });
    database.on('error', () => console.error('PostgreSQL connection lost. Check the database service.'));
    await registerRuntime(database);
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const secretFile = join(dataDir, "auth-secret");
    if (!process.env.BETTER_AUTH_SECRET) {
      try { writeFileSync(secretFile, randomBytes(48).toString("base64"), { flag: "wx", mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" && !mailConfigured()) throw new Error("Configure email delivery before requiring email verification.");
    instance = betterAuth({
      database,
      baseURL: process.env.BETTER_AUTH_URL || "http://127.0.0.1:3001",
      secret: process.env.BETTER_AUTH_SECRET || readFileSync(secretFile, "utf8"),
      socialProviders: githubConfigured() ? { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET!, disableSignUp: true } } : {},
      account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true } },
      // Provider credentials are consumed by server APIs, never returned over HTTP.
      disabledPaths: ["/get-access-token", "/refresh-token"],
      emailAndPassword: {
        enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH,
        requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
        revokeSessionsOnPasswordReset: true,
        ...(mailConfigured() ? { sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => { await sendAccountMail(user.email, "Reset your ReqTest password", "Use this link to reset your password:\n" + url + "\nIf you did not request this, ignore this email."); } } : {}),
      },
      ...(mailConfigured() ? { emailVerification: { sendOnSignUp: true, sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => { await sendAccountMail(user.email, "Verify your ReqTest email", "Confirm your email address:\n" + url); } } } : {}),
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          let password: unknown;
          if (ctx.path === "/sign-up/email") password = ctx.body?.password;
          else if (["/change-password", "/reset-password", "/set-password"].includes(ctx.path || "")) password = ctx.body?.newPassword;
          else return;
          if (typeof password !== "string") return;
          const message = passwordError(password);
          if (message) throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message });
        }),
      },
      rateLimit: { enabled: true, storage: "database" },
    } as BetterAuthOptions);
      await database.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      const { runMigrations } = await getMigrations(instance.options);
      await runMigrations();
      await database.query(`CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        report JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await database.query('CREATE INDEX IF NOT EXISTS runs_user_created ON runs (user_id, created_at DESC)');
      await database.query('ALTER TABLE runs ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false');
      await database.query('CREATE TABLE IF NOT EXISTS run_checkpoints (run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, key TEXT NOT NULL, value JSONB NOT NULL, PRIMARY KEY(run_id,key))');
  } catch (error) { await database?.end(); throw error; }
}
export async function session(request: Request) {
  return (await getAuth()).api.getSession({ headers: request.headers });
}
