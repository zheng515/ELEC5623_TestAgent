import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { startFixture } from "./api-fixture.mjs";

test("real evidence, missing rule and reusable exported HTTP tests", {
  skip: process.env.REQTEST_LIVE_TEST !== "1" && !process.env.REQTEST_REPLAY_REPORT,
  timeout: 240000,
}, async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.close());
  let report, code;
  const artifacts = [];
  if (process.env.REQTEST_REPLAY_REPORT) {
    report = JSON.parse(await readFile(process.env.REQTEST_REPLAY_REPORT, "utf8"));
    code = await readFile(".evidence/test_api.mjs", "utf8");
  } else {
    const api = (process.env.APP_URL || "http://127.0.0.1:3001") + "/api/agent/stream";
    const base = new URL(api).origin;
    const signup = await fetch(base + "/api/auth/sign-up/email", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ name: "Integration test", email: randomUUID() + "@example.test", password: "Aa1" + randomUUID() }),
    });
    assert.equal(signup.status, 200, "Create a real local test account");
    const cookie = signup.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
    const config = await fetch(api, { headers: { Cookie: cookie } }).then((response) => response.json());
    assert.equal(config.configured, true);
    const response = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: new URL(api).origin, Cookie: cookie },
      body: JSON.stringify({
        title: "Real HTTP verification integration",
        endpoint: fixture.url + "/shipping",
        method: "GET",
        model: config.model,
        prompt: [
          "GET /shipping accepts query amount in integer cents. For amount >= 10000 it returns HTTP 200 and JSON fee = 0 cents.",
          "GET /shipping accepts query amount in integer cents. For 0 <= amount < 10000 it returns HTTP 200 and JSON fee = 1000 cents.",
          "The service must be user-friendly.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(220000),
    });
    assert.equal(response.status, 200);
    const stream = response.body.pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream());
    for await (const event of stream) {
      const data = JSON.parse(event.data);
      if (event.event === "error") throw new Error(data.message);
      if (event.event === "artifact") artifacts.push(data);
      if (event.event === "complete") report = data.report;
    }
  }
  assert.ok(report, "A real completion report is required");
  assert.ok(report.results.some((result) => result.status === "passed"));
  assert.ok(report.results.every((result) => !["failed", "error"].includes(result.status)));
  assert.ok(report.uncoveredRuleIds.includes("R3"));
  assert.equal(report.conclusion, "inconclusive");
  await mkdir(".evidence", { recursive: true });
  if (!process.env.REQTEST_REPLAY_REPORT) await writeFile(".evidence/live-report.json", JSON.stringify(report, null, 2));
  code ||= artifacts.find((artifact) => artifact.name === "test_api.mjs").content;
  await writeFile(".evidence/test_api.mjs", code);
  const run = promisify(execFile);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const execute = (endpoint) => run(process.execPath, ["--test", "--test-reporter=tap", ".evidence/test_api.mjs"], {
    env: { ...env, TEST_ENDPOINT: endpoint }, timeout: 60000,
  });
  const good = await execute(fixture.url + "/shipping");
  assert.match(good.stdout, /# pass [1-9]/);
  assert.ok(fixture.requests > 0, "The target must actually receive requests");
  for (const path of ["/shipping-bug", "/shipping-type-bug"]) {
    await assert.rejects(execute(fixture.url + path), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /# fail [1-9]/);
      return true;
    });
  }
  console.log(process.env.REQTEST_REPLAY_REPORT ? "Reusing recorded live evidence; no fresh model measurement." : report.summary);
  console.log("Real target, wrong fee and wrong JSON type checked; evidence saved.");
});
