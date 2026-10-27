# Repeated workflow experiment

Completed on 2026-10-27 (Australia/Sydney). Three development projects, two bundled
configurations and three repetitions produced 18 completed runs. This directory
contains experiment artifacts, not the academic report or five-project benchmark.

## Frozen execution

- Git commit: `644b77fc2cd9a661d803b79133f1623c9b19fae2`; clean worktree at start.
- Model: `gpt-6-luna`, official OpenAI Responses API; source policy v8.
- Manifest: `evidence/manifest.json`; agent/dependency snapshot and immutable Docker
  image ID are retained with the inputs and per-request usage records.
- The manifest rotates configuration order within each case and repetition.
  Case order is fixed; provider weights, time drift and caching are not controlled.
- B0 performs direct generation with structural/original-quote checks. B3 adds
  analysis, retrieval, model admission review and execution feedback. This is a
  bundled workflow comparison with unequal request budgets.

## Recorded measurements

| Observation | B0 | B3 |
| --- | --- | --- |
| Completed with usable execution | 9/9 | 9/9 |
| Seeded-fault observations detected | 6/6 | 6/6 |
| Generated-suite reference replays with assertion failures | 0/9 | 0/9 |
| Executed generated checks: passed / failed / errors | 34 / 6 / 0 | 54 / 6 / 0 |
| Model requests | 9 | 36 |
| Provider-reported total tokens | 26264 | 137281 |
| Median workflow duration, seconds | 10.229 | 34.760 |
| Accepted improvements | 0 | 0 |

Each configuration detected the Booking threshold and Inventory equal-stock fault
in all three repetitions. Generated failures passed on the separately corrected
copies. Shipping has no seeded fault. All 18 final generated suites passed on the
reference copies; this finite witness validation does not establish zero false
positives generally or complete SRS coverage. Existing tests are excluded from the
generated-check counts above. Baseline eligibility is not model-reviewed approval.

B3 used about 5.23 times the tokens and 3.40 times the median duration. Both
configurations had identical detection on these cases. More generated passing
checks do not establish superior coverage. No refinement occurred, so this study
does not measure successful repair or its incremental benefit.

## Observed variation and workflow evidence

For each project/configuration, all three generated-suite hashes differ. Literal
test code therefore varies even though observed fault detection and reference
replay outcomes are stable across these three repetitions. This is not a guarantee
of future stability.

B3 retained six failed checks with potential-implementation-defect diagnoses.
It left the vague inventory notification rule unresolved in each repetition;
the issue label varied between incomplete and not_testable. These are recorded
model decisions, not independently scored semantic or diagnosis accuracy.
No proposal was blocked and no test improvement was applied in this dataset.

## Inspect and reproduce

- `metrics.json`, `runs.csv`, `variants.csv`: objective counts and denominators.
- `failure-cases.json`, `workflow-evidence.json`: failed checks and Agent decisions.
- `figures/`: seven standalone PNG/SVG figure pairs, including case-level results,
  generated test outcomes, reference replays and token/latency distributions.
- `evidence/`: original inputs, references, source snapshot, 18 reports and request
  usage. Fixed labels, witnesses and patches were kept outside model context.
- `execution-provenance.json`, `integrity-checks.json`, `artifact-hashes.json`:
  frozen version, offline verification and artifact integrity.

```sh
# Recompute measurements only; no model requests.
npm run experiment:analyze -- experiments/results/2026-10-27-repeated-workflow/evidence/index.json /tmp/reqtest-repeated-rescore
python3 scripts/plot-experiment.py /tmp/reqtest-repeated-rescore
```

The exported evidence re-scores identically. The frozen agent snapshot matches
the executed source, all 18 reference replays are usable, and the export scan found
no exact matches to configured secrets. Review templates retain reviewed=false.
Semantic accuracy, diagnosis F1 and relevance-adjusted mutation scores remain
unavailable without independent review. The two deliberately seeded faults and
three development projects do not establish industry-wide performance.

The next step is to freeze five independently selected benchmark cases with
requirements and executable reference witnesses before collecting their outputs.
Include a balanced range of normal cases, defects, ambiguity and setup conditions;
do not select cases after seeing which configuration wins. Benchmark scope and
model-call volume should be specified separately. This experiment does not compare
the product directly with Codex or Claude, and its results should not be pooled
with the earlier six-run pilot from a different source version.
