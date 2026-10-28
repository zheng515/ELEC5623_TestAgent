# Evaluation protocol and evidence boundaries

Status: protocol with a [completed scoped development study](../experiments/results/2026-10-28-v12/README.md).
This is not the academic report or an independent validation study. Previous old-version results were removed at the user's request on 2026-10-28. Policy v12 introduces request accounting and optional mutation
checks; no old score is carried forward as current evidence.

## Questions

1. Can raw model decisions distinguish unsupported tests, valid failures,
   conflicting requirements and environment blockers?
2. Do deterministic admission and state gates preserve original contracts when a
   model returns unsupported, incomplete or stale evidence?
3. Does additional diagnosis/mutation work improve an unchanged initial suite
   enough to justify its resources, and under what conditions?

These are different questions. Component classifications, whole-Agent admission,
mutation counts, user decisions and defect detection are not interchangeable.

## Independent component review

There are 16 development cases. They include semantic return types, value
contradictions, unsupported timezone/message assertions, valid exceptions,
invented imports, missing implementation dependencies, contradictory equality
clauses and an undefined threshold. No independent reference review has been
completed. The repository labels are explicitly unreviewed development drafts.

Prepare a separate reviewer pack without any model calls:

```sh
# Supply a new directory; the command refuses to overwrite one.
npm run evaluate:decisions -- prepare /tmp/reqtest-independent-review
```

The pack includes actual Docker outcomes, original artifacts, dataset/image hashes
and a blank reference template. It omits model predictions and draft labels.
Give this pack to a teammate who did not implement the decision logic. Review
before inspecting model outputs. Record requirement/file/trace evidence for each
label, discuss disagreements and retain the initial annotations. The tool cannot
verify that a named reviewer is independent; that is a team responsibility.

After review, save a separate complete reference.json with reviewed=true and the
reviewer name, retaining AI provenance if that file began as AI annotations.
Do not change inputs or silently correct results after observing outputs.

```sh
# Paid calls: 16 cases x 3 repeats, at most 48 requests, no automatic retries.
npm run evaluate:decisions -- 3 --reference /absolute/path/reference.json
# Re-score a frozen result without model calls.
npm run evaluate:decisions -- score .evidence/decision-evaluation/RUN
```

New decision studies seal the case data, parsed reference, task text and Agent
snapshot with hashes. Offline scoring rejects a changed sealed reference, changed
task text or missing/changed snapshot. Older studies are explicitly labelled
legacy_reference_not_sealed; re-scoring cannot retroactively establish their
original reference integrity. Hashes detect inconsistencies within recorded
artifacts; they are not externally signed timestamps or tamper-proof storage.

Later review must create a separate reference revision rather than overwrite the
baseline. The command below makes no model calls. It writes a new directory under
reference-revisions/ containing the revised labels, reason, changed labels, original
and revised reference hashes, exact attempts hash, metrics and disagreements.
The original reference and baseline metrics remain unchanged. Such revisions are
post-hoc analyses and must not be described as predeclared independent labels.

```sh
npm run evaluate:decisions -- score .evidence/decision-evaluation/RUN --reference /absolute/path/reviewed-reference.json --reason "Reviewer name, evidence checked and reason for revision"
```

The runner freezes sources, production task text, cases and references. Case
order rotates between repetitions; this does not remove API drift or caching.
Report completion, missing/invalid decisions, admission Precision/Recall/F1,
false-support rate, diagnosis confusion and Macro-F1. Accuracy metrics remain
unavailable until references are reviewed and all planned decisions are valid.
Unrepresented classes have unavailable F1 and are excluded with their count
reported. Multiple acceptable diagnosis labels support accuracy but prevent
single-label confusion/Macro-F1. These are raw decision metrics, not independently
verified whole-Agent repair safety or a population reliability estimate.

Each attempt retains elapsed time and provider-reported input/output/total tokens,
prompt byte count and prompt hash when returned. Resource summaries show attempted,
failed and missing requests, nearest-rank latency p50/p95, known token subtotals and usage
availability separately. Complete token totals require every planned request to
have reported that token field; unknown usage is never zero. No currency cost is
inferred. disagreements.json retains every reference disagreement or incomplete
case with raw attempts and reference rationale, without selectively rerunning it.

## Accepted AI development reference

The project owner accepted the 16 AI-assisted annotations as reference answers.
They retain source=ai_assisted, reviewed=false and independentHumanReviewed=false;
acceptedAsDevelopmentReference=true enables a separate referenceComparison.
This supports a model experiment without waiting for human labels, but measures
agreement with these labels rather than independent human accuracy.

```sh
# Starts a new paid component study; accepting a reference alone makes no calls.
npm run evaluate:decisions -- 3 --reference experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json
```

The export names the comparison basis and preserves original annotation provenance
and evidence. Its reference-relative agreement, admission Precision/Recall/F1 and
diagnosis confusion/Macro-F1 require all planned valid decisions. Root independent
accuracy fields stay unavailable until independent human review is recorded;
a reviewed flag change alone cannot override explicit pending human-review
metadata. Completed annotations are not model observations or an accuracy result.

## Whole-workflow and incremental value

The existing shared-initial runner generates B1 once, then supplies exactly the
same executable candidates to B3. It preserves IDs, source, requirements, model
and image and enforces a follow-up request limit. B1's direct-generator scaffolding
is not a verified behavior assessment. Prefix-inclusive B3 costs belong in the
comparison; counting only follow-up cost understates total resources.

Use `examples/experiments-budgeted.json` for a separately named v12 development
study. It requests requirement checks, three repeats and the same three existing
projects. Deleted earlier results cannot serve as a simultaneous or equal-budget control. To compare depth causally, predeclare both policies on the
same source/model/image and shared initial candidates in a new study. Do not infer
efficiency from historical cross-version timings or higher Verified counts.

For a controlled recovery challenge, freeze initial candidates that omit a stated
boundary, contain an invented import or add an unsupported assertion. Disclose
that these initial candidates are deliberately seeded, not naturally generated
failures. `tests/shared-initial-suite.test.ts`, `tests/requirement-coverage.test.ts`
and `tests/agent-safety.test.ts` exercise such control paths with scripted responses;
they do not establish real-model recovery rates. A new model study must keep
initial candidates identical across compared policies and retain all planned
observations, including budget failures. No recovery-success rate is claimed here.

Measure initial/final corrected-copy defect detection, preserved valid failures,
reference disagreements, admitted changes, wall time, provider tokens, request
counts and exhausted budgets. Investigate every changed valid failure and every
incorrect Verified state. Finite reference replays do not establish a general
false-positive rate; raw mutation counts do not establish semantic test coverage.

## Product contribution and human task evaluation

The contribution being evaluated is original-contract traceability and bounded
failure handling. It is not a new generation algorithm or established detection
advantage. A possible separate user task is choosing among investigating the
implementation, correcting a test, fixing the environment or clarifying a rule.
Predefine correct actions from independently reviewed artifacts, counterbalance
output order, record decision accuracy and time, and disclose participants and
small-sample limits. No user-study result exists until people perform those tasks.
