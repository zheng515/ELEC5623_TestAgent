import { isDeepStrictEqual } from "node:util";
import type { CaseResult, Review, Rule, TestCase, VerificationInput } from "./verification";

export function approval(test: TestCase, rules: Rule[], review: Review): string | undefined {
  const decision = review.decisions.find((item) => item.caseId === test.id);
  const rule = rules.find((item) => item.id === test.ruleId);
  const coverage = review.coverage.find((item) => item.ruleId === test.ruleId);
  if (!rule || decision?.verdict !== "supported" || coverage?.verdict !== "covered")
    return decision?.reason || coverage?.reason || "No supported review.";
  if (!decision.evidence.trim() || !rule.text.includes(decision.evidence))
    return "Review evidence is not a verbatim quote of the linked requirement.";
  if (test.expectedStatus === null && !test.assertions.length) return "No executable assertion.";
  try {
    for (const check of test.assertions) JSON.parse(check.expectedJson);
    if (test.bodyJson !== null) JSON.parse(test.bodyJson);
  } catch { return "The proposed JSON literal is invalid."; }
}

export function atPointer(value: unknown, pointer: string): unknown {
  if (!pointer) return value;
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key))
      throw new Error("Missing JSON Pointer: " + pointer);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Response exceeds the 64 KiB evidence limit.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function executeCases(
  input: VerificationInput, rules: Rule[], cases: TestCase[], review: Review,
  signal: AbortSignal, onResult: (result: CaseResult) => void,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const test of cases) {
    signal.throwIfAborted();
    const started = performance.now();
    const result: CaseResult = { caseId: test.id, ruleId: test.ruleId, status: "blocked", reason: "", durationMs: 0 };
    const blocked = approval(test, rules, review);
    if (blocked || (input.method === "GET" && test.bodyJson !== null)) {
      result.reason = blocked || "GET requests cannot have a body.";
    } else {
      const url = new URL(input.endpoint);
      for (const item of test.query) url.searchParams.set(item.name, item.value);
      result.request = { url: url.toString(), method: input.method, bodyJson: test.bodyJson };
      try {
        const response = await fetch(url, {
          method: input.method,
          headers: { "Content-Type": "application/json", ...input.headers },
          body: test.bodyJson === null ? undefined : test.bodyJson,
          redirect: "error", cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });
        const body = await boundedText(response);
        result.response = { status: response.status, body };
        result.checks = [];
        if (test.expectedStatus !== null) result.checks.push({
          label: "HTTP status", expected: test.expectedStatus, actual: response.status,
          passed: response.status === test.expectedStatus,
        });
        for (const check of test.assertions) {
          const expected: unknown = JSON.parse(check.expectedJson);
          let actual: unknown = null, passed = false;
          try {
            actual = atPointer(JSON.parse(body), check.pointer);
            passed = isDeepStrictEqual(actual, expected);
          } catch { /* Missing fields and non-JSON bodies are failed assertions. */ }
          result.checks.push({ label: check.pointer || "Entire JSON body", expected, actual, passed });
        }
        result.status = result.checks.every((check) => check.passed) ? "passed" : "failed";
        result.reason = result.status === "passed" ? "Observed output matches the reviewed checks." : "Observed output differs from the reviewed expectation.";
      } catch (error) {
        signal.throwIfAborted();
        result.status = "error";
        result.reason = error instanceof Error ? error.message : "HTTP execution failed.";
      }
    }
    result.durationMs = Math.round(performance.now() - started);
    results.push(result);
    onResult(result);
  }
  return results;
}
