# Pilot evaluation

This is a small synthetic development benchmark, not a held-out study or proof of
product quality. The reference labels were prepared during implementation and are
deliberately marked `reviewed: false`. A teammate must independently verify and
correct them before they can be used as ground truth. Use additional held-out
projects and repeated runs for the final evaluation.

| Case | Purpose |
| --- | --- |
| shipping | Correct implementation; weak existing tests; mutation feedback |
| booking | Inclusive-boundary implementation fault; passing nominal test |
| inventory | Ambiguous notification requirement; code/test conflict at equal stock |

## Run

Start Docker, build `reqtest-python:1`, and configure the root `.env.local`. Then:

```sh
npm run evaluate -- examples/evaluation.json
```

This explicitly makes paid model calls. Default: 3 cases, B0–B3, one repetition,
no automatic model retries. Each invocation creates a new directory under
`.evidence/evaluation/`; it preserves reports, frozen source copies, test artifacts,
reference-probe results and output-review templates. The final log prints the
`index.json` path. Ctrl-C cancels the active run and retains partial evidence.

The runner pins the Docker image ID and records the agent source fingerprint. All
variants receive the same project snapshot, requirements and model for a case. B0 receives requirements
and Python context; B1 also receives documentation. B2 includes analysis, execution
feedback and repair selection without failure diagnosis. The same original-contract
admission gates still apply; unsupported replacements remain blocked. B3 requires failure diagnosis
before repair. Existing tests are measured for reporting in every variant, but
B0/B1 generation receives no execution feedback. Their behavior IDs are scaffolding;
they are not credited as gap-detection findings or semantic verification claims.

Reference files and correction patches are outside each model-visible project
directory. They are never included in model requests. A reference probe runs a
failing generated test against a separately corrected disposable project copy.
A generated assertion that fails on the original and passes on the corrected copy
records a seeded-fault detection. The original project is never patched. Detection
is checked before and after refinement so a weakened test cannot retain detection
credit. Missing/invalid probes produce `null`, not a perfect or silently reduced rate.

## Independent review

Review the **copied** `*.gold.json` files in the output directory. Correct their
reference behaviors, initial gaps, issues, conflicts and fault patches; enter the
reviewer's name and set `reviewed: true` only when finished. Do not use model
outputs as the source of reference labels. Corrections to patches or source require
a new benchmark run; do not relabel an old fault probe as a different fault.

Benchmarks and independent annotations are an offline CLI/file workflow. The
website Evaluation page only summarizes individual project verification runs; it
does not upload reference labels, annotate benchmark outputs or run benchmarks.

For every run, edit its `review.json` in a JSON editor:

- `issues`, `gaps`, `inconsistencies`: match each actual finding to a reference ID,
  or leave `match: null` for a false positive. Set `evidenceSupported` independently.
  Gap IDs use `B1:0` for the first gap of behavior B1. Conflict IDs use C1, C2, etc.
  Do not remove findings to hide false positives; duplicate matches count as extras.
- `coverage`: link every reference behavior to the executed test node IDs that
  adequately check it before/after refinement. Empty arrays mean uncovered. A passing
  import, weak assertion or nominal case does not establish a boundary or exception.
- `diagnoses`: assign the actual cause of each collection, baseline and initial execution failure. Judge the original
  contract, test, source and log; do not copy the agent's diagnosis as its own label.
  The `phase` field separates failures with the same test ID in different stages.
  Older annotations without a phase refer to the initial execution stage.
- `mutants`: review relevance and equivalence for every measured mutant, separately
  for each zero-based attempt. Tool survival alone does not establish equivalence.
  Leave a field null if the evidence is insufficient; this blocks mutation scoring
  without blocking independently completed annotations for other metrics.
- `validOutcome`: decide whether the completed run reached a supported verification
  outcome. A justified escalation can be valid; a successful script exit alone is
  insufficient. Name the reviewer and set `reviewed: true` only after all fields
  have been checked. Prefer a reviewer who did not implement the agent; conceal
  variant names during matching where practical and record this study limitation.

```sh
npm run score -- .evidence/evaluation/<run-directory>/index.json
```

This writes `metrics.json` and `summary.md` beside the index. It makes no model calls.
Pending reviews remain visible and have no semantic/accuracy score. The scorer
rejects invented test nodes, missing findings, invalid reference IDs and incomplete
diagnosis annotations. Unreviewed or missing mutant differences leave mutation
scores unavailable; rebuild the sandbox after worker changes to retain differences
for killed as well as surviving mutants.

## Metrics and denominators

- Issue/conflict/gap Precision, Recall and F1 use independently matched findings.
- Semantic coverage uses **all reference behaviors**, including behaviors omitted by
  the agent. A reviewer supplies adequate test links; only passed, recorded checks
  with intact, non-timeout evidence receive credit. Failed runs receive no final
  coverage credit. The before/after delta measures refinement, not the initial
  generation benefit relative to existing tests.
- Diagnosis Macro-F1 evaluates collection, baseline and initial execution labels. Incorrect repair rate counts
  changed/removed generated tests whose independently labelled failure was not a
  generated-test error in the initial execution stage. Baseline/collection failures
  do not dilute this repair denominator. Missing diagnoses are unresolved predictions.
- Mutation score is killed / relevant non-equivalent mutants. Incomplete measurement,
  unknown outcomes or unavailable review leave the score null. Before and after
  refer to the first and last mutation attempts; a single attempt has zero change.
- Seeded-fault detection uses the reference probes; these are provisional while
  reference patches remain unreviewed. They do not establish general fault detection.
- Completion rate measures workflow termination without error. Valid-outcome rate
  additionally requires independent review. Finding evidence-support and unsupported
  finding rates cover reviewed findings/diagnoses, not every internal agent decision.
- Unresolved-run rate counts reviewed runs with failures, uncertainty, reported
  issues/conflicts or uncovered reference behaviors. It is separate from valid
  outcome: a correctly escalated unresolved case can still be a valid outcome.

Zero or missing denominators produce `null`. This pilot does not yet cover all
failure classes, medium-sized projects, cost/latency distributions or user studies.

## Repeated review and diagnosis decisions

```sh
npm run evaluate:decisions -- 3
npm run evaluate:decisions -- score .evidence/decision-evaluation/<directory>
```

The first command makes 48 paid model calls: sixteen small development cases, three
identical-input repetitions each, without retries. It uses the production review
and diagnosis tasks and reasoning function. The second command only re-scores saved
evidence and needs no API key. It does not execute the complete verification agent.

Inputs contain requirements, source, proposed tests and synthetic trace summaries.
Docker regression verifies the snippets reproduce their stated pass/fail/import-error
scenarios. Cases use neutral IDs. Draft reference labels are stored separately and
never sent to the model. Frozen inputs, task text, raw responses/errors, latency,
agent/dependency fingerprint and per-input hashes are retained in each output directory.
Failures and missing repetitions remain in consistency denominators; invalid IDs,
quotes or response shapes are not silently counted as blocked tests.

Unanimity measures classification agreement, not correctness or equivalence of
explanations. A model can consistently support an invalid test. Accuracy, diagnosis
accuracy and false-support rate remain null while copied reference.json is unreviewed
or any repeat is missing/invalid. Independently check every draft label, enter the
reviewer name and set reviewed=true before re-scoring. More than one diagnosis label
may be defensible when the source contract is ambiguous; record the accepted set
rather than inventing a unique cause. Predictions must not become their own labels.

This is a focused component check of raw model classification, not a measurement of
the complete Agent's admission gates, repair safety or held-out accuracy. Use new
independently authored cases and freeze them before tuning for a held-out study.

The original C01 and C03 value-only tests do not establish their assigned return-type
claims; current draft labels mark these proposals blocked. C10 and C11 are positive
controls with separate semantic-type and value assertions. Docker tests show that
wrong-type outputs can pass the older equality-only tests and fail the positive
controls. C08 now uses the documented precedence: an invented exact expectation in
a generated test is a test-generation error, while the vague requirement remains
context requiring clarification. These are revised development labels, not independent
review. Earlier evidence retains its copied input cases, task text and draft labels.
Compare unchanged overlapping input hashes when dataset versions differ; do not
compare the sixteen-case aggregate directly with earlier eleven- or nine-case aggregates.

## Independent review pack and current policy

Run `npm run evaluate:decisions -- prepare /tmp/reqtest-independent-review` before
viewing predictions. It executes the 16 candidate snippets in Docker and exports
actual outcomes, original artifacts and a blank reference template. No model calls,
model predictions or draft reference answers are included. Complete the template
independently, record evidence and a reviewer name, then use the completed file
with `npm run evaluate:decisions -- 3 --reference /absolute/path/reference.json`.
The software cannot establish reviewer independence. Review is still pending.

Admission Precision/Recall/F1, diagnosis confusion and Macro-F1 require complete
reviewed references and all planned valid decisions. A class absent from both
reference and predictions has unavailable F1 and is excluded with a reported
class count. Set-valued diagnosis references prevent single-label Macro-F1 while
retaining acceptable-label accuracy. Classification remains separate from actual
Agent admission/grounding and complete workflow outcomes.

Policy v12 adds a request budget and optional mutation depth. Use
[the evaluation protocol](../../docs/evaluation-protocol.md) for current boundaries.
C12–C16 add supported/unsupported exception assertions, a generated bad import,
contradictory equality clauses and an undefined threshold. Their labels are
unreviewed development drafts, not human ground truth.
