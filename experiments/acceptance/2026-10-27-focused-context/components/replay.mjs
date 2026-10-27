import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { APICallError } from "ai";
async function main() {
  if (process.argv.includes("--help") || !process.argv[2]) { console.log("Usage: node --import tsx replay.mjs OUTPUT_DIRECTORY (requires copied inputs; makes four paid requests)"); return; }
  loadEnvConfig(process.cwd(), true);
  const { reason } = await import(pathToFileURL(resolve("lib/python-agent.ts")).href);
  const { reviewTestsSchema, diagnosisSchema } = await import(pathToFileURL(resolve("lib/python-types.ts")).href);
  const { modelError } = await import(pathToFileURL(resolve("lib/model.ts")).href);
  const root = resolve(process.argv[2]);
  const cases = [
    { id: "unsupported_assertion", kind: "review", input: "unsupported_assertion-3-review.json", draftExpected: "blocked" },
    { id: "ambiguous_requirement", kind: "review", input: "ambiguous_requirement-3-review.json", draftExpected: "blocked" },
    { id: "bad_import", kind: "diagnosis", input: "bad_import-4-diagnosis.json", draftExpected: "generated_test_error" },
    { id: "implementation_defect", kind: "diagnosis", input: "implementation_defect-4-diagnosis.json", draftExpected: "potential_implementation_defect" }
  ];
  const files = ["lib/python-agent.ts", "lib/python-types.ts", "lib/python-tools.ts", "lib/model.ts", "lib/runtime.ts", "lib/mutation-review.ts", "lib/test-services.ts", "tests/agent-safety.test.ts", "tests/fixtures/python-agent.ts", "sandbox/worker.py", "package-lock.json"];
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  async function sources() {
    return Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")]));
  }
  const frozen = await sources(), sourceHash = hash(JSON.stringify(frozen));
  await mkdir(root, { recursive: true });
  const index = { createdAt: (/* @__PURE__ */ new Date()).toISOString(), model: process.env.REQTEST_LLM_MODEL || "gpt-6-luna", policy: "contract-witness-v7-focused-context", scope: "Four raw component decisions on captured production follow-up contexts. Initial analyses, proposals and admission are scripted to reach the target stages. Tracebacks come from real Docker execution. This is not whole-agent acceptance, independent accuracy or a repeated benchmark.", sourceHash, planned: cases.length, independentAccuracy: null, referenceReviewed: false, status: "running", attempts: [] };
  await writeFile(join(root, "agent-snapshot.json"), JSON.stringify(frozen));
  try {
    for (const item of cases) {
      if (hash(JSON.stringify(await sources())) !== sourceHash) throw new Error("Source changed during acceptance.");
      const inputText = await readFile(join(root, "inputs", item.input), "utf8");
      const input = JSON.parse(inputText);
      const started = Date.now(), attempt = { id: item.id, kind: item.kind, inputHash: hash(inputText), contextBytes: Buffer.byteLength(JSON.stringify(input.context)), elapsedMs: 0, draftExpected: item.draftExpected };
      index.attempts.push(attempt);
      try {
        const result = item.kind === "review" ? await reason(reviewTestsSchema, input.task, input.context, index.model, AbortSignal.timeout(9e4), (usage) => {
          attempt.usage = usage;
        }) : await reason(diagnosisSchema, input.task, input.context, index.model, AbortSignal.timeout(9e4), (usage) => {
          attempt.usage = usage;
        });
        await writeFile(join(root, item.id + "-output.json"), JSON.stringify(result, null, 2));
        const decision = result.decisions.length === 1 && result.decisions[0].testId === "T1" ? result.decisions[0] : void 0;
        attempt.label = decision && ("supported" in decision ? decision.supported ? "supported" : "blocked" : decision.category);
        attempt.quoteGrounded = !!decision?.quote.trim() && input.context.rules.some((rule) => rule.text.includes(decision.quote));
        if (decision && "evidence" in decision) attempt.artifactQuotesGrounded = decision.evidence.every((evidence) => input.context.files[evidence.file]?.includes(evidence.quote)) && !!decision.executionQuote.trim() && [input.context.measurement.log, ...input.context.measurement.outcomes.map((outcome) => outcome.message)].some((log) => log.includes(decision.executionQuote));
        console.log(item.id, attempt.label || "invalid decision");
      } catch (error) {
        attempt.error = modelError(error);
        console.log(item.id, "request failed; evidence retained");
        if (APICallError.isInstance(error) && [401, 403, 404, 429].includes(error.statusCode || 0)) throw new Error(attempt.error);
      } finally {
        attempt.elapsedMs = Date.now() - started;
        await writeFile(join(root, "index.json"), JSON.stringify(index, null, 2));
      }
    }
    index.status = index.attempts.some((attempt) => attempt.error || !attempt.label) ? "incomplete" : "completed";
  } catch (error) {
    index.status = "failed";
    console.error(modelError(error));
    process.exitCode = 1;
  } finally {
    await writeFile(join(root, "index.json"), JSON.stringify(index, null, 2));
  }
}
main().catch(() => {
  console.error("Acceptance setup failed before completion.");
  process.exitCode = 1;
});
