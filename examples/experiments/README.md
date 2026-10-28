# Controlled project experiments

This directory contains reproducible experiment inputs, executable reference
witnesses and export instructions. It is separate from the website and does not
contain the final academic report.

## Protocol

These are reusable development inputs and runnable manifests. Previous
old-version outputs were deleted at the user's request on 2026-10-28; none is a
current result. See [current experiment status](../../experiments/README.md).

The current v12 plan is `examples/experiments-budgeted.json`: three development
projects, shared-initial B1/B3 pairs and three repeats (18 planned workflows).
Only reference preflight has completed; no model-backed workflow has started.
`examples/experiments-shared-initial.json` is the smaller one-repeat input, and
`examples/experiments-repeat.json` is an alternative B0/B3 configuration.
`examples/experiments.json` supplies a four-configuration study template. These
projects were used during development, not as a held-out industry sample.

| Project | Known condition | External reference check |
| --- | --- | --- |
| shipping | Correct implementation, weak existing test | Fixed value, boundary, type and exception checks pass |
| booking | Inclusive-threshold implementation fault | Contract check fails on original code and passes after the external threshold patch |
| inventory | Equal-stock code/test conflict and an ambiguous notification requirement | Defined stock/type checks fail on original code and pass after the external equality patch; notification semantics remain unscored |

The B0 direct generator, B1 retrieved-context generator, B2 loop without failure
diagnosis and B3 diagnosed loop use the same requirements, source archive, model and
immutable Docker image for each project. B2 still uses the common original-contract
review gates. It must not be described as an unrestricted agent that always accepts
an unsafe repair. No implementation code is patched inside the agent workspace.
B0/B1 use schema and original-quote checks but bypass model admission review;
their approved flag means eligible for baseline execution, not reviewed approval.
Thus B0/B3 differ in review as well as context, analysis and feedback. This is a
workflow comparison, not an isolated diagnosis ablation or equal-token comparison.

For the small shared-initial study template, use `examples/experiments-shared-initial.json`.
It runs B1 first for each case/repeat, then supplies those unchanged executable
candidates to B3. B3 enriches the same behavior/rule links, audits the candidates
and may make one targeted improvement; it does not regenerate the initial suite.
Review and gap metadata can change, and rejected candidates remain recorded.
This holds initial generation fixed but still bundles analysis, admission review
and feedback, so it does not isolate diagnosis alone. The website's normal
verification workflow is unchanged by this CLI-only experiment option.

The small manifest uses three development cases, one pair each and at most six
additional model requests per B3 continuation. Budget exhaustion retains a failed
workflow with partial evidence; it cannot earn verification. B1 prefix failures
remain in the denominator and never trigger a replacement initial generation.
`paired-comparison.json` verifies initial code identity and records prefix,
additional and end-to-end resources. Ordinary B3 rows count additional work only
in this mode; use the paired totals for comparisons. One repeat is not stability
evidence. Reference witnesses and correction patches remain outside model inputs.

```sh
npm run evaluate -- examples/experiments-shared-initial.json --validate-only
# Paid model calls; three initial requests plus at most eighteen follow-up requests.
npm run evaluate -- examples/experiments-shared-initial.json
```

Before any model request, every case's fixed contract witnesses run on separate original/corrected
copies, outside model context. Their hashes, source fingerprints and patch hashes
are retained. They validate only their explicitly listed checks. They do not prove
that the full requirement document was extracted or interpreted correctly.

The current runner uses the same SRS parser and supporting context as the website.
The runner saves the original manifest, input archives, production agent/dependency
source snapshot, image ID, per-stage reports, request errors, provider token usage,
wall time, corrected-copy probes and independent-review templates. Requests have no
automatic retries. The agent retains its one-correction and one-improvement limits.
Changed agent inputs stop further runs. Every planned run remains in denominators,
including missing, cancelled and failed runs. Re-scoring makes no model calls.
The final approved suite also replays on a separate reference copy, including
the no-fault case and suites with no original assertion failure. Remaining
assertion failures are reference disagreements for investigation, not independently
established false positives. Source snapshots, input archives and requirement text
are hash-checked during analysis. Original inputs are never patched in place.

## Commands

Requires the normal Node.js, Docker and sandbox setup in the root README.

```sh
# No model calls: validate original/corrected reference witnesses.
npm run evaluate -- examples/experiments-repeat.json --validate-only

# Start 18 new paid runs only when needed; configure OPENAI_API_KEY first.
npm run evaluate -- examples/experiments-repeat.json

# Optional four-configuration study; separate from the current plan.
# npm run experiment:run

# Use the index.json path printed by the runner.
npm run experiment:analyze -- .evidence/evaluation/<run>/index.json experiments/results/<run>

# Standalone publication figures; no website dependency.
python3 -m pip install matplotlib
python3 scripts/plot-experiment.py experiments/results/<run>
```

The exported directory contains metrics.json, runs.csv, variants.csv,
failure-cases.json, analysis-notes.json and PNG/SVG figures. Its evidence/ subdirectory contains only
this controlled experiment's reports, request measurements, input archives,
reference checks and source snapshot, so analysis can be reproduced after moving
the result directory. The original working directories remain in .evidence.
Review exports before sharing; account credentials, .env files and unrelated private
evidence are never selected by the exporter.

## Measurements

- Workflow completion and completed runs with usable passing/failing execution.
  Finding a real defect is a useful outcome; all tests passing is not the goal.
- Initial/final seeded-fault detection, reconstructed from the original failed
  generated node and its passing counterpart on an externally corrected copy.
  Reference witnesses and probe evidence must match the saved source and patch.
- Detection preservation among runs that initially detected a seeded fault. No
  initial detection means an unavailable rate, not perfect safety.
- End-to-end run latency, including failed runs, excluding external reference
  probes; provider-reported input/output/total tokens and request errors. Unknown
  token usage remains unavailable. Currency cost is not inferred.
- Paired raw mutation killed counts only when there are two actual complete
  measurements with identical scope, mutant IDs and diffs. A single attempt is not
  duplicated as an improvement pair. Raw counts are not a relevance/equivalence-
  reviewed mutation score.
- Retained failure diagnoses, blocked tests, final failing nodes and refinement
  history for case-level inspection.
- Generated-suite assertion failures on the witness-validated reference copy.
  Errors, skips, empty suites and missing replays remain unavailable. A witness
  set cannot prove that a reference satisfies every possible contract interpretation.
- Per-case approved-suite hashes and observations; a single pilot repeat explicitly
  leaves stability unassessed. Literal suite variation is not semantic inaccuracy.

Independent semantic accuracy, finding Precision/Recall/F1, diagnosis Macro-F1 and
reviewed mutation scores remain unavailable until references and outputs receive
human review. Existing review/scoring tools remain available via the benchmark
README; no human reviewer or review flag is manufactured by this experiment.

## Limits to state alongside figures

New runs rotate configurations within each case/repetition; project order remains fixed. API cache,
model-service variability and time drift are not controlled. Do not interpret
latency differences as a randomized causal result. Repetitions within a project
are correlated; three projects do not support general effectiveness claims or
population confidence intervals. Defect probes use two deliberately seeded faults.
No improvements, incomplete mutations and unavailable results must stay visible.
The model that proposes and reviews tests is the same configured model; this is
separate-call self-checking, not independent correctness validation. Figures show
recorded counts and distributions rather than an overall product-quality score.

The recorded model name is a provider alias, not a frozen set of model weights.
Pinning source and Docker inputs does not guarantee identical future API outputs.

## Budgeted verification policy (v12)

New runs accept a manifest `policy` with `mutationChecks` and
`modelRequestLimit` (1–24, default 12). CLI defaults retain mutation checks;
the website defaults to requirement checks. Admission and original-contract
coverage audits remain mandatory. Skipping mutation leaves passing cases partially
verified and must not be interpreted as an improvement in assurance.

`examples/experiments-budgeted.json` prepares a three-repeat shared-initial
B1/B3 development study with mutation checks disabled and six allowed follow-up
requests. Use `--validate-only` to check fixed witnesses without model calls.
No new model outcomes for this policy are claimed. Deleted old runs are not a simultaneous or equal-budget comparison. See
[the evaluation protocol](../../docs/evaluation-protocol.md) before paid execution.
