# ReqTest HTTP

Local, single-user black-box functional tests for an existing HTTP API.

## Run

Use Node.js 22.22.2+. Fill OPENAI_API_KEY and optional REQTEST_LLM_MODEL
in .env (or .env.local) next to package.json.

    npm ci
    cp .env.example .env

Fill OPENAI_API_KEY in .env, then:

    npm run dev

Open http://127.0.0.1:3001. Enter the endpoint and method, then put one
requirement on each line. Include parameter names, units and response fields.
The model proposes cases and separately reviews their expectations before execution.
Unsupported cases are blocked. Missing/unclear requirements remain visible.
A passed conclusion covers only the executed cases, not exhaustive correctness.
Model generation/review uses two paid requests per run; there is no automatic retry.

## Example

In another terminal in this directory:

    npm run example

Use http://127.0.0.1:4100/shipping and the built-in HTTP preset.
The example is an actual HTTP service with a shipping-fee calculation.
It also exposes deliberately incorrect implementations at /shipping-bug
and /shipping-type-bug so exported tests can demonstrate failures.

## Results

After starting a run, the input form is hidden and the page shows progress, then a visual result summary.
Use Edit & rerun to change inputs; request headers remain in memory when the form is hidden.
Outcome counts filter the expected/observed comparison table. Requirement cards show incomplete checks.
Review/HTTP evidence and execution logs are expandable; generated code is available as a download.
Download verification.json, summary.md or test_api.mjs.
Run exported tests with Node:

    node --test test_api.mjs

TEST_ENDPOINT can override the saved endpoint. TEST_HEADERS can supply a JSON
object of request headers. Target headers are never saved or exported.
Select a run in History and use the trash icon to delete it, or Clear all to remove history; both ask for confirmation.
Stop cancels remaining work and keeps a cancelled history entry; sent requests cannot be undone.
Unsubmitted task fields and model are restored after refresh. Request headers stay in memory only.
Leaving during a run records it as interrupted, never passed.
Recent 30 runs are kept in this browser's IndexedDB; download files for durable retention.
Previous prototype/mock history is not loaded. Model keys stay on the server.

## Checks

    npm run typecheck
    npm run lint
    npm run build

One explicit real-model integration (the app must be running):

    REQTEST_LIVE_TEST=1 npm test

It exercises the public stream endpoint, actual model generation/review and a real
HTTP target. It also executes exported tests against the correct implementation,
wrong fee and wrong JSON type. Evidence is saved under ignored .evidence/.
No helper/model unit tests or mocked model/HTTP dependencies are used.

## Scope

Up to 12 input lines, 16 cases, JSON equality/status assertions, 10-second HTTP
timeouts, 64 KiB response evidence and no redirects. Compound requirements,
semantic completeness and independent model-review accuracy are not proven.
Use endpoints you own or are authorized to test; write methods can modify data.

Repeat only exported-test checks against the saved real report, without model calls:

    REQTEST_REPLAY_REPORT=.evidence/live-report.json npm test

This reuses recorded evidence; it is not a fresh model-quality measurement.

## UI

The typography and blue accent are inspired by https://www.uts.edu.au/. The header is white and the main workspace is black.
Controls in components/ui are copied from the official shadcn/ui new-york-v4 registry.
Confirmation uses the installed Radix Alert Dialog directly. Business views only compose these controls.
Global CSS contains Tailwind theme variables; no custom widget or scrollbar CSS is used.
