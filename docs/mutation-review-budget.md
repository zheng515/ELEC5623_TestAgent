# Bounded mutation review (v22)

Policy: `contract-witness-v22-bounded-mutation-review`.

The retained v21 independent Click smoke exhausted 32 workflow requests in both
full arms. Its 792/715 eligible mutant-behavior pairs required 50/45 review
requests after 10/8 earlier requests. Both mutation executions were incomplete.
Those observations remain unchanged under their original policy.

## Allocation and recovery

The independent manifests retain their 32-request global cap. Optional mutation
review has a separate `mutationReviewRequestLimit` (default 4) and
`mutationReviewTimeoutSeconds` (default 60), shared across initial guidance and
terminal review. Interactive runs still have no global request-count cap unless
configured. Before improvement, four remaining global requests are reserved for
core work; this does not guarantee every workflow fits the global deadline.

Failed and interrupted dispatches count against both relevant request ceilings.
Review time includes recorded request duration and elapsed interrupted dispatches.
A call receives the remaining review time, capped by a shorter model timeout.
An optional timeout is not retried later. Owner cancellation propagates; normal
provider errors still fail the run. Unknown token usage remains unknown, and
request limits are not monetary spending caps.

Completed checkpoint responses can be restored even after the dispatch budget is
consumed. Only an uncached stage checks whether another dispatch is permitted.
Review batches retain 16 explicit `(mutant, behavior)` pairs. Source locations
are visited in rounds before returning to more mutations at the same location.
This ordering allocates work; it cannot establish that unselected pairs are
irrelevant. Every mapped behavior still needs its own grounded decision.

## Terminal assessment and states

After an applied improvement, terminal review is skipped when mutation execution
is incomplete: it can neither authorize another improvement nor establish full
adequacy. Raw outcomes, earlier reviews and all unresolved pairs remain visible.

`report.mutationReview` records limits, actual requests/time, pair totals,
reviewed/pending pairs and the stopping reason. Its totals include all mapped
survivors returned by the tool, even those without available differences.
Eligible request-pair counts can therefore be smaller. Unreturned mutants remain
unassessed outside these counters. Complete review of returned pairs cannot
establish adequacy when tool execution is incomplete.

A bounded workflow can complete with limited mutation assurance. The website
labels this explicitly; unreviewed pairs are never defaulted to irrelevant.
Affected states stay partial or uncertain, including when reading stale saved
positive states. Core budget errors still fail the run. Incomplete runs recompute
their evidence links and mark behavior states uncertain before saving.

## Experiment reporting and reference replay

The runner distinguishes `completed`, `completed_with_limits` and
`completed_with_failures`, with planned/completed/failed/cancelled/missing and
limited counts in its index and log. Failed/missing workflows produce a nonzero
exit code. Analysis retains limited-review counts and pending pairs separately
from workflow completion, test execution and assurance.

A failed optional mutation assessment can still replay its saved suite when
every approved artifact has a unique, intact, non-interrupted recorded execution.
Cancelled runs, interrupted test execution and unexecuted artifacts are ineligible.
Replay checks the imported source fingerprint. It does not change failed status
or grant failed workflows fault-detection credit. Reference disagreement remains
execution evidence, not independent semantic accuracy.

## Validation boundaries

`tests/mutation-budget.test.ts` covers allocation, source-location ordering,
checkpoint recovery, B2/B3 limits, admission repair followed by incomplete
mutation execution, optional timeouts and provider-error propagation. Its Docker
paths use real test execution, scripted model responses and declared mutation
tool fixtures. They make no provider calls and do not measure model quality.

The v21 smoke archives and checksums remain unchanged. Current manifests declare
v22 limits; any paid study needs a new freeze and separate evidence. No v22 model
effectiveness, repeatability or measured cost reduction is established here.

Validation on 2026-11-02:

- `npm run quality:check`: type checking, lint, English-only checks and the
  17-route production build pass. Tests: 220 total, 156 passed, 64 environment-
  gated skips, zero failures. Skips are not passes.
- Docker-enabled focused agent/policy/mutation/metric regressions: 81 passed,
  zero failed or skipped. Docker-enabled queue/evaluation regressions: 20 passed,
  including killed-worker recovery, checkpoint reuse and cancellation. These
  overlap the full test suite and are not additional independent samples.
- The new default manifest passes `--validate-only` on Click, Packaging and
  Werkzeug, with zero provider requests. Agent fingerprint:
  `a8aa7515772720ec0546031fc576601bf2797173fb233f7d854166b08863daf2`.
- All 15 retained v21 artifacts and both archives' uncompressed contents still
  match their recorded SHA-256 checksums. No v21 result was replaced.

The 4-request/60-second allocation is an engineering default, not an empirically
optimal value. A new paid smoke remains necessary to observe v22 model behavior
before deciding whether the repeated matrix is appropriate.
