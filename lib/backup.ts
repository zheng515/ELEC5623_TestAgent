import { mkdir, readdir, readFile, writeFile, lstat, rm, rename, chmod } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import JSZip from "jszip";
import { z } from "zod";
import { operationGate, signingSecret } from "./operations";

const limit = 200_000_000;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const manifestSchema = z.object({ version: z.literal(1), createdAt: z.string(), namespace: z.string().regex(/^[\w-]{0,40}$/), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) });
type Settings = { root: string; env: NodeJS.ProcessEnv };
function localDatabase(env: NodeJS.ProcessEnv) {
  const url = new URL(env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" || !url.username || url.pathname.length < 2) throw new Error("Backup helpers require the local Compose PostgreSQL database on port 5433. Use provider backup tools for external databases.");
  return { user: decodeURIComponent(url.username), name: decodeURIComponent(url.pathname.slice(1)) };
}
async function pgTool(settings: Settings, tool: "pg_dump" | "pg_restore", args: string[], input?: Buffer) {
  const db = localDatabase(settings.env);
  return new Promise<Buffer>((accept, reject) => {
    const child = spawn("docker", ["compose", "-f", join(settings.root, "compose.yaml"), "exec", "-T", "db", tool, "--username", db.user, ...args], { cwd: settings.root, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let size = 0;
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) child.kill("SIGKILL"); else chunks.push(chunk); });
    child.stderr.resume(); child.stdin.on("error", () => {});
    child.once("error", () => reject(new Error("Cannot start the local PostgreSQL backup tool. Check Docker and the Compose database.")));
    child.once("close", code => code === 0 && size <= limit ? accept(Buffer.concat(chunks)) : reject(new Error("PostgreSQL backup/restore failed or exceeded the 200 MB limit. Check the local database and archive.")));
    child.stdin.end(input);
  });
}
function safePath(path: string) {
  return !!path && !path.startsWith("/") && !path.includes("\\") && path.split("/").every(part => !!part && part !== "." && part !== "..");
}
async function packData(root: string) {
  const zip = new JSZip(); let total = 0, count = 0;
  async function walk(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === ".runtime") continue;
      const name = prefix + entry.name, path = join(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || !safePath(name)) throw new Error("Backup data contains an unsafe path or symbolic link.");
      if (stat.isDirectory()) await walk(path, name + "/");
      else {
        if (!stat.isFile() || (total += stat.size) > limit || ++count > 50000) throw new Error("Backup data exceeds the 200 MB / 50,000 file limit or contains a special file.");
        zip.file(name, await readFile(path), { createFolders: false });
      }
    }
  }
  await walk(join(root, ".data"));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
async function emptyDatabase(pool: Pool) {
  const tables = await pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','S','v','m','f') LIMIT 1");
  if (tables.rowCount) throw new Error("Restore requires an empty database. Create a new database; existing data will not be overwritten.");
}
async function noRunningReports(pool: Pool) {
  const tables = await pool.query("SELECT schemaname FROM pg_tables WHERE tablename='runs'");
  for (const { schemaname } of tables.rows) {
    const table = '"' + String(schemaname).replaceAll('"', '""') + '".runs';
    if ((await pool.query(`SELECT 1 FROM ${table} WHERE report->>'status'='running' LIMIT 1`)).rowCount) throw new Error("Finish or cancel all queued/running verifications before making an offline backup.");
  }
}
export async function createBackup(settings: Settings = { root: process.cwd(), env: process.env }) {
  const db = localDatabase(settings.env), pool = new Pool({ connectionString: settings.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  let output = "";
  try {
    return await operationGate(pool, settings.root, true, async () => {
      await noRunningReports(pool);
      const secret = await signingSecret(settings.root, settings.env), data = await packData(settings.root);
      const dump = await pgTool(settings, "pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--dbname", db.name]);
      output = join(settings.root, ".backups", new Date().toISOString().replaceAll(":", "-") + "-" + randomUUID().slice(0, 8));
      await mkdir(output, { recursive: true, mode: 0o700 });
      await chmod(join(settings.root, ".backups"), 0o700);
      const contents = { "database.dump": dump, "data.zip": data, "signing-secret": Buffer.from(secret) };
      for (const [name, bytes] of Object.entries(contents)) await writeFile(join(output, name), bytes, { mode: 0o600 });
      const manifest = manifestSchema.parse({ version: 1, createdAt: new Date().toISOString(), namespace: settings.env.REQTEST_DATA_NAMESPACE || "", files: Object.fromEntries(Object.entries(contents).map(([name, bytes]) => [name, digest(bytes)])) });
      await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
      return output;
    });
  } catch (error) { if (output) await rm(output, { recursive: true, force: true }); throw error; }
  finally { await pool.end(); }
}
export async function inspectBackup(directory: string) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
  const contents: Record<string, Buffer> = {};
  if (Object.keys(manifest.files).sort().join(",") !== "data.zip,database.dump,signing-secret") throw new Error("Unexpected backup manifest files.");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const file = join(directory, name), stat = await lstat(file);
    if (!stat.isFile() || stat.size > limit) throw new Error("Invalid or oversized backup file.");
    const bytes = await readFile(file);
    if (digest(bytes) !== hash) throw new Error("Backup integrity check failed. No restore was attempted.");
    contents[name] = bytes;
  }
  const zip = await JSZip.loadAsync(contents["data.zip"]);
  let size = 0, count = 0;
  for (const entry of Object.values(zip.files)) {
    const original = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName || entry.name;
    const mode = Number(entry.unixPermissions || 0) & 0o170000;
    if (!safePath(original.replace(/\/$/, "")) || entry.name.startsWith(".runtime/") || mode === 0o120000) throw new Error("Unsafe backup archive path.");
    const length = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
    if (!entry.dir && ((size += length) > limit || ++count > 50000)) throw new Error("Backup archive exceeds the restore limits.");
  }
  await JSZip.loadAsync(contents["data.zip"], { checkCRC32: true });
  if (contents["signing-secret"].length < 32) throw new Error("Backup signing secret is invalid.");
  return { manifest, contents, zip };
}
export async function restoreBackup(directory: string, settings: Settings = { root: process.cwd(), env: process.env }) {
  const db = localDatabase(settings.env), backup = await inspectBackup(resolve(directory));
  if (backup.manifest.namespace !== (settings.env.REQTEST_DATA_NAMESPACE || "")) throw new Error("Restore namespace differs from the backup configuration.");
  if (settings.env.BETTER_AUTH_SECRET && settings.env.BETTER_AUTH_SECRET !== backup.contents["signing-secret"].toString()) throw new Error("BETTER_AUTH_SECRET does not match this backup. Restore the original signing secret before continuing.");
  const pool = new Pool({ connectionString: settings.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const data = join(settings.root, ".data"), staging = join(settings.root, ".restore-" + randomUUID());
  try {
    await operationGate(pool, settings.root, true, async () => {
      await emptyDatabase(pool);
      const existing = await readdir(data).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
      if (existing.some(name => name !== ".runtime")) throw new Error("Restore requires an empty .data directory. Existing files will not be overwritten.");
      await pgTool(settings, "pg_restore", ["--list"], backup.contents["database.dump"]);
      await mkdir(staging, { mode: 0o700 });
      for (const entry of Object.values(backup.zip.files)) {
        if (entry.dir) continue;
        const target = join(staging, entry.name);
        if (relative(staging, target).startsWith("..")) throw new Error("Unsafe restore path.");
        await mkdir(join(target, ".."), { recursive: true, mode: 0o700 });
        await writeFile(target, await entry.async("nodebuffer"), { mode: 0o600 });
      }
      const secret = join(staging, backup.manifest.namespace, "auth-secret");
      await mkdir(join(secret, ".."), { recursive: true, mode: 0o700 });
      await writeFile(secret, backup.contents["signing-secret"], { mode: 0o600 });
      // The destination was empty; retain restored files if PostgreSQL reports a failure.
      await rm(join(data, ".runtime"), { recursive: true, force: true });
      await rename(staging, data);
      await pgTool(settings, "pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--dbname", db.name], backup.contents["database.dump"]);
    });
  } finally { await rm(staging, { recursive: true, force: true }); await pool.end(); }
}
