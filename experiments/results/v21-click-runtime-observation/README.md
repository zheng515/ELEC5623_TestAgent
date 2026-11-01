# Natural runtime-error observation on Click

One bounded development observation on unchanged Click 8.1.7, commit
`874ca2bc1c30d93a4ac6e36a15ed685eafe89097`, using gpt-6-luna and policy v21
on 2026-11-01. All 146 pinned upstream files matched their recorded hashes;
all four imported execution directories retained their source fingerprints.
No tests or defects were seeded and no admission rule was changed.

B1 normally generated one suite from the six existing fixed contracts and project
context. A shared preparation applied normal analysis, model admission and
execution. B2/B3 reused that exact reviewed suite, with six-request follow-up
ceilings, one repeat and mutation disabled. This is a custom shared-prefix
observation, not independent B3 website generation or the full B0-B3 matrix.

## Result: no qualifying failure observed

| Phase | Unique suite | Generated passed / failed / errors | Model requests |
| --- | --- | --- | ---: |
| B1 generation and execution | Six naturally generated artifacts | 6 / 0 / 0 | 1 |
| Common analysis, admission and execution | Same six; all supported | 6 / 0 / 0 | 2 |
| B2 continuation | Same six unchanged | 6 / 0 / 0 | 0 |
| B3 continuation | Same six unchanged | 6 / 0 / 0 | 0 |

**Approved generated runtime-failure opportunities: zero.** Neither continuation
requested diagnosis or repair. Runtime generated-test-error repair success and
diagnosis accuracy remain unavailable, not 100%. The suite was generated once;
repeated execution does not create 18 or 24 independent generated tests.

All final generated suites also pass separate fixed-witness reference replays.
The original imported suite collects 611 nodes: 589 pass and 22 original platform
skips remain, with no baseline failures/errors. Model context selects 200 nodes
separately; execution does not use that truncated catalog as its test list.
The full arms retain Partially Verified states with mutation disabled. B1's
scaffolding/eligibility flags are not semantic requirement verification.

This observation does not prove the upstream project bug-free, complete coverage,
independent semantic accuracy, zero hallucinations or B3 superiority. Its narrow
conclusion is that no post-admission generated failure appeared in this attempt.
No alternative projects, new candidates or repeated search were started.

## Actual resources

- B1 generation: 1 request, 62,484 provider-reported tokens.
- Common preparation: 2 requests, 151,269 tokens.
- B2/B3 continuations: no additional model requests.
- Actual total, common work counted once: **3 requests / 213,753 known tokens**.

All usage is known; no request error, retry or exhausted budget occurred.
The continuations' zero additional cost is not zero end-to-end cost: paired
strategy totals include generation and common preparation. Adding those strategy
totals double-counts shared work. No monetary cost or efficiency advantage is inferred.

## Inspect and reproduce

`runtime-observations.json` records the zero-opportunity result, source checks,
shared suite, reference replays and accounting boundaries. JSON/CSV and selected
figures retain the actual outcomes and prefix-inclusive resources. Labels and
requirements are developer/AI-assisted; no independent human accuracy is claimed.

`evidence.zip` contains 22 byte-verified frozen files: inputs, Agent snapshot,
reports, usage, reference checks and unreviewed review templates. The stopped
search is itself an observation, not a missing result to fill with a seeded case.
No academic report was authored.

```sh
unzip experiments/results/v21-click-runtime-observation/evidence.zip -d /tmp/reqtest-v21-click
npm run experiment:analyze -- /tmp/reqtest-v21-click/index.json /tmp/reqtest-v21-click-analysis
# Makes a new paid observation; does not reproduce exact model output:
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-click-runtime-smoke.json
```
