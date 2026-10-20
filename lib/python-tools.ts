import JSZip from "jszip";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, basename } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Measurement, Mutation, PythonTest } from "./python-types";
import { testFile, type ProjectRuntime } from "./runtime";
import { testServices } from "./test-services";

export type Inspection = { environment?: Record<string, string>; files: Record<string, string>; functions: { file: string; name: string; line: number; end: number }[]; nodes: string[]; collection: { exitCode: number; log: string; timedOut?: boolean }; errors: string[] };
export async function importProject(root: string, archive: Buffer, requested: ProjectRuntime | "auto" = "auto") {
  if (archive.length > 10_000_000) throw new Error("ZIP must be smaller than 10 MB.");
  const zip = await JSZip.loadAsync(archive);
  const entries = Object.values(zip.files).filter((file) => !file.dir);
  if (entries.length > 500) throw new Error("Use a small project (at most 500 files).");
  const prefix = entries.every((file) => file.name.includes('/') && file.name.split('/')[0] === entries[0]?.name.split('/')[0]) ? entries[0]?.name.split('/')[0] + '/' : '';
  const files: Record<string, string> = {};
  let size = 0;
  for (const entry of entries) {
    const unsafe = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName || entry.name;
    if (unsafe.split(/[\\/]/).includes('..') || unsafe.startsWith('/') || unsafe.includes('\\')) throw new Error("Unsafe archive path.");
    const name = entry.name.slice(prefix.length);
    if (!/^[\w./-]+$/.test(name) || name.split('/').some((part) => part.startsWith('.') || ['node_modules', '__pycache__', 'reqtest_generated'].includes(part))) continue;
    if (!/\.(py|[cm]?[jt]sx?|md|txt|toml|cfg|json|lock)$/.test(name)) continue;
    const declared = (entry as unknown as { _data: { uncompressedSize: number } })._data?.uncompressedSize;
    if (!Number.isFinite(declared) || declared > 200_000 || size + declared > 3_000_000) throw new Error("Expanded project exceeds the 3 MB limit or a file exceeds 200 KB.");
    const text = await entry.async('string'); size += Buffer.byteLength(text);
    if (size > 3_000_000) throw new Error("Expanded project is too large.");
    files[name] = text;
  }
  const hasPython = Object.keys(files).some(name => name.endsWith(".py"));
  const hasNode = Object.keys(files).some(name => /\.[cm]?[jt]sx?$/.test(name));
  const runtime = requested === "auto" ? hasPython ? "python" : "node" : requested;
  if (runtime === "python" ? !hasPython : !hasNode) throw new Error("No source files found for the selected Python or Node.js runtime.");
  const snapshot = join(root, 'source');
  for (const [name, text] of Object.entries(files)) { await mkdir(join(snapshot, name, '..'), { recursive: true }); await writeFile(join(snapshot, name), text); }
  const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');
  await writeFile(join(root, "runtime.json"), JSON.stringify({ runtime }));
  return { files, fingerprint, runtime };
}
export async function githubArchive(url: string, ref = "HEAD", token = "") {
  const match = /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  if (!match) throw new Error("Use a GitHub repository URL, without a branch or path. Enter the branch or commit separately.");
  if (ref.length > 200 || /[\x00-\x1f]/.test(ref) || token.length > 255 || token && !/^[A-Za-z0-9_]+$/.test(token)) throw new Error("Invalid GitHub ref or access token.");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = "Bearer " + token;
  const api = `https://api.github.com/repos/${match[1]}/${match[2]}`;
  const response = await fetch(`${api}/commits/${encodeURIComponent(ref || 'HEAD')}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error("Cannot resolve this GitHub repository/ref. Check repository permissions, reconnect GitHub in Account, or replace the temporary token.");
  const { sha } = await response.json();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("GitHub returned an invalid commit.");
  let urlToFetch = `https://codeload.github.com/${match[1]}/${match[2]}/zip/${sha}`;
  if (token) {
    const redirect = await fetch(`${api}/zipball/${sha}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    const location = redirect.headers.get('location');
    if (redirect.status !== 302 || !location || !URL.canParse(location) || new URL(location).origin !== 'https://codeload.github.com' || new URL(location).username || new URL(location).password) throw new Error("Cannot authorize the GitHub archive download.");
    urlToFetch = location;
  }
  // Never forward the API token to an archive host or store signed download URLs.
  const archive = await fetch(urlToFetch, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!archive.ok || !archive.body) throw new Error("Cannot download the repository.");
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = archive.body.getReader();
  try { while (true) { const { value: chunk, done } = await reader.read(); if (done) break; size += chunk.length; if (size > 10_000_000) throw new Error("Repository exceeds 10 MB. Upload a smaller ZIP."); chunks.push(chunk); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { archive: Buffer.concat(chunks), source: `${url.replace(/\.git\/?$/, '')}/tree/${sha}` };
}
export async function retainSandboxImage(reference: string) {
  const docker = promisify(execFile);
  const { stdout } = await docker('docker', ['image', 'inspect', '--format', '{{.Id}}', reference], { timeout: 10000 });
  const id = stdout.trim();
  // A durable tag retains OCI image records when the development tag is rebuilt.
  await docker('docker', ['image', 'tag', id, 'reqtest-pinned:' + id.replace('sha256:', '')], { timeout: 10000 });
  return id;
}
export async function sandboxImage() {
  return retainSandboxImage(process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1');
}
export async function dockerTool<T>(root: string, job: object, signal: AbortSignal, image = process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', buildName?: string): Promise<T> {
  signal.throwIfAborted();
  const name = buildName || 'reqtest-' + randomUUID();
  const runtime = await readRuntime(root);
  const config = await readFile(join(root, "runtime.json"), "utf8").then(text => JSON.parse(text)).catch(() => ({}));
  const service = !buildName && ["inspect", "measure", "mutate"].includes((job as {action?:string}).action || "") ? await testServices(config.services || [], signal, basename(root)) : await testServices([], signal);
  if (signal.aborted) { await service.cleanup(); signal.throwIfAborted(); }
  const child = spawn('docker', ['run', ...(buildName ? [] : ['--rm']), '-i', '--name', name, '--label', 'reqtest.role=sandbox', '--label', 'reqtest.scope=' + basename(root), '--network', buildName ? 'bridge' : service.network, ...(buildName ? [] : ['--read-only']), '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit', '128', '--cpus', '1', '--memory', '512m', ...service.env.flatMap(value => ['--env', value]), '--tmpfs', '/work:rw,exec,size=256m,mode=1777', '--tmpfs', '/tmp:rw,exec,size=32m,mode=1777', '--mount', `type=bind,src=${join(root, 'source')},dst=/project,readonly`, '--mount', `type=bind,src=${join(root, 'generated')},dst=/generated,readonly`, image], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', stopReason = '';
  let removal: Promise<unknown> | undefined;
  const stop = () => { removal ||= promisify(execFile)('docker', ['rm', '-f', name], { timeout: 10000 }).catch(() => {}); child.kill(); };
  const timeout = setTimeout(() => { stopReason = 'Sandbox execution exceeded its time limit.'; stop(); }, buildName ? 240000 : 110000);
  signal.addEventListener('abort', stop, { once: true });
  child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ ...job, runtime }));
  try {
    return await new Promise<T>((resolve, reject) => {
      child.on('error', reject);
      child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 4_000_000) { stopReason = 'Sandbox output exceeded its limit.'; stop(); } });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
      child.on('close', (code) => {
        if (signal.aborted) return reject(new Error('Run cancelled.'));
        if (stopReason) return reject(new Error(stopReason));
        if (code !== 0) {
          let detail = '';
          try { detail = JSON.parse(stdout).error || ''; } catch {}
          return reject(new Error(`Sandbox failed (${code}): ${detail || stderr || (code === 137 ? 'Memory limit exceeded or container stopped.' : 'Check Docker and the selected runtime/image.')}`));
        }
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Sandbox returned no valid evidence.')); }
      });
    });
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', stop); await removal; await service.cleanup(); }
}
export async function writeTests(root: string, tests: PythonTest[]) {
  const { rm } = await import('node:fs/promises');
  await mkdir(join(root, 'generated'), { recursive: true });
  for (const name of await readdir(join(root, 'generated'))) await rm(join(root, 'generated', name), { recursive: true, force: true });
  const runtime = await readRuntime(root);
  for (const test of tests.filter(test => test.approved)) await writeFile(join(root, "generated", testFile(test.id, runtime).split("/")[1]), test.code);
}
export const inspectProject = (root: string, signal: AbortSignal, image?: string) => dockerTool<Inspection>(root, { action: 'inspect' }, signal, image);
export const measureProject = (root: string, nodes: string[], generated: boolean, signal: AbortSignal, image?: string) => dockerTool<Measurement>(root, { action: 'measure', nodes, generated }, signal, image);
export const mutateProject = (root: string, file: string, signal: AbortSignal, image?: string) => dockerTool<Mutation>(root, { action: 'mutate', file }, signal, image);


export async function readRuntime(root: string): Promise<ProjectRuntime> {
  try { const data = JSON.parse(await readFile(join(root, "runtime.json"), "utf8")); return data.runtime === "node" ? "node" : "python"; } catch { return "python"; }
}
