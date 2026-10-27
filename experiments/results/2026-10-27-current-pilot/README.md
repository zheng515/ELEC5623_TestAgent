# Current-source six-run pilot

Date: 2026-10-27. This is an automatic development pilot, not a final report,
independent semantic evaluation, repeated reliability study or competitor benchmark.
This frozen run predates subsequent Evaluation UI/dependency cleanup and reference
probe refactoring. The source-consistency record describes the export-time check,
not a permanent assertion that every file in the live repository is unchanged.
No model experiment was repeated for that cleanup; original measurements remain intact.
The separate five-project benchmark remains paused. Older experiment outputs were
removed because their frozen agent sources differed from the current implementation.

## Frozen setup

Three existing development projects, B0/B3, one run each: six planned and completed
runs. All use gpt-6-luna, policy contract-witness-v6-review-recovery, the same source
and requirement input per case, and the immutable Docker image in metrics.json.
Source, dependency lock, inputs, original requirements, witness checks and API usage
are retained under evidence/. Reference labels, patches and witnesses never enter
model context. No live account history is populated by these CLI runs.

B0 is direct generation with schema/original-quote validation and one model call per
case. It bypasses model admission review and semantic decomposition. B3 uses the
full analysis/review/diagnosis workflow with four model calls per case in this run.
These are bundled configurations with unequal context and token budgets, not an
isolated component ablation or measurements of Codex, Claude or a published method.

## Observed outcomes

Counts below include existing and generated tests. A failed assertion can be a
successful detection of the deliberate implementation defect.

| Project | B0 passed / failed | B3 passed / failed | Reference-copy generated-suite replay |
| --- | --- | --- | --- |
| Shipping | 5 / 0 | 5 / 0 | Both pass |
| Booking | 4 / 1 | 4 / 1 | Both pass after the external inclusive-threshold patch |
| Inventory | 10 / 1 | 8 / 1 | Both pass after the external equal-stock patch |

| Measurement | B0 | B3 |
| --- | --- | --- |
| Completed with usable execution | 3/3 | 3/3 |
| Seeded defects detected on original and corrected copies | 2/2 | 2/2 |
| Reference replays with remaining assertion failures | 0/3 | 0/3 |
| Generated tests passed / failed / errors | 15 / 2 / 0 | 13 / 2 / 0 |
| Median agent wall time, seconds | 8.298 | 30.818 |
| Provider-reported total tokens | 9393 | 49749 |
| Model requests | 3 | 12 |
| Applied improvements | 0 | 0 |

## Interpretation and failure analysis

- This pilot gives no fault-detection advantage to B3: both configurations detected
  both seeded faults. B3 used more time and tokens. Different passing-test counts
  do not establish different requirement coverage.
- B3 recorded potential-implementation-defect diagnoses for the Booking boundary
  test and Inventory equality test and preserved both failed assertions. These
  records demonstrate traceability and control flow, not independent diagnosis accuracy.
- B3 marked the vague low-stock notification requirement incomplete rather than
  inventing timing and stock thresholds. This is an observed decision, not a scored
  semantic classification because no independent reviewer supplied a label.
- Shipping B3 measured 7/9 raw killed mutants and reviewed two survivors against
  four behaviors each. This is not an independently reviewed mutation score.
- No improvement was applied. This dataset therefore provides no evidence that
  refinement improves detection or raw mutation results. Separate deterministic
  regression tests cover correction rules but do not substitute for model outcomes.
- A reference replay passing does not establish zero false positives generally.
  References pass finite contract witnesses; untested interpretations and inputs remain.
- One observation per case/configuration cannot assess repeatability. Case order,
  provider variability and caching remain uncontrolled. Development inputs are not
  held out. No semantic accuracy, diagnosis F1 or population confidence interval is claimed.

The frozen source is unmodified. source-consistency.json records one post-run
correction to analysis wording: B0 does not use model admission review. Agent logic,
metric formulas and recorded results did not change. Reanalysis made no model calls.

## Inspect and reproduce without new generation

- metrics.json, runs.csv and variants.csv contain counts, denominators and unavailable values.
- failure-cases.json preserves actual failed nodes, diagnoses and proposal histories.
- analysis-notes.json states observations, trade-offs and limits.
- figures/ contains seven standalone PNG/SVG figures; 05-test-outcomes.png shows
  generated tests passed/failed and 06-case-results.png shows per-case detection.
- evidence/index.json, manifest.json and agent-snapshot.json preserve the run provenance.

```sh
npm run experiment:analyze -- experiments/results/2026-10-27-current-pilot/evidence/index.json /tmp/reqtest-pilot-rescore
python3 scripts/plot-experiment.py /tmp/reqtest-pilot-rescore
```

Run a larger repeated protocol only after reviewing this pilot and confirming scope.
Do not tune on a future held-out set. The academic report has not been written.
