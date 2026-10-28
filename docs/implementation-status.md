# Current implementation status

Updated 2026-10-28. This file describes the current code and available validation,
not the academic report or a historical experiment-results archive.

## Implemented verification workflow

- Import focused Python or Node.js source from GitHub or ZIP, retain a frozen
  source identity, check dependencies and prepare a pinned sandbox image. A
  Python run directory lets a full-stack project be analyzed whole, including
  HTML/CSS/JS, while dependencies install and pytest runs in its server directory.
- Check page behavior with generated headless-Chromium browser tests against the
  project's own ASGI/WSGI application; failed browser tests keep a screenshot.
  Frontend JavaScript is exercised but not mutation-tested.
- Extract PDF/Word/text requirements with source locations, explicit extraction
  warnings and exact original citations. Supporting text is not automatically
  promoted into independently verified requirements.
- Analyze behavior, generate tests, review admission and original-contract suite
  coverage, execute approved artifacts and diagnose grounded failures.
- Allow one eligible reviewed improvement. Keep implementation files and justified
  failing assertions unchanged. Missing, stale or unsupported evidence cannot
  authorize verification or replacement.
- Store private reports and checkpoints in PostgreSQL. Recover interrupted queue
  jobs, reconnect progress, cancel owned tasks, replay saved suites without model
  calls and export tests/evidence. Recovery validates runtime and Agent identities.
- Support account isolation, GitHub connection, local production checks and
  offline backup/restore tools within their documented scope.

## Policy v12

The website defaults to requirement checks and offers optional mutation checks.
Both retain original-contract admission, coverage review, grounded diagnosis and
one eligible improvement. Without mutation assessment, passing checks remain
Partially Verified. Strict CI stays conservative.

An optional model-request limit covers all stages and worker recovery; without
one, interactive runs are unlimited and benchmarks keep a 12-request budget. Large
specifications are analyzed five requirements and six behaviors per request, so a
40-requirement specification needs roughly 40–60 requests. Reservations
are persisted before dispatch; failed/interrupted attempts retain their slots,
and cached responses consume no additional request. Reports show known token
usage and unavailable usage separately. This is not a token or monetary ceiling.
Budget exhaustion retains partial evidence and cannot pass verification gates.

## Available validation

The integrated main/version-2 Docker regression on 2026-10-28 passed 155 tests,
with two optional integration skips (live model and email delivery) and no failures.
A separate screenshot-route integration check passed ownership, authentication and
path validation against an isolated database. Type checks, lint, English-source
checks and the production build passed. No live model calls were made for this
merge. These are engineering checks, not model-quality or independent semantic
scores.

The decision-evaluation tool supports 16 development cases, independently reviewed
admission Precision/Recall/F1, diagnosis confusion and Macro-F1. The reviewer pack
contains actual Docker execution and a blank reference template. No independent
labels have been completed. The current development study completed 48 component
decisions and 18 B1/B3 workflows; all raw observations and frozen inputs are
exported under experiments/results/2026-10-28-v12.

The project owner has accepted the separate AI-assisted annotations as development
reference answers. The component scorer now exposes a clearly labelled
referenceComparison for agreement, reference-relative admission metrics and
diagnosis confusion/F1 once all planned model outputs exist. It preserves AI
authorship and exact evidence, keeps independent-human accuracy unavailable and
does not treat a reviewed flag alone as overriding pending human-review metadata.
The completed component run agreed with the AI reference on 47/48 decisions;
admission F1 was 0.947 and C03 contains the retained false-support observation.
Both B1 and B3 detected 6/6 seeded-fault observations on two distinct defects.
B3 added six grounded diagnoses, retained those failures and added no detections;
its prefix-inclusive token usage was 138,905 versus B1's 27,579. All nine pairs
preserved the shared initial suite. No accepted improvement was exercised.

New component studies hash references and task text, retain provider token usage
and latency, and export disagreements. Later label changes require a separate
justified reference revision; baseline labels and metrics are preserved. Legacy
studies without reference hashes are explicitly labelled. Resource plots include
the shared B1 prefix in B3 totals. Earlier targeted tooling validation passed 30 tests
with three optional Docker skips, plus a separate 12-test Docker component run.
The complete integration regression above now includes these evaluation-tool
changes.

The Evaluation dashboard now separates execution progress, recorded-check results,
mutation scope and strict verification states. Its screenshot regression displays
4/4 checked, three passed recorded checks and one investigation, while preserving
the original six passes, one failure and conservative assurance states. Missing,
skipped, erroneous or untrusted mapped checks do not complete progress. This update
passed 17 summary/policy tests with one optional Docker skip, typecheck, lint,
English-source checks and a new production build. Browser validation used a
read-only copy of the saved report with mocked API responses, covered desktop and
320/390-pixel layouts, state filtering and unfinished runs, and made no model calls.
The local production website and worker were restarted after confirming no active
verification jobs.


The integrated UI retains the four Evaluation sections (Overview, Requirements,
Findings and Evidence), charts and requirement matrix, while exposing main's
request budget, recorded-check progress, mutation scope and browser screenshots.
Project verification shows progress during execution and opens Evaluation for
results. Isolated browser checks covered filters, empty/interrupted evidence,
screenshots, cross-section links, parent comparison, downloads and 1440/768/390px
layouts with no browser errors or warnings. Form checks preserved large inputs,
Python run directories, optional unlimited request budgets and mutation selection.
These checks used intercepted API responses; actual browser execution and
screenshot access were covered separately by the Docker and route checks above.

## Experiment cleanup

On 2026-10-28 the user requested deletion of previous experiments. Old-version
results, acceptance records, plots and matching private raw copies were removed.
Reusable source fixtures, requirements, references, provenance, manifests and
current unlabelled reviewer evidence remain. No old scores are carried forward.
A regression that depended on an archived report now constructs a minimal fixture
in the test, preserving the behavior check without retaining the old experiment.

See [experiment status](../experiments/README.md), [architecture](architecture.md),
[evaluation protocol](evaluation-protocol.md) and [positioning](product-positioning.md).

## Limits removed for full specifications

Requirement text, input items, PDF pages, OCR pages, analyzed behaviors, generated
tests and model output tokens are not capped, and runs have no time limit beyond
pg-boss's 24-hour job expiry. Upload byte sizes, archive safety checks, project
size limits and per-command sandbox timeouts remain. Test execution time scales
with the selected suite (120 seconds plus 15 per test), and sandbox containers run
with an init process so closed browsers cannot exhaust the process limit.
