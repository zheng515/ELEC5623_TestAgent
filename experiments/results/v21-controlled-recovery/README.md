# Controlled recovery under policy v21

Actual gpt-6-luna run on 2026-11-01: two deliberately seeded development
candidates, B1/B2/B3 and one repeat. All six workflow rows and two common
preparations completed. B1 executes fixed candidates with zero model calls;
it is a seeded execution control, not natural B1 generation performance.
The full independent B0-B3 matrix and five-project benchmark were not run.

## Observations

| Candidate | Seeded B1 execution | B2 final outcome | B3 final outcome |
| --- | --- | --- | --- |
| Incorrect shipping module import | Collection error | Import corrected; generated check and reference replay pass | Import corrected; generated check and reference replay pass |
| Correct booking equality expectation, missing a type witness | Assertion fails on original, passes on corrected copy | Adds integer-type witness; the equality assertion still exposes the defect | Adds integer-type witness; equality still exposes the defect, with a grounded remeasurement diagnosis |

Both common preparations rejected the initial candidate. The bad import was
unsupported; the boundary test checked zero value but not the integer return
promised by its assigned behavior. B2/B3 recovered through the explicitly
rejected-candidate path, under the normal admission gate. Neither initial
candidate was an approved runtime failure in the shared preparation.

Consequently, **initial runtime diagnosis exposure is 0/2 in each full arm**.
No initial diagnosis agreement or runtime test-error repair rate can be scored.
This is evidence for admission-driven correction, not natural generated-error
frequency or independent diagnosis accuracy.

Both full arms corrected the import using the original T1 ID and passed on a
separately replayed reference copy. Both also strengthened the boundary candidate
with a type check while retaining the zero-value expectation and fault detection.
Because the executable changed, strict unchanged valid-failure retention is
**0/1 for both B2 and B3**. This must not be relabelled as literal retention
success. The paired fault probes show detection before and after, with no observed
loss; that is a different, narrower observation. No implementation was patched
by an Agent, and all original project bytes match their frozen input archives.

B3's booking diagnosis occurs only after remeasurement. It links the original
inclusive requirement, `hours > 24`, `assert result == 0`, and `assert 2500 == 0`.
It is retained by the production evidence gate, not independently reviewed.
Both full arms leave the faulty behavior Uncertain; a failing check is not
silently presented as a passed requirement.

## Actual resource use

| Case | Common preparation requests / tokens | B2 follow-up requests / tokens | B3 follow-up requests / tokens |
| --- | ---: | ---: | ---: |
| Shipping | 2 / 7,376 | 2 / 7,003 | 2 / 6,636 |
| Booking | 2 / 7,163 | 2 / 6,636 | 3 / 10,904 |

Actual total: **13 model requests, 45,718 provider-reported tokens**, counting
each common preparation once. All usage is known; no request errors, automatic
retries, replacement observations or exhausted budgets occurred.

`runs.csv` continuation costs exclude shared work. `paired-comparison.json` and
the latency/token figure include B1 plus preparation plus follow-up per strategy;
adding those strategy totals double-counts shared work and is not actual billing.
Both arms have six-request follow-up ceilings; mutation was disabled. With one
repeat, B2 ran before B3 in both cases. Latency and resource differences are
observations, not stable performance estimates or a causal superiority claim.

## What this does and does not establish

- The current real-model workflow can correct a rejected bad import and still
  expose an implementation defect after adding supported type assertions.
- B3 found no additional defect over B2. Its additional booking request supplied
  an inspectable diagnosis; a population benefit is unmeasured.
- The intended initial-runtime ablation was not exposed because admission blocked
  both original candidates. Strict unchanged-artifact retention did not succeed.
  Keep those unsuccessful/unavailable measurements in the results.
- No unchanged approved executable was proposed, so the v21 no-op guard was not
  exercised by these model outputs. Its separate scripted Docker regression
  remains the evidence for that exact path.
- Inputs and labels are developer/AI-assisted, reviewed=false, not held out or
  independent semantic ground truth. No report has been authored.

## Inspect and reproduce

`controlled-observations.json` separates literal retention, source integrity,
admission recovery and final fault detection. `recovery-metrics.json` retains the
strict unsuccessful retention result; `diagnosis-exposure.json` keeps initial
runtime agreement unavailable. PNG/SVG figures visualize these distinct measures.
Mutation was disabled, so no mutation figure or score is included.

The portable archive contains 43 byte-verified frozen inputs, Agent sources,
reports, raw request usage, references and review templates. Original observations
are unchanged; no failed run was replaced or tuned away.

```sh
unzip experiments/results/v21-controlled-recovery/evidence.zip -d /tmp/reqtest-v21-recovery
npm run experiment:analyze -- /tmp/reqtest-v21-recovery/index.json /tmp/reqtest-v21-recovery-analysis
```

New paid observations use `examples/experiments-recovery-smoke.json`. Repeating
it does not recreate these exact model outputs. Before another diagnosis-specific
study, specify a candidate that fully covers its assigned contract and a case
whose execution actually exposes a test error after admission. Freeze new inputs
separately; preserve this study rather than silently replacing its candidates.
