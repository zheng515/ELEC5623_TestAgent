# Current implementation status

Updated 2026-10-28. This file describes the current code and available validation,
not the academic report or a historical experiment-results archive.

## Implemented verification workflow

- Import focused Python or Node.js source from GitHub or ZIP, retain a frozen
  source identity, check dependencies and prepare a pinned sandbox image.
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

A 1–24 model-request limit covers all stages and worker recovery. Reservations
are persisted before dispatch; failed/interrupted attempts retain their slots,
and cached responses consume no additional request. Reports show known token
usage and unavailable usage separately. This is not a token or monetary ceiling.
Budget exhaustion retains partial evidence and cannot pass verification gates.

## Available validation

The most recent complete Docker regression passed 137 tests, with two optional
integration skips and no failures. Type checks, lint, English-source checks and
production build passed. A separate production UI check confirmed the depth
selector and default 12-request limit; its temporary account/server were removed.
These are engineering checks, not model-quality or independent semantic scores.

The decision-evaluation tool supports 16 development cases, independently reviewed
admission Precision/Recall/F1, diagnosis confusion and Macro-F1. The reviewer pack
contains actual Docker execution and a blank reference template. No independent
labels have been completed. The current policy has no model-quality evaluation
results; workflow preflight has run without model calls.

## Experiment cleanup

On 2026-10-28 the user requested deletion of previous experiments. Old-version
results, acceptance records, plots and matching private raw copies were removed.
Reusable source fixtures, requirements, references, provenance, manifests and
current unlabelled reviewer evidence remain. No old scores are carried forward.
A regression that depended on an archived report now constructs a minimal fixture
in the test, preserving the behavior check without retaining the old experiment.

See [experiment status](../experiments/README.md), [architecture](architecture.md),
[evaluation protocol](evaluation-protocol.md) and [positioning](product-positioning.md).
