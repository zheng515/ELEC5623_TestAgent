import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dockerTool, readRunDirectory, readRuntime, retainSandboxImage } from "./python-tools";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const docker = promisify(execFile);
export async function prepareEnvironment(root: string, baseImage: string, signal: AbortSignal) {
  const runtime = await readRuntime(root), runDirectory = await readRunDirectory(root), directory = join(root, "source", runDirectory);
  // Requirement files may include each other, so every one in the run directory is part of the key.
  const names = [...new Set(["pyproject.toml", "package.json", "package-lock.json", ...(await readdir(directory)).filter(name => /requirements.*[.]txt$/.test(name))])].sort();
  const declarations = await Promise.all(names.map(async file => [file, await readFile(join(directory, file), "utf8").catch(() => "")]));
  const key = createHash("sha256").update(JSON.stringify({ runtime, runDirectory, baseImage, declarations })).digest("hex");
  const tag = "reqtest-env:" + key, name = "reqtest-build-" + randomUUID();
  signal.throwIfAborted();
  try {
    const { stdout } = await docker("docker", ["image", "inspect", "--format", '{{.Id}}\n{{index .Config.Labels "org.reqtest.dependencies"}}', tag], { timeout: 10000 });
    const [image, manifest] = stdout.trim().split('\n');
    const installed: string[] = JSON.parse(manifest);
    return { image: await retainSandboxImage(image), installed, cached: true };
  } catch {}
  try {
    const result = await dockerTool<{ installed?: string[]; error?: string }>(root, { action: "prepare" }, signal, baseImage, name);
    if (result.error) throw new Error(result.error);
    signal.throwIfAborted();
    const installed = result.installed || [];
    const image = (await docker("docker", ["commit", "--change", 'LABEL org.reqtest.dependencies=' + JSON.stringify(JSON.stringify(installed)), name, tag], { timeout: 30000 })).stdout.trim();
    return { image: await retainSandboxImage(image), installed, cached: false };
  } finally { await docker("docker", ["rm", "-f", name]).catch(() => {}); }
}
