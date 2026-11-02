# Final production website acceptance

Observed 2 November 2026, Australia/Sydney, on source
`8489e139d3723aa85f0c94d6826996312e1b0b05` with a clean working tree.
This is additional engineering acceptance, **not** another observation in the
frozen v22 benchmark. Its 48 workflows and published resource totals are unchanged.

## Environment-enabled regression

`REQTEST_DOCKER_TEST=1 REQTEST_MAIL_TEST=1 npm test` completed with 220 top-level
tests, 229 tests including nested cases: **228 passed, 0 failed, 1 skipped**.
Docker, PostgreSQL and local Mailpit were available. The complete log is
`regression.log`; machine-readable counts are in `validation.json`.

The single skipped test is the separately gated real-model API integration test
(`REQTEST_PYTHON_LIVE_TEST`). It was not enabled to avoid a second paid workflow.
The browser acceptance below is separate evidence and is not counted as that test
passing. The earlier default result, 156 passed / 64 skipped / 0 failed, remains
a valid historical result under different execution gates. Nested cases account
for the additional test records; counts from separate groups must not be added.

## Fresh browser-to-model workflow

The production build and a real queue worker ran on loopback port 3002 in the
isolated `final_web_20261102` data namespace. A new synthetic test account registered
through the homepage, confirmed its signed email link using local Mailpit, then
signed in through the homepage dialog. No APIs were intercepted or model responses
scripted. The normal user installation and its data were not changed.

The browser uploaded the existing Inventory development fixture (`inventory.zip`)
and `SRS.txt`. Actual extraction populated the editable requirement field. Its
paragraph input is one original item containing five clauses; analysis recorded
six behaviours. The run used requirement checks without mutation, a 12-request
limit and a 180-second per-response timeout, as declared in `plan.json` before
submission. There was one paid attempt and no retry or replacement run.
The default Python sandbox image resolved to
`sha256:8850e6a9e39d3fcc0377544d2c408a33003ba52436e84d1dabce8d6f7e23b550`;
this differs from the real-project benchmark image and remains separately identified.

Run `9283bc96-3096-4b6a-8d54-d6b8e7cbdb1b` completed with:

- Five real `gpt-6-luna` requests, 26,803 provider-reported tokens, no unknown usage.
- Five admitted generated tests: four passed and the equality assertion failed.
  Both existing tests passed. Execution retained source integrity.
- One execution-phase `potential_implementation_defect` assessment for the equality
  assertion. The failed assertion remained; no improvement was applied. An
  attempted improvement was not admitted, as recorded in `stopReason`.
- Saved report, working requirement/artifact/execution/assessment views, evidence
  JSON export and generated-test ZIP export. All five exported test artifacts
  match the saved code byte-for-byte. The report remained available after reload.

Agent wall time was 34.871 seconds, excluding registration/upload and subsequent
inspection. This single timing is descriptive, not a performance estimate.
`web-checks.json` records actual stages and observations; `report.json` retains
the complete run. `exported-evidence.json` and `generated-tests.zip` are actual
UI downloads. Screenshots show the new run, not the older saved-suite replay.

## Interpretation and reproduction

This closes the missing fresh website-model integration path for one supported
case. It does not establish semantic accuracy, diagnosis F1, effective runtime
test-error repair, user time savings, real Gmail delivery or generalization.
The synthetic fixture is a development input already used elsewhere; this is not
an independent fault benchmark and must not be pooled with v22 effectiveness data.

To reproduce, start a production website and worker with a separate data namespace
and loopback port, using local Mailpit for the synthetic account. Register,
explicitly confirm its email, sign in, upload the retained SRS/ZIP and enter the
recorded policy in Verification options. Running verification makes new paid
model requests and need not reproduce the same generation or timing.

No credentials, cookies, signing secrets, storage state, verification tokens or
account database are included. `artifacts.sha256.json` identifies retained bytes;
the public fixture hashes in `validation.json` also confirm imported source was
unchanged after execution.
The isolated services were stopped and their test schema, account, source copies,
signing secret and captured local message were removed after export. The normal
website on port 3001 remained available.
