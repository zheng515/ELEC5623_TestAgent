import { loadEnvConfig } from "@next/env";
/** Explicit model-backed CI check. Run only with approved project data. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";
import { importProject, sandboxImage } from "../lib/python-tools";
import { testArchive } from "../lib/test-export";
import { runPython } from "../lib/python-agent";
import type { PythonReport } from "../lib/python-types";
import { parseRequirementInput } from '../lib/requirement-input';
import { verificationGate } from '../lib/run-evaluation';
import { verificationPolicySchema } from '../lib/verification-policy';
async function main() {
  loadEnvConfig(process.cwd(), true);
  if (!process.env.OPENAI_API_KEY) throw new Error("Configure OPENAI_API_KEY. This command makes paid model requests.");
  const config = z.object({ project: z.string(), requirements: z.string(), output: z.string().default(".evidence/verification"), requireVerified: z.boolean().default(true), policy: verificationPolicySchema.default(() => verificationPolicySchema.parse({})) }).parse(JSON.parse(await readFile(process.argv[2] || "examples/verification.json", "utf8")));
  const directory = resolve(config.project), zip = new JSZip();
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "__pycache__", "reqtest_generated"].includes(entry.name)) continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(py|[cm]?[jt]sx?|md|txt|cfg|toml|json|lock)$/.test(file)) zip.file(relative(directory, file), await readFile(file));
    }
  }
  await visit(directory);
  const { rules, ...requirementInput } = parseRequirementInput(await readFile(config.requirements, 'utf8'));
  if (rules.length > 24) throw new Error('Use up to 24 requirement items and at most 12,000 characters.');
  const id = randomUUID(), root = resolve(config.output, id);
  await mkdir(join(root, "generated"), { recursive: true });
  const snapshot = await importProject(root, await zip.generateAsync({ type: "nodebuffer" }));
  process.env.REQTEST_SANDBOX_IMAGE = await sandboxImage();
  const report: PythonReport = { policy: config.policy, runtime: snapshot.runtime, id, title: "CI verification", createdAt: new Date().toISOString(), model: process.env.REQTEST_LLM_MODEL || "gpt-6-luna", source: config.project, fingerprint: snapshot.fingerprint, requirementInput, status: "running", stage: "", rules, tests: [], measurements: [], mutations: [], diagnoses: [], relevance: [], improvements: [], states: [], limitations: ["Model-generated assessments require review. CI completion is not exhaustive correctness."] };
  const controller = new AbortController(); process.once("SIGINT", () => controller.abort());
  const save = () => writeFile(join(root, "report.json"), JSON.stringify(report, null, 2));
  try { await runPython(report, root, AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]), async stage => { console.log(stage); await save(); }); }
  catch (error) { report.status = controller.signal.aborted ? "cancelled" : "failed"; report.error = (error instanceof Error ? error.message : "Failed").replaceAll(process.env.OPENAI_API_KEY, "[redacted]"); report.states = report.states.map(state => ({ ...state, status: "Uncertain" })); }
  await save();
  await writeFile(join(root, "tests.zip"), await testArchive(report, "report.json").generateAsync({ type: "nodebuffer" }));
  const passed = verificationGate(report, config.requireVerified);
  await writeFile(join(root, "summary.md"), ["# Requirement verification", "", "Gate: " + (passed ? "passed" : "failed / incomplete"), "Workflow: " + report.status, "Source SHA-256: " + report.fingerprint, "", ...report.states.map(state => "- " + state.id + ": " + state.status + " — " + state.reason), "", "Passing checks describe recorded cases only. Review report.json and tests.zip."].join("\n"));
  console.log("Evidence: " + root);
  process.exitCode = passed ? 0 : 1;
}
main().catch(error => { console.error((error instanceof Error ? error.message : "Verification failed.").replaceAll(process.env.OPENAI_API_KEY || "\0", "[redacted]")); process.exitCode = 1; });
