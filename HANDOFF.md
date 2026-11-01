# ReqTest Engineering Handoff

Last updated: 2026-11-02

This document is the starting point for an agent or developer with no prior
conversation context. Read it before changing code, experiments or claims.

## Current v22 implementation on 2026-11-02

The owner authorized the budget-policy modification after reviewing the v21
smoke failures. Current local code is now
`contract-witness-v22-bounded-mutation-review`, based on `b16b7ac` with uncommitted
changes. Read `docs/mutation-review-budget.md`. Do not present v21 observations
as v22 results or silently regenerate the retained study.

- B2/B3 share four mutation-review requests and 60 seconds across all review
  phases. Four global requests are reserved before improvement; the independent
  manifests retain the 32-request global cap.
- Terminal review is skipped after an applied improvement when mutation execution
  is incomplete. Every unreviewed pair remains unresolved; pair-specific judgment
  and conservative verification gates remain active.
- Report metadata, the website and offline analysis expose review limits and
  pending pairs. Bounded workflow completion is separate from full assurance.
- Checkpoint recovery restores completed reviews without new dispatches even at
  the review limit. Failed/interrupted requests remain counted. Optional timeout
  does not cause a later retry; normal provider errors still propagate.
- Failed optional assessment can replay an intact, already executed approved suite
  without changing failed workflow status. Interrupted execution and cancelled
  runs remain ineligible. Incomplete behavior states are refreshed conservatively.
- CLI indexes distinguish completed, limited and failed workflows; failed/missing
  rows produce nonzero exit status. Original v21 archives and checksums are unchanged.
- No new paid study has been started. Freeze and validate v22 separately before a
  new paid smoke or the 36-workflow matrix. Human review and model-effectiveness
  evidence remain unavailable.

Validation completed for this local v22 implementation:

- `npm run quality:check`: typecheck, lint, English checks and 17-route production
  build passed; 220 tests total, 156 passed, 64 environment-gated skips, zero failed.
- Docker-enabled focused agent/policy/mutation/metric checks: 81 passed, zero
  failed/skipped. Docker-enabled queue/evaluation checks: 20 passed, including
  killed-worker recovery and cancellation. These overlap the full suite.
- Default manifest `--validate-only` passed all three projects with zero provider
  calls. Raw preflight:
  `.evidence/evaluation/2026-11-01T14-58-56-878Z-9e9e69f7/index.json`.
  Agent fingerprint:
  `a8aa7515772720ec0546031fc576601bf2797173fb233f7d854166b08863daf2`.
- Logs: `tmp/v22-quality-check.log`, `tmp/v22-focused-tests.log`,
  `tmp/v22-queue-evaluation-tests.log` and `tmp/v22-preflight.log`.
- Retained v21 study: all 15 artifact hashes and both archives' uncompressed
  checksums still match. No fresh paid/model effectiveness evidence is claimed.

Next: freeze the reviewed v22 source revision, then run a separately authorized
v22 paid smoke before deciding on the 36-workflow matrix. Do not treat offline
regressions as evidence that every future model run will complete within budget.

## Historical v21 smoke continuation on 2026-11-02

At this point the product remained frozen at `b16b7ac`; no product code, policy, manifest or
credentials were changed. Read
`experiments/results/v21-independent-smoke-2026-11-02/README.md` before starting
another paid run.

- The full default manifest passed no-model validation. All pinned input files
  match their inventories, with no missing or extra files. Full original suites
  pass: Click 589 passed / 22 skipped; Packaging 26,921 passed; Werkzeug 913
  passed / 1 skipped. All source-integrity and complete-catalog checks pass.
- The unchanged independent four-workflow Click smoke was attempted once.
  B0/B1 completed with six passing generated tests each. B2/B3 retained 10/12
  passing admitted tests but failed at the 32-request limit in mutation review.
  Acceptance is **2/4 completed, 2 failed, 0 missing**, not a successful smoke.
- Both full arms correct admission-rejected type witnesses in one improvement
  action. No new test artifact is added. Zero admitted generated runtime failures
  and zero diagnosis requests mean runtime repair and diagnosis accuracy remain
  unavailable.
- Actual resources: **66 requests / 3,643,104 known tokens**, no provider request
  errors, no automatic retries and no unknown usage. The original failed rows
  and intermediate evidence are preserved, with post-run source fingerprints
  unchanged in all four directories.
- B2 requires 792 mutation-behavior pairs (50 review requests after 10 earlier
  requests); B3 requires 715 (45 after 8). Neither fits the unchanged cap of 32.
  Both mutation executions are timed out/incomplete. B2 leaves 440 pairs and B3
  leaves 331 pairs unreviewed. The exact arithmetic is reproducible offline.
- The runner index says `completed` and the shell exits zero because every row
  was processed. This must not be reported as all workflows passing.
- Source inventories, reference validation and complete original-suite records
  are in the byte-verified `preflight.zip`; frozen smoke reports, requests,
  references and Agent snapshot are in `evidence.zip`. Standard JSON/CSV analysis,
  `budget-analysis.json`, checksums and the original runner log accompany them.
- The complete 36-workflow matrix has **not** been started. Inspect the budget
  conflict before deciding to accept incomplete runs under the frozen protocol
  or introduce a separate policy. Any changed review allocation, batching,
  terminal handling or budget needs its own version and new evidence; do not
  silently change this study or pool its observations with a follow-up.
- Node 22.23.2, matching `.nvmrc`, was installed from the official archive with
  SHA-256 verification at `~/.local/share/node-v22.23.2-darwin-arm64`.
  For this shell, add its `bin` and
  `/Applications/Docker.app/Contents/Resources/bin` to the task's `PATH`.
  Shell startup files were not changed.

At the end of the v21 continuation, the next decision was the review-budget gate.
The owner subsequently authorized the v22 modification described above. The old
smoke is retained unchanged. Independent human review, usability evidence and
the academic report remain unavailable.

## Source of truth

- Repository: `https://github.com/zheng515/ELEC5623_TestAgent.git`
- Active branch: `integrate/version-2-on-main`
- Frozen code commit before this handoff: `b16b7ac`
- Commit title: `feat: strengthen traceability and quality gates`
- Current implementation policy: `contract-witness-v22-bounded-mutation-review`
- The branch was synchronized with its remote at the frozen commit. This handoff
  and the retained smoke evidence/documentation are local changes after the
  continuation, followed by authorized v22 code changes. `b16b7ac` identifies the
  retained v21 product, not the current uncommitted v22 implementation.
- Do not assume that `main`, `version-2` or an older experiment branch contains
  the current product. Inspect the graph before switching, merging or resetting.

## What the product is

ReqTest is a Track A requirement-to-test verification agent for focused Python
and Node.js projects. A user supplies a GitHub repository or ZIP and an SRS or
pasted requirements. The system then:

1. preserves original requirement text and document provenance;
2. inspects a bounded, recorded source snapshot;
3. extracts atomic testable behaviors and requirement-quality issues;
4. generates tests and performs a separate contract-grounded admission review;
5. executes approved tests in an isolated Docker sandbox;
6. diagnoses generated-test failures using exact requirement, source, test and
   execution evidence;
7. allows at most one reviewed improvement when policy permits it;
8. optionally uses mutation evidence to assess whether passing checks are strong
   enough; and
9. presents a trace from requirement to behavior, admitted test, execution
   outcome and conservative verification state.

The central contribution is not a new test-generation algorithm. It is an
inspectable original-contract trace plus a bounded policy for deciding whether a
generated failure should be corrected, retained as possible implementation
evidence, or left uncertain.

## Current user workflow

1. Register or sign in.
2. Connect a public/private GitHub repository or upload a ZIP.
3. Paste requirements or upload PDF, Word, Markdown or text. Extracted text is
   copied directly into the Requirements field; users do not select document
   lines or blocks.
4. Optionally open Advanced settings for runtime, dependency installation,
   temporary PostgreSQL/Redis services or a Python server directory.
5. Check project setup when needed, then start verification.
6. Review per-run Evaluation charts, requirement states, test outcomes, findings,
   decisions and the requirement evidence chain.
7. Download exact evidence or approved generated tests, clarify requirements, or
   replay the saved suite. Saved-suite replay makes no new model calls and does
   not refresh old diagnoses.

The website Evaluation page is for one project run. Cross-run experiments and
benchmarks remain offline and must not be added to the product UI.

## Technical architecture

- Next.js 16.4 App Router, React 19 and TypeScript.
- PostgreSQL persistence and `pg-boss` background verification jobs.
- Better Auth for accounts, sessions, password reset and signed email
  verification links.
- Nodemailer with Gmail SMTP/STARTTLS for real email delivery; Mailpit is
  available for local development.
- Official OpenAI API through the AI SDK. The current configuration is not
  OpenRouter. Never place credentials in source or chat.
- Docker sandbox for Python, Node.js and optional temporary test services.
- Structured Zod outputs, original-quote validation, source/execution references,
  request accounting, checkpoints and explicit stopping rules.
- PDF/Word/text extraction with source locations and explicit OCR limitations.

Read the generated Next.js guidance in `node_modules/next/dist/docs/` before
changing framework code. This repository uses a version with behavior that may
differ from prior Next.js knowledge.

## What is implemented

### Product and workflow

- Authentication, account isolation, password policy, reset and real signed email
  verification.
- GitHub/ZIP import, source snapshots and integrity fingerprints.
- Requirement upload/extraction without manual block selection.
- Python and Node.js inspection, test generation, review and Docker execution.
- Python browser checks with screenshots for failed page checks.
- Optional dependency installation and disposable PostgreSQL/Redis test services.
- Grounded failure diagnosis and one bounded, reviewed improvement.
- Optional mutation assessment with conservative handling of incomplete evidence.
- Cancellation, checkpoint recovery, worker health and saved-suite replay.
- Exact evidence and generated-test exports.
- Evaluation charts, filters, pagination, responsive layouts and a clickable
  requirement-to-behavior-to-test-to-outcome evidence chain.
- Production error and not-found recovery pages.

### Safety and evidence rules

- Source is read-only during test execution.
- Passing execution alone cannot create a `Verified` state.
- Missing, stale, changed, skipped, interrupted or unassessed evidence cannot be
  silently promoted.
- An incomplete requirement can admit only an explicitly defined focused case;
  the requirement remains uncertain.
- A valid failing assertion is retained when evidence suggests an implementation
  defect. The agent must not weaken the expected value to match current code.
- An unchanged approved improvement proposal stops before another review or
  execution and is not counted as an improvement.
- Mutation relevance is reviewed per `(mutant, behavior)` pair. Do not revert to
  one decision per mutant while later requiring a decision for every behavior;
  that older mismatch blocked all requirements in the bundled example.
- Bounded or incomplete mutation evidence cannot establish complete adequacy.

### Recent engineering work

Commit `b16b7ac` added or finalized:

- the requirement evidence chain;
- separate requirement, behavior, admission and execution counts;
- client-safe context-assurance logic without importing Node-only modules into
  the browser bundle;
- error and 404 recovery pages;
- responsive large-result checks;
- reproducible quality and acceptance commands;
- a concrete but deliberately limited differentiation case;
- official Tailwind PostCSS integration; and
- sequential test-file execution to prevent PostgreSQL integration fixtures from
  interfering with one another.

## Validation status at the frozen commit

`npm run quality:check` passed with:

- TypeScript: passed;
- ESLint: passed;
- English-only source check: 358 text files passed;
- tests: 211 total, 150 passed, 61 environment-gated skips, 0 failed; and
- production build: passed, with 17 routes generated.

Real browser acceptance already covers authentication, upload, public GitHub
preflight, queue/Docker saved-suite replay, exports, account isolation, responsive
layouts and large saved results. See
`experiments/results/ui-workflow-2026-11-01/README.md`.

The production dependency audit reports zero vulnerabilities. The development
ESLint tree currently reports moderate `minimatch` advisories. `npm audit fix
--force` proposes a breaking downgrade to ESLint 4 and must not be applied. Recheck
when compatible upstream releases are available.

## Where the work is currently blocked

There is no known code blocker for a product demonstration. The v22 budget fix
needs a separate experiment freeze. The v21 Click smoke exposed a mutation-review
budget gate before the full study; see the continuation above. Remaining blockers
are experimental completion, cost and external review rather than missing screens.

1. The current-policy independent B0/B1/B2/B3 matrix has not been run. It contains
   three projects, four configurations and three repeats: 36 paid workflows.
2. Independent semantic accuracy is unavailable. There is no completed human
   review of requirement understanding, diagnosis accuracy or test adequacy.
3. Independent first-user usability evidence is unavailable. Existing browser
   checks are engineering acceptance, not a user study.
4. B3 has not demonstrated higher defect detection than B2. Retained evidence
   shows a better grounded decision trace in one case, not superiority.
5. Natural generated-test error repair remains poorly measured because the
   retained Click observation generated six admitted tests that all passed.
6. The academic report and confirmed team-contribution table are not written.
7. The proposed five-project presentation benchmark has not been selected or run.

Do not solve these gaps by inventing labels, rerunning until only good outcomes
remain, or converting engineering regressions into model-accuracy claims.

## Experiment configurations

The proposal-aligned configurations are:

| ID | Configuration | Key difference |
| --- | --- | --- |
| B0 | Direct LLM | Requirements plus bounded implementation code; no existing tests, repository documents, analysis, diagnosis or refinement. |
| B1 | Grounded test generator | Adds repository evidence and documents; still direct generation without closed-loop refinement. |
| B2 | Full agent without diagnosis | Analysis, admission, execution, mutation guidance and one repair attempt, but no failure-cause classification. |
| B3 | Full verification agent | Same full workflow plus grounded diagnosis before deciding whether repair is eligible. |

All configurations share schema validation, source integrity, sandboxing and
request accounting. B3 is not expected to always find more defects. Its intended
measurable value is safer failure handling, better diagnosis and preservation of
valid failing assertions. Higher token cost without better outcomes is a valid
result and must remain visible.

## Existing experiment evidence

Start with `experiments/README.md`; it is the evidence index.

- The v20 B2/B3 pilot used old policy code, two synthetic cases and one repeat.
  It cannot be presented as current-policy comparative evidence.
- The v21 controlled recovery study shows both full arms correcting an
  admission-rejected bad import, but its initial candidates were blocked before
  runtime diagnosis.
- The v21 type-complete follow-up admits a boundary test; B2 and B3 both retain
  it, while B3 records grounded diagnosis evidence. This is a decision-trace
  example, not a detection advantage.
- The natural Click observation produced six admitted tests and no qualifying
  runtime failure, so repair effectiveness is unavailable.
- The retained mutation-scope result is a tool-only check, not a model benchmark.
- Retired v16-v19 studies were deleted as whole studies and must not be cited.

The current full manifest is `examples/experiments-baselines.json`. Validate it
without model calls before spending money:

```sh
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- \
  examples/experiments-baselines.json --validate-only
```

Use `examples/experiments-smoke.json` for a four-workflow paid smoke test before
starting the 36-workflow matrix. Do not call a smoke test a stability study.

## What to do next

Follow this order. Do not keep changing the frozen product without evidence.
Steps 1-5 were attempted under v21: preparation and no-model checks passed, but
smoke acceptance failed in both full arms. The owner authorized the v22 budget
fix. Complete its separate validation/freeze and paid smoke before step 6; do not
silently replace the old study or mix policies.

1. **Read the protocol and evidence index.** Review
   `docs/evaluation-protocol.md`, `docs/baseline-configurations.md` and
   `experiments/README.md`.
2. **Confirm the frozen revision.** `b16b7ac` identifies the retained v21 study.
   For v22, record a new reviewed/frozen revision, model identity, sandbox image
   digest, source commit, SRS hash and the updated manifest hash.
3. **Prepare pinned real projects.** Follow `examples/real-projects/README.md` and
   build `reqtest-real-projects:2`.
4. **Validate without model calls.** Run the default manifest with
   `--validate-only`.
5. **Run the four-workflow smoke manifest.** Confirm credentials, budgets,
   execution and exports before the full paid study.
6. **Run the 36-workflow B0-B3 matrix once the experiment is approved.** Preserve
   every planned success, failure, timeout, missing row and unknown token count.
7. **Analyze, do not cherry-pick.** Compare defect detection, false assertions,
   retained valid failures, incorrect repairs, diagnosis quality where references
   exist, repeat stability, latency, requests and token usage.
8. **Modify code only if the experiment reveals a reproducible implementation
   defect.** If code changes, create a new policy/version and do not pool old and
   new observations as one study.
9. **Select and run approximately five presentation benchmarks only after the
   controlled experiment is stable.** Benchmarks should cover different supported
   project shapes and remain separate from the product website.
10. **Write the report last.** Clearly separate engineering validation, AI-assisted
    references, human-reviewed metrics and unavailable measures.

## Suggested five-project benchmark design

Do not choose five arbitrary repositories. Select pinned, license-compatible,
small-to-medium projects that fit the supported Python/Node scope and collectively
exercise different risks:

1. pure Python business logic with explicit boundaries;
2. Python package behavior with existing pytest tests;
3. a small Python HTTP/UI project for page checks;
4. pure Node.js logic using `node:test`; and
5. a project requiring dependencies or a temporary PostgreSQL/Redis service.

Each benchmark needs a pinned source commit, independently written SRS, known
fault or accepted expected behavior, fixed configuration, run budget and an
explicit reason for inclusion. Five repositories alone do not create a benchmark;
the reference outcomes and scoring procedure are essential.

## Local setup and commands

Required: Node.js 22.22.2 or newer, Docker and PostgreSQL.

```sh
npm ci
npm run db:up
npm run db:migrate
npm run sandbox:build
npm run dev:all
```

Open `http://127.0.0.1:3001`.

Required local variables belong in ignored `.env.local`, not source control:

```dotenv
DATABASE_URL=postgresql://...
OPENAI_API_KEY=...
BETTER_AUTH_URL=http://127.0.0.1:3001
```

Optional real Gmail delivery also requires SMTP configuration documented in
`docs/local-production.md`. Use a Google application password, never the account
login password. Do not print or copy secrets into logs, commits or chat.

Important checks:

```sh
npm run quality:check
npm audit --omit=dev
```

With the database, Docker sandbox and SMTP credentials intentionally configured:

```sh
npm run acceptance:local
npm run acceptance:full
```

The shell used during the last engineering session did not expose `node` and
`npm` on its default `PATH`; a temporary Node distribution was used. A new agent
should install/select the required Node version normally and must not depend on
that temporary path.

## Important files

| Area | Files |
| --- | --- |
| Product entry and workflow | `app/`, `components/shell/`, `README.md` |
| Agent orchestration | `lib/python-agent.ts`, `lib/agent-variants.ts` |
| Model/provider boundary | `lib/model.ts` |
| Requirement and evidence state | `lib/requirement-input.ts`, `lib/requirement-coverage.ts`, `lib/run-evaluation.ts`, `lib/finding-evidence.ts` |
| Context selection | `lib/project-context.ts`, `lib/context-assurance.ts`, `lib/test-context.ts` |
| Sandbox/tool execution | `lib/python-tools.ts`, `lib/runtime.ts`, `sandbox/` |
| Mutation review | `lib/mutation-review.ts`, `lib/verification-policy.ts` |
| Authentication and mail | `lib/auth.ts`, `lib/mail.ts`, `docs/local-production.md` |
| Queue and recovery | `lib/run-queue.ts`, `scripts/worker.ts`, `tests/run-queue.test.ts` |
| Experiment runner | `scripts/evaluate.ts`, `scripts/analyze-experiment.ts`, `examples/experiments-*.json` |
| Experiment truth index | `experiments/README.md` |
| Evaluation protocol | `docs/evaluation-protocol.md`, `docs/baseline-configurations.md` |
| Product positioning | `docs/product-positioning.md` |
| Current capability inventory | `docs/implementation-status.md` |

## Traps to avoid

1. **Do not write Chinese in source, UI or project documentation.** Conversation
   with the project owner may be Chinese; repository content must be English.
2. **Do not commit `.env.local`, keys, SMTP credentials, cookies or database
   backups.** Preserve existing local configuration instead of overwriting it.
3. **Do not switch back to OpenRouter.** The selected provider is the official
   OpenAI API unless the owner explicitly changes that decision.
4. **Do not recreate `.env.example`.** Configuration is documented in the README
   and deployment guide; the owner explicitly requested its removal.
5. **Do not add Team workspace.** It was judged unnecessary and removed. HTTP
   checks remain useful. Model/connection settings belong in Settings; sandbox,
   dependencies and services stay collapsed under Advanced settings.
6. **Do not reintroduce manual document block selection.** Uploaded text should
   populate Requirements automatically while source details remain inspectable.
7. **Do not put benchmark comparisons in the website.** The website evaluates one
   run; benchmark analysis is an offline experiment/presentation artifact.
8. **Do not claim that citations prove correctness.** They prove provenance.
9. **Do not claim that generated test count equals verified requirement count.**
   Admission, execution and assurance are separate.
10. **Do not claim B3 superiority from the retained pilot.** It showed traceable
    diagnosis, not additional defect detection.
11. **Do not hide failed, timed-out, missing or expensive runs.** They remain in
    experimental denominators and critical analysis.
12. **Do not mix policies or source revisions in one score.** A code change after
    an experiment creates a new version requiring new evidence.
13. **Do not delete files only because `knip` reports them unused.** The following
    are dynamic entry points:
    - `sandbox/node-reporter.mjs`;
    - `sandbox/node-worker.cjs`;
    - `scripts/check-mutation-runtime.ts`;
    - `scripts/preflight-real-projects.ts`; and
    - `tests/fixtures/queue-worker.ts`.
14. **Do not remove `@tailwindcss/turbopack` as unused.** It is referenced by
    `next.config.ts`. Keep `postcss.config.mjs`; otherwise the Webpack production
    build can compile without the expected Tailwind styles.
15. **Do not remove `--test-concurrency=1` without redesigning integration-test
    isolation.** Concurrent files caused PostgreSQL schema initialization races.
16. **Do not replace `next build --webpack` casually.** Turbopack build failed in
    the last local environment, while the documented Webpack path and PostCSS
    integration passed production and responsive acceptance.
17. **Do not treat skipped Docker tests as passes.** Run the full acceptance command
    in an intentionally configured environment before a release/demo freeze.
18. **Do not automatically run `npm audit fix --force`.** It currently proposes a
    breaking ESLint downgrade.
19. **Do not weaken the dark blue visual system or reintroduce green as the primary
    product color.** Status warnings/errors may use semantic accent colors.
20. **Do not merge or push to `main` unless explicitly requested.** Work currently
    belongs on `integrate/version-2-on-main`.

## Definition of the next milestone

The next milestone is complete when the frozen current-policy manifest has:

- passed no-model validation;
- completed the approved smoke run;
- completed all planned B0-B3 rows or explicitly retained every missing/failed
  row;
- produced reproducible aggregate metrics with source/model/image identities;
- separated objective execution metrics from unreviewed semantic judgments; and
- documented failures, cost and cases where B3 provides no advantage.

Only after that milestone should the team finalize the five presentation
benchmarks and write the academic report.
