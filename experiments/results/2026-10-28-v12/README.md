# Policy v12 development evaluation

This directory contains actual model observations collected on 2026-10-28 and
portable experiment evidence. It is a development-results index, not the academic
report. No historical experiment scores are included.

## Component decisions

[Frozen evidence and summary](decisions/summary.md), [metrics](decisions/metrics.json)
and [disagreements](decisions/disagreements.json) retain all 48 planned decisions:
16 fixed development cases, three repetitions, no automatic retries. The configured
model alias was gpt-6-luna, with low reasoning effort. Cases, reference, tasks and
Agent snapshot hashes are recorded in index.json. Reference labels never entered
the model context. The reference is the accepted AI-assisted annotation, with no
independent human review.

| Measurement | Recorded result |
| --- | --- |
| Valid / planned decisions | 48 / 48 |
| Failed requests | 0 |
| Agreement with AI reference | 47 / 48 (97.92%) |
| Cases unanimous across repeats | 15 / 16 (93.75%) |
| Admission TP / FP / FN against reference | 9 / 1 / 0 |
| Admission precision / recall / F1 against reference | 0.900 / 1.000 / 0.947 |
| False support among reference-blocked decisions | 1 / 18 (5.56%) |
| Diagnosis agreement / Macro-F1 against reference | 21 / 21; 1.000 across four represented classes |
| Provider input / output / total tokens | 69,204 / 12,454 / 81,658 |
| Request latency p50 / p95, nearest rank | 3,610 / 5,369 ms |

C03 is the retained failure case. Repeat 1 supported a value-equality-only test
whose assigned contract also promises datetime returns. Repeats 2 and 3 rejected
it for the missing return-type check. The linked reference treats the proposal as
blocked. This shows a model decision can vary on the same input and the explicit
assertion policy does not guarantee reliable semantic admission. The observations
do not establish the final whole-Agent state, because this experiment calls the
review/diagnosis components directly. No prompt or label was edited after viewing
these responses, and the disagreeing attempt was not replaced.

The uncertain diagnosis class has no reference or predicted observations and is
excluded from Macro-F1. Three repeats of 16 developer-authored cases do not create
48 independent unseen examples. Agreement with AI labels is not independent human
accuracy; those accuracy fields remain unavailable.

Re-score the exported evidence without model calls:

```sh
npm run evaluate:decisions -- score experiments/results/2026-10-28-v12/decisions
```

## Workflow comparison

The separately frozen manifest uses Shipping, Booking and Inventory, shared B1
initial candidates, B3 follow-up, three repeats and 18 planned workflows. Mutation
checks are disabled; the request limit is 12, with at most six B3 follow-up
requests. All 18 workflows completed. All nine pairs passed the exact shared
initial-suite identity checks. No request budget was exhausted.

[Workflow metrics](workflow/metrics.json), [paired comparison](workflow/paired-comparison.json),
[failure cases](workflow/failure-cases.json) and [portable raw evidence](workflow/evidence/index.json)
retain all planned observations. Raw B3 rows in metrics.json are follow-up-only;
the table below and resource figures include the B1 prefix in B3 end-to-end totals.

| Measurement | B1 initial generator | B3 including shared B1 prefix |
| --- | --- | --- |
| Completed workflows | 9 / 9 | 9 / 9 |
| Seeded-fault detection | 6 / 6 | 6 / 6 |
| Final generated-suite assertion failures on reference copies | 0 / 9 | 0 / 9 |
| Recorded potential-defect diagnoses | 0 | 6 |
| Retained diagnosed valid failures | 0 recorded as diagnosed | 6 |
| Additional / lost fault detections | N/A | 0 / 0 |
| Accepted improvement actions | 0 | 0 |
| Model requests | 9 | 33 |
| Provider total tokens | 27,579 | 138,905 |
| Median complete workflow time | 8.802 s | 33.125 s |

The six fault observations represent two distinct controlled defects, each
repeated three times. B1 already found every seeded defect, leaving no detection
headroom in this set. B3 added original-contract analysis, source evidence and
grounded diagnoses, and retained each valid failing assertion. Both configurations
retained the defect detections. The study provides no incremental detection or
repair-success advantage: neither configuration exercised an accepted repair, and
no initial proposal was blocked. It cannot establish that diagnosis caused safe
retention, isolate diagnosis from analysis/review, or estimate recovery success
on naturally generated errors. Seeded recovery challenges remain future work.

Booking repeat 1 provides a concrete preserved-failure example: the original
implementation excludes exactly 24 hours from free cancellation. The shared T1
assertion exposes that boundary, passes on the separately corrected copy and is
retained by B3 as potential_implementation_defect. Inventory repeats similarly
retain the justified equal-stock failures. See the linked reports and traces;
diagnosis labels themselves are not independently reviewed accuracy scores.

B3 used 5.04 times B1's tokens and its median end-to-end time was 3.76 times as
large. These are descriptive ratios for this fixed pilot, with unequal request
budgets, not equal-cost causal effects. Resource figures use prefix-inclusive B3
values; all original incremental rows remain available. Replay of the final
suites on fixed-witness-validated reference copies produced no failed assertions,
but finite witnesses are not a complete semantic oracle.

Re-analyze the exported evidence into a separate directory without model calls:

```sh
npm run experiment:analyze -- experiments/results/2026-10-28-v12/workflow/evidence/index.json /tmp/reqtest-v12-reanalysis
python scripts/plot-experiment.py experiments/results/2026-10-28-v12/workflow
```

Rendering requires Python with matplotlib and numpy. The recorded rendering code
and its hash accompany the results. The observed provider requests across both
studies were 81, reporting 220,563 tokens in total. The shared B1 prefix is billed
once; do not add the prefix-inclusive comparison totals a second time.

Both studies ran on the same local machine, with overlapping provider activity;
early Docker validation also overlapped workflow preflight. Latency is an observed
development measurement, not an isolated hardware or provider benchmark. The
provider alias, remote service state and caching are not frozen. No currency cost,
held-out reliability, external-product superiority or user-task benefit is claimed.
