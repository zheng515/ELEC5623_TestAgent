import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "./auth";
import { githubArchive, importProject, projectDirectory, dockerTool, sandboxImage, retainSandboxImage } from "./python-tools";
import { prepareEnvironment } from "./environments";

export const setupSchema = z.object({
  id: z.string().uuid(), source: z.string(), fingerprint: z.string(), sandboxImage: z.string(), projectDirectory: z.string().default(""), runDirectory: z.string().default(""),
  runtime: z.enum(["python", "node"]).default("python"), baseImage: z.string().optional(), automaticSetup: z.boolean().default(false), services: z.array(z.enum(["postgres", "redis"])).default([]),
  installed: z.array(z.string()).default([]),
  setup: z.object({ status: z.enum(["ready", "limited", "needs_setup"]), python: z.string(), checks: z.array(z.object({ label: z.string(), status: z.enum(["passed", "failed", "unknown"]), detail: z.string() })), limitations: z.array(z.string()) }),
});
export type ProjectSetup = z.infer<typeof setupSchema>;
function directory(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid project setup ID.");
  return join(dataDir, "preflights", createHash("sha256").update(userId).digest("hex"), id);
}
export async function prepareProject(userId: string, form: FormData, signal: AbortSignal, connectedToken = "") {
  const repository = String(form.get("repository") || "").trim();
  const selectedDirectory = projectDirectory(String(form.get("projectDirectory") || ""));
  const runDirectory = projectDirectory(String(form.get("runDirectory") || ""));
  const file = form.get("project");
  if (repository && file instanceof File && file.size) throw new Error("Choose a repository or a ZIP, not both.");
  const downloaded = repository ? await githubArchive(repository, String(form.get("ref") || "HEAD").trim(), connectedToken || String(form.get("githubToken") || "").trim()) : null;
  if (!downloaded && (!(file instanceof File) || !file.size || file.size > 10_000_000)) throw new Error("Upload a project ZIP up to 10 MB or supply a GitHub repository.");
  const id = randomUUID(), root = directory(userId, id);
  try {
  await mkdir(join(root, "generated"), { recursive: true });
  const requested = z.enum(["auto", "python", "node"]).parse(String(form.get("runtime") || "auto"));
  const snapshot = await importProject(root, downloaded?.archive || Buffer.from(await (file as File).arrayBuffer()), requested, selectedDirectory);
  if (runDirectory && snapshot.runtime !== "python") throw new Error("A run directory is supported for Python projects only.");
  if (runDirectory && !Object.keys(snapshot.files).some(name => name.startsWith(runDirectory + "/"))) throw new Error("The run directory contains no imported files. Enter a path relative to the project directory.");
  await writeFile(join(root, "runtime.json"), JSON.stringify({ runtime: snapshot.runtime, runDirectory }));
  const baseImage = await sandboxImage(), automaticSetup = form.get("automaticSetup") === "true";
  const services = z.array(z.enum(["postgres", "redis"])).max(2).parse([...new Set(form.getAll("service").map(String))]);
  const environment = automaticSetup ? await prepareEnvironment(root, baseImage, signal) : { image: baseImage, installed: [] };
  const image = environment.image;
  await writeFile(join(root, "runtime.json"), JSON.stringify({ runtime: snapshot.runtime, runDirectory, services }));
  const setup = await dockerTool<ProjectSetup["setup"]>(root, { action: "preflight" }, signal, image);
  const source = (downloaded?.source || (file as File).name) + (selectedDirectory ? '/' + selectedDirectory : '');
  const result = setupSchema.parse({ id, source, projectDirectory: selectedDirectory, runDirectory, fingerprint: snapshot.fingerprint, sandboxImage: image, baseImage, automaticSetup, runtime: snapshot.runtime, services, installed: environment.installed, setup });
  await writeFile(join(root, "setup.json"), JSON.stringify(result), { mode: 0o600 });
  return result;
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
export async function loadProjectSetup(userId: string, id: string) {
  return setupSchema.parse(JSON.parse(await readFile(join(directory(userId, id), "setup.json"), "utf8")));
}
export async function copyPreparedProject(userId: string, id: string, root: string) {
  const setup = await loadProjectSetup(userId, id);
  if ((setup.baseImage || setup.sandboxImage) !== await sandboxImage()) throw new Error("Sandbox image changed. Check project setup again.");
  await retainSandboxImage(setup.sandboxImage);
  await cp(join(directory(userId, id), "source"), join(root, "source"), { recursive: true });
  await writeFile(join(root, "runtime.json"), JSON.stringify({ runtime: setup.runtime, runDirectory: setup.runDirectory, services: setup.services }));
  return setup;
}
