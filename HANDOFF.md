# ReqTest engineering handoff

Last updated: 2026-11-02 (Australia/Sydney).

## Current state

The owner authorized freezing v22, running the benchmark once and deleting old
experiments after completion. This task is complete through experiment execution,
analysis, byte-verified export and whole-study retirement. Read
`experiments/results/v22-summary/README.md` first.

- Branch: `integrate/version-2-on-main`.
- Assessed source commit: `bd12d236fe65009ba02655f48556b0b397e3f575`.
- Freeze tag: `v22-benchmark-freeze`.
- Policy: `contract-witness-v22-bounded-mutation-review`.
- Agent fingerprint: `a8aa7515772720ec0546031fc576601bf2797173fb233f7d854166b08863daf2`.
- Model alias: `gpt-6-luna`, official OpenAI API. Alias/API behavior may drift.
- Sandbox image: `sha256:b64182700c09f1552bc215dc2d3cfdb933893e46138391140ecc306e562928da`.
- Node: 22.23.2, matching `.nvmrc`.
- Plan: `experiments/v22-benchmark-plan.md`, declared before v22 paid observations.
- No Agent source or policy changed during these studies. Later result/document
  commits do not replace the assessed source revision.
- No push or merge to main was authorized or performed.

## Completed observations

| Study | Completed / planned | Limited assessments | Requests | Known tokens |
| --- | --- | ---: | ---: | ---: |
| Independent Click smoke | 4/4 | 2 | 25 | 1,507,751 |
| Three-project B0-B3 matrix, three repeats | 36/36 | 12 | 240 | 15,392,920 |
| Two synthetic faults, B0-B3, one repeat | 8/8 | 0 | 21 | 93,709 |

Actual total: 48 workflows, 286 requests, 16,994,380 known tokens; zero workflow
failures, missing rows or unknown-usage requests. Resource totals can be added;
effectiveness denominators must remain separate. No monetary cost is inferred.
Workflow completion is not a claim that every assertion passed or every
requirement was fully verified.

The real-project matrix uses pinned Click 8.1.7, Packaging 24.2 and Werkzeug 3.0.6,
with six developer/AI-assisted contracts per project and no injected source faults.
All 397 final generated nodes pass, and all 36 final reference replays are usable.
Each project/configuration has three distinct literal suite hashes across three
repeats. Full arms use more requests/tokens without a measured execution advantage.
There are zero diagnosis calls and zero initial admitted generated runtime failures
in that matrix. Five improvement actions are coverage/mutation work, not runtime
error repairs. More artifacts are not more verified requirements.

The synthetic supplement reuses existing Booking and Inventory source faults.
All four configurations detect both faults on original/corrected copies; all
final corrected-copy reference suites pass. B2 proposes unchanged approved tests
in both cases; the no-op guard stops before another review/execution, counting
zero improvements. B3 records two execution-phase potential-implementation-defect
judgments and retains the failures without repair. This demonstrates an explicit
decision trace, not extra B3 defect detection or independent diagnostic accuracy.

No admitted generated-test runtime-error opportunity appears across these studies.
Runtime repair effectiveness is unavailable. Independent semantic accuracy,
diagnosis F1, reviewed mutation strength, first-user usability, external-product
superiority and held-out generalization remain unavailable. Repeats share projects.
This model benchmark is Python-focused; Node/browser paths have engineering
regressions, not model-effectiveness evidence here. Gold labels remain unreviewed.

## Evidence and reproduction

Current study folders under `experiments/results/`:

- `v22-independent-smoke`: 25 exact frozen files in `evidence.zip`.
- `v22-real-project-matrix`: 163 exact frozen files in `evidence.zip`.
- `v22-fault-cases`: 46 exact frozen files in `evidence.zip`.
- `v22-summary`: separate-study accounting and critical analysis.
- `ui-workflow-2026-11-01`: preserved engineering browser acceptance, not a model
  study or independent usability study.

Each study retains identities, reports, requests, references, original logs,
JSON/CSV, checksums and post-run source fingerprints. Reanalysis from each archive
reproduces all six standard analysis outputs byte-for-byte with zero model calls.
Resource plots are descriptive and do not encode semantic accuracy.

Original v22 raw indexes remain locally under `.evidence/evaluation/`:

- Smoke: `2026-11-01T15-11-26-365Z-6e9e58a5/index.json`.
- Main: `2026-11-01T15-18-34-058Z-b70a46cf/index.json`.
- Faults: `2026-11-01T16-24-05-498Z-4a89e8d9/index.json`.

No benchmark process needs to be restarted. Rerunning a manifest creates new paid
observations. For offline inspection, unzip its archive to a fresh directory and
run `npm run experiment:analyze -- PATH/index.json OUTPUT`.

## Authorized old-experiment cleanup

`experiments/cleanup-v22.json` records whole v20/v21 model/tool studies, old raw
evaluation directories, their four unused dedicated manifests and the old smoke
log removed after all current archives were verified. Successes and failures were
removed together: 2,775 files / 50,745,987 bytes. They are excluded from current
metrics. Exported historical evidence is recoverable from Git revision `bd12d23`;
raw working copies were removed. `experiments/cleanup.json` records earlier
v16-v19 retirement. Do not cite retired studies as current effectiveness evidence.

Pinned inputs, licenses, regression fixtures, production UI acceptance,
application accounts/runs, credentials and backups were preserved. The recovery
fixture's parent archive hash remains recorded with its historical Git revision.
Do not remove dynamic entry scripts merely because a static unused-file tool
reports them unused.

## Product and architecture

ReqTest is a Track A requirement-to-test agent for focused Python and Node.js
projects. It accepts GitHub/ZIP sources and pasted or PDF/Word/text requirements;
extracts atomic behaviors and quality issues; generates and separately reviews
tests; executes admitted artifacts in Docker; diagnoses failures against original
requirements/source/test/execution evidence; permits one eligible reviewed
improvement; and optionally assesses selected mutations. Evaluation exposes the
requirement -> behavior -> test -> outcome -> scoped-state evidence chain.
Saved-suite replay makes no model calls and does not refresh diagnoses.

Next.js 16.4 / React 19 / TypeScript, PostgreSQL and pg-boss, Better Auth,
Nodemailer, official OpenAI API through AI SDK, structured outputs and immutable
source fingerprints. The product UI evaluates individual runs; comparisons stay
in offline artifacts. Read generated Next.js guidance in `node_modules/next/dist/docs/`
before changing framework code.

v22 gives both full arms a shared four-request/60-second mutation-review budget
inside the manifests' unchanged 32-request global cap. Four requests are reserved
before improvement. Terminal review is skipped after applied improvement when
mutation execution is incomplete. Unreviewed pairs remain unknown. Completed
checkpoint responses can be restored without redispatch at the limit. Normal
provider errors still fail. Incomplete states are refreshed conservatively, and
intact executed suites may be reference-replayed after failed optional assessment.
See `docs/mutation-review-budget.md` and `docs/architecture.md`.

## Validation and local setup

The assessed implementation passed `npm run quality:check`: typecheck, lint,
English-only check, 17-route production build; 220 tests, 156 passed, 64 environment-
gated skips, zero failures. Docker-enabled focused agent/policy/metric checks:
81 passed. Docker-enabled queue/evaluation checks: 20 passed, including killed-
worker recovery, checkpoint reuse and cancellation. These overlap the full suite;
skips are not passes. All three real-project and both synthetic fault references
passed no-model validation before the corresponding paid observations.

Node is installed at `~/.local/share/node-v22.23.2-darwin-arm64/bin`. This shell also
needs `/Applications/Docker.app/Contents/Resources/bin` on PATH. Shell startup files
were not changed. Follow `README.md` and `docs/local-production.md` for setup.
Configuration belongs in ignored `.env.local`; preserve signing secrets and tokens.
Never put credentials, cookies or database backups in source, evidence or chat.

## Next work and constraints

1. Review the current benchmark's trade-offs and raw failure/decision traces.
2. Write the academic report using measured current results and explicit limits.
   No academic report or team contribution names have been fabricated. The actual
   team must complete `docs/team-contributions.template.md`.
3. Use supported, pinned cases for presentation. Additional experiments need their
   own declared inputs/budgets and source identity; do not rerun until outcomes look
   favorable or pool changed policies as one study.
4. Modify frozen code only for a reproducible implementation defect. Freeze a new
   revision and keep its observations separate if that happens.

Repository content must remain English; conversation may be Chinese. Keep official
OpenAI, automatic requirement text population, collapsed advanced runtime settings,
the dark-blue visual system, `next build --webpack`, Tailwind PostCSS integration
and sequential test-file execution. Do not recreate `.env.example`, add Team
workspace/manual document-block selection, weaken valid failing assertions, promote
incomplete evidence, treat skips as passes, apply `npm audit fix --force`, push or
merge to main without explicit authorization.
