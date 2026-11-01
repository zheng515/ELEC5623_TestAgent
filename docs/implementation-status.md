# Current implementation status

Policy: `contract-witness-v22-bounded-mutation-review`.
This inventory describes code, not the academic report.
The [v22 review policy](mutation-review-budget.md) adds shared stage budgets,
limited-assurance reporting and independent reference replay after failed optional
assessment. The v22 studies are separately archived; old studies were retired as whole studies.

The default CLI implements independent B0-B3 workflows with recorded effective
capabilities. The frozen v22 studies are complete: 4 smoke + 36 repeated real-
project + 8 synthetic fault workflows. See the
[benchmark summary](../experiments/results/v22-summary/README.md).
All real-project final generated nodes pass, and every configuration detects both
synthetic faults. B3 provides grounded traces without additional fault detection.
The full profiles cost more on measured real-project contracts; limited mutation
assessment stays visible. No admitted generated runtime-error repair opportunity
or independent semantic accuracy is established. Retired v20/v21 studies are
excluded; reusable fixtures and deterministic regressions remain.

## Implemented

- Better Auth email verification uses expiring signed links and an explicit
  confirmation page. Configured mail requires verification by default, including
  protected-API checks for older unverified sessions. Sign-in supports anonymous
  resend. Nodemailer enforces encryption for real SMTP; deployment documentation
  covers Gmail STARTTLS and a connection/authentication check without sending mail.
  Local SMTP/PostgreSQL regressions and seven real browser checks passed. Real
  Gmail inbox delivery remains an administrator-configured acceptance step.
- GitHub/ZIP import, dependency preparation, focused Python and Node.js execution,
  PDF/Word/text provenance, requirement analysis and original-contract test review.
- Read-only source, disposable Docker/temporary services, Python Chromium page
  checks and failure screenshots, optional selected mutation assessment.
- Grounded failure diagnosis, one eligible reviewed improvement, retained original
  artifacts, conservative assurance gates and saved-suite replay.
- Unchanged approved improvement proposals stop before another review or test
  execution; their original artifacts and evidence remain active. Previously
  blocked proposals are still eligible for supported re-review. This prevents
  repeated identical code from being recorded as an applied improvement.
- Existing baseline platform skips no longer prevent otherwise eligible mutation
  checks. Exact skip identity is required; generated or new skips remain blocked.
  Missing mutation execution under a recorded policy cannot grant Verified.
  Mutation sandbox deadlines retain an explicitly incomplete attempt without
  discarding earlier test evidence or inventing mutant outcomes.
- Python mutation processing reads at most 200 cached outcomes before computing
  differences, with a ten-second reconstruction budget and the original source
  snapshot. Total discovered mutants, unavailable differences and incomplete
  attempts remain explicit. Large fallback scopes are not fully assessed by a
  bounded result and cannot earn full assurance.
- Unresolved static mutation mappings use coverage.py generated-test contexts
  instead of entire files. Existing function scopes are preserved. Remeasurement
  keeps initial candidates fixed and records newly executed, unassessed lines.
  Missing traces do not trigger a broad fallback. Website scope descriptions and
  conservative per-file assurance reflect the selected execution lines.
- PostgreSQL private reports, checkpoints, worker recovery, account isolation,
  cancellation, provider usage accounting and configurable response timeouts.
- Evaluation charts distinguish execution progress, test outcomes and strict
  assurance; chart categories open matching filters. A compact requirement evidence
  chain links the original item, mapped behaviors, admitted tests, executed outcomes
  and final state, and opens the complete saved trace. Evidence trails reject stale
  phases and ambiguous links, and do not refresh diagnoses during replay.
- Workspace tabs retain unsaved requirements and project setup in memory.
  Sign-out clears password and registration/recovery state, with visible failure
  handling. Real isolated-account browser acceptance covers uploads, public GitHub
  preflight, queue/Docker saved-suite replay, exact exports and account isolation.
  Responsive and large-result checks are recorded separately from model quality
  and independent human usability.
- Applied improvements expose per-artifact before/after outcomes and unchanged
  original/revised assertions. Added, blocked, skipped, pending and incomplete
  cases cannot count as recovered failures. Finding-specific next steps separate
  implementation investigation, test correction, environment recovery and
  requirement clarification. Retained-failure summaries reject replayed/duplicate
  diagnoses, interrupted executions and changed assertions.
- Whole-file context selection replaces the combined 200 KB context rejection.
  Requirement/path terms rank files; follow-up prioritizes mapped evidence and
  follows transitive static local imports.
  Original lines and all requirements/shared context remain. Omitted file hashes
  and per-request context/source bytes are retained; uninspected mappings or
  recorded transitive dependencies cannot
  earn strict Verified credit. Lexical ranking is not semantic retrieval proof.
- Incomplete behaviors can admit explicitly reviewed defined cases while retaining
  Uncertain status. Ambiguous/not_testable cases remain blocked.
- The CLI diagnosis ablation freezes one preparation for both B2/B3 arms. Identity,
  equal follow-up ceilings, alternating order and prefix-inclusive costs are checked.
- Controlled recovery metrics distinguish actual repairs, corrected-copy boundary
  detection, literal valid-failure preservation and detection loss.
- Python inspection records an exact structured node catalog instead of parsing
  a truncated console log. Full baselines run by test file; model context keeps a
  separately bounded 200-node / 24 KB selection with explicit omission counts.
- Supported binary fixtures retain exact bytes, sizes and hashes, remain outside
  model text, and participate in saved-source integrity checks. Legacy text-only
  fingerprints remain compatible.
- Installed pytest-timeout and pytest-xprocess plugins are explicitly loaded.
  Cache files stay outside the source tree. Subprocess paths and explicit static
  project name/version metadata work without invoking project build hooks.
- Large outcome lists and raw execution records render in pages of 100 while
  exports retain every recorded outcome. More than 40 failures in a phase leave
  additional model diagnoses explicitly Uncertain; they cannot authorize repair.
- Source, requirement, parameterized test-node and execution-log references use
  provider-safe IDs/line references and restore exact original evidence before
  validation. Log references stay bounded and do not imply semantic correctness.

## Validation and limits

See [current experiment and validation inventory](../experiments/README.md).
Engineering tests and intercepted-API browser checks are separate from actual
model observations. Deleted studies contribute no current scores. Retired
model studies and tool checks are excluded from current results; their exported
evidence is available through Git history recorded in the cleanup inventory.

The 16-case AI-assisted reference and original trace inputs are retained as
regression fixtures under `tests/fixtures/decision-reference*`. Old component
study results and review packs were deleted; no independent semantic accuracy
is claimed and no human review is planned. The project owner confirms the Track A
Business Proposal was approved and submitted. Team member contribution fields
remain for the team to complete; names and contributions are not fabricated.

Current supported scope excludes Jest/Vitest/nested Node suites and frontend
JavaScript mutation. Oversized individual source files remain explicitly
uninspected if they cannot fit the retrieval budget. Model limits and the queue's
24-hour expiry still apply; request and token usage are not monetary ceilings.

No academic report has been authored. Setup details are in the short root README,
[deployment guide](local-production.md) and [technical reference](usage-reference.md).
`npm run quality:check` reproduces static checks, regressions and the production
build; `npm run acceptance:local` checks configured production services and SMTP
authentication without sending mail.
