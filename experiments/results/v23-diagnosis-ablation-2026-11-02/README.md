# v23 matched diagnosis ablation

Observed once on 2 November 2026 in Australia/Sydney. The experiment used two developer-constructed Python cases and three linked stages per case: a zero-provider-call seeded B1 execution, a zero-provider-call controlled preparation, and separate B2/B3 follow-ups. All six planned workflows completed. No automatic retry, candidate replacement or post-result policy change was used.

The design freezes the project archive, original requirement, seeded candidate, analysis, admission record and first execution. B2 and B3 therefore receive the same admitted runtime failure. The controlled preparation is a developer/AI-assisted challenge precondition, not a provider output, natural admission-accuracy observation or independent human label.

| Case | Shared initial outcome | B2 follow-up | B3 follow-up |
| --- | --- | --- | --- |
| Valid implementation failure | The exact `10000` boundary assertion fails on faulty source and passes on the separately corrected copy. | One unconditional improvement request returned the unchanged test; the no-op guard applied no repair. Detection remained. | One grounded diagnosis classified `potential_implementation_defect`; no repair request was made. Detection remained. |
| Generated runtime test error | Pytest reports `fixture 'amount_cents' not found` for the admitted generated test. | Two requests replaced the fixture parameter with the explicit input `500`, admitted the replacement and passed execution/reference replay. | One diagnosis plus two improvement/review requests classified `generated_test_error`, made an independently generated replacement using `500`, and passed execution/reference replay. |

| Configuration | Completed / planned | Provider requests | Known tokens | Accepted improvements | Final generated pass / fail / error |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 seeded prefix | 2 / 2 | 0 | 0 | 0 | 0 / 1 / 1 |
| B2 follow-up | 2 / 2 | 3 | 10,014 | 1 | 1 / 1 / 0 |
| B3 follow-up | 2 / 2 | 4 | 14,993 | 1 | 1 / 1 / 0 |

Actual paid usage was **7 requests and 25,007 provider-reported tokens**, with no failed or unknown-usage requests. B1 and the controlled preparation made no provider calls. Latency and provider usage are descriptive observations for one repeat, not stable estimates.

The experiment supplies the first observed controlled, admitted runtime-test-error repair path in the retained evaluation. B3 produced the fixture-reference categories for both exposed failures, repaired the runtime setup error and did not open a repair stage for the valid implementation failure. B2 also repaired the runtime setup error and preserved the valid failure because its proposed replacement was unchanged. The evidence therefore supports diagnosis-gated repair eligibility and an inspectable causal decision difference; it does **not** demonstrate a higher final repair-success rate or lower applied incorrect-repair rate than B2.

`paired-comparison.json` verifies shared initial suites and controlled preparations. `diagnosis-exposure.json` records diagnosis categories, improvement-stage requests and artifact changes. `recovery-metrics.json` checks valid-failure preservation and runtime-error repair against fixed executable witnesses. `metrics.json` and CSV files retain workflow and resource totals.

`evidence.zip` preserves exact inputs, controlled preparation references, Agent snapshot, every report/request record, external oracle validation and final reference replays. The fixture labels are developer/AI-assisted and were not independently human reviewed. One case per category cannot estimate diagnosis accuracy, Macro-F1, natural generated-error frequency or population-level safety.

Offline reproduction does not call the provider:

```bash
npm run experiment:analyze -- PATH_TO_EXTRACTED_EVIDENCE/index.json OUTPUT_DIRECTORY
```

Running the manifest again creates new paid observations and is not a deterministic reproduction of model outputs.
