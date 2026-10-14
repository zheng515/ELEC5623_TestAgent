import type { AgentArtifact } from "./types";
import type { VerificationInput, VerificationReport } from "./verification";
import { approval } from "./execute";

export function summarize(report: VerificationReport) {
  report.uncoveredRuleIds = report.rules.filter((rule) => {
    const results = report.results.filter((item) => item.ruleId === rule.id);
    return !results.length || results.some((item) => !["passed", "failed"].includes(item.status)) ||
      report.review.coverage.find((item) => item.ruleId === rule.id)?.verdict !== "covered";
  }).map((rule) => rule.id);
  report.conclusion = report.results.some((item) => item.status === "failed") ? "failed" :
    report.uncoveredRuleIds.length || report.results.some((item) => item.status === "error" || item.status === "blocked") ? "inconclusive" : "passed";
  const count = (status: string) => report.results.filter((item) => item.status === status).length;
  report.summary = [count("passed") + " passed", count("failed") + " failed", count("blocked") + " blocked",
    count("error") + " execution errors", report.uncoveredRuleIds.length + " requirement(s) not fully checked"].join("; ") + ".";
  return report;
}

export function artifacts(report: VerificationReport): AgentArtifact[] {
  const approved = report.cases.filter((test) => !approval(test, report.rules, report.review) && !(report.method === "GET" && test.bodyJson !== null));
  const source = [
    'import { test } from "node:test";',
    'import assert from "node:assert/strict";',
    'const endpoint = process.env.TEST_ENDPOINT || ' + JSON.stringify(report.endpoint) + ";",
    'const method = ' + JSON.stringify(report.method) + ";",
    'const cases = ' + JSON.stringify(approved, null, 2) + ";",
    'const headers = JSON.parse(process.env.TEST_HEADERS || "{}");',
    'assert.ok(cases.length, "No supported executable cases. Inspect verification.json; this is not a passing test run.");',
    'function at(value, pointer) {',
    '  if (!pointer) return value;',
    '  for (const part of pointer.slice(1).split("/")) {',
    '    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");',
    '    assert.ok(value !== null && typeof value === "object" && Object.hasOwn(value, key), "Missing JSON Pointer: " + pointer);',
    '    value = value[key];',
    '  }',
    '  return value;',
    '}',
    'for (const item of cases) test(item.id + ": " + item.title, async () => {',
    '  const url = new URL(endpoint);',
    '  for (const query of item.query) url.searchParams.set(query.name, query.value);',
    '  const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers },',
    '    body: item.bodyJson === null ? undefined : item.bodyJson, redirect: "error", signal: AbortSignal.timeout(10000) });',
    '  if (item.expectedStatus !== null) assert.equal(response.status, item.expectedStatus);',
    '  if (item.assertions.length) {',
    '    const body = await response.json();',
    '    for (const check of item.assertions) assert.deepStrictEqual(at(body, check.pointer), JSON.parse(check.expectedJson));',
    '  }',
    '});',
    '// Only independently supported cases are exported. See verification.json for blocked/uncovered requirements.',
  ].join("\n");
  const markdown = [
    "# HTTP functional test report", "", report.summary, "",
    "Conclusion: " + report.conclusion + ". Passing cases do not prove complete correctness.",
    "Endpoint: " + report.method + " " + report.endpoint,
    "Model: " + report.model, "Elapsed: " + report.elapsedMs + " ms", "",
    "## Requirements",
    ...report.rules.map((rule) => "- " + rule.id + ": " + rule.text +
      (report.uncoveredRuleIds.includes(rule.id) ? " [not fully checked]" : " [checks executed]")),
    "", "## Case outcomes",
    ...report.results.map((result) => "- " + result.caseId + " / " + result.ruleId + ": " + result.status + " — " + result.reason),
    "", "## Limits", ...report.limitations.map((line) => "- " + line),
    "", "Full requests, observed responses, reviewed expectations and decisions are in verification.json.",
  ].join("\n");
  return [
    { id: "report", name: "verification.json", type: "json", content: JSON.stringify(report, null, 2) },
    { id: "tests", name: "test_api.mjs", type: "code", language: "javascript", content: source },
    { id: "summary", name: "summary.md", type: "markdown", content: markdown },
  ];
}

export function emptyReport(input: VerificationInput): VerificationReport {
  return {
    version: 1, title: input.title, endpoint: input.endpoint, method: input.method, model: input.model,
    createdAt: new Date().toISOString(), rules: [], cases: [], review: { decisions: [], coverage: [] },
    results: [], uncoveredRuleIds: [], conclusion: "inconclusive", summary: "", elapsedMs: 0,
    limitations: [
      "Each nonblank input line is one requirement. Compound lines may contain untested details.",
      "Model review is fallible. Missing rules and unsupported cases are never counted as passing.",
      "Passing checks describe only the listed inputs, not exhaustive correctness or mutation adequacy.",
      "Requests use a fixed endpoint, 10-second timeout and 64 KiB response limit; redirects are rejected.",
      "Only use endpoints you are authorized to test. Write requests can change target data.",
      "Request headers are excluded from saved reports and exported tests.",
    ],
  };
}
