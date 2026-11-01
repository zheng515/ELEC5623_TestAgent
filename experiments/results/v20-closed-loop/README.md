# B2/B3 closed-loop acceptance

Four actual gpt-6-luna workflows on 2026-11-01: two existing synthetic development
fixtures, two independently generated configurations and one repeat. Common
16-request limits, mutation enabled, fixed requirements/source/image. This custom
subset is not the full B0-B3 study, a held-out benchmark, a diagnosis-only ablation
or the academic report. References remain developer/AI-assisted and unreviewed.

| Case | Configuration | Generated passed / failed | Requests | Reported tokens | Agent seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| Correct shipping | B2 | 4 / 0 | 4 | 15,936 | 31.607 |
| Correct shipping | B3 | 4 / 0 | 4 | 16,549 | 35.848 |
| Booking boundary fault | B2 | 3 / 1 | 5 | 21,879 | 31.223 |
| Booking boundary fault | B3 | 3 / 1 | 4 | 17,492 | 28.353 |

All four workflows completed, with **17 actual model requests and 71,856 known
provider-reported tokens**. Agent durations exclude external reference probes.
No request was retried or replaced, and no budget was exhausted.

## What was observed

Both shipping suites passed their generated cases, executed the real mutation
tool and received four behavior-level Verified states under the recorded policy.
Each mutation attempt recorded seven killed and two surviving mutants; model
relevance decisions excluded the two survivors. These are raw/tool and model
assessments, not independently reviewed mutation strength or complete correctness.

Both booking suites exposed the existing equality-boundary defect and retained
their original failing artifact unchanged. The same assertions passed on the
separately corrected source copy, which was validated by external fixed witnesses.
No production implementation was patched. B3 produced a grounded potential-defect
diagnosis linking the exact requirement, source line, test and failure trace,
then selected no repair. Each faulty run kept one Uncertain and three Partially
Verified behaviors; passing cases did not hide the unresolved defect.

B2 attempted a repair, returned identical approved code and mapping, then repeated
admission review and execution. The server incorrectly recorded that as an applied
improvement. `closed-loop-observations.json` preserves one recorded action but
marks its executable unchanged. It is **not a successful repair**. Original raw
reports, action status and resource use remain unaltered in `evidence.zip`.

## Follow-up correction

Policy v21 filters unchanged approved executables and mappings before another
review or execution. Original evidence remains active and the stop reason is
explicit. Previously blocked candidates can still pass a new admission review.
Both full configurations share this guard. Docker regression covers the observed
valid-failure/no-op path and the previously-blocked admission path.

`followup-validation.json` and `followup-agent-snapshot.json` record this separate
engineering revision. No v21 model run was made; these v20 observations are not
upgraded to post-fix effectiveness evidence.

## Limits and interpretation

B3 did not improve defect detection here: both configurations detected the single
controlled fault. B3 added an inspectable diagnosis and avoided an unproductive
operation in this observation. Independent generation, a single repeat and the
subsequent common no-op fix prevent a general efficiency or superiority claim.
No natural generated-test error was exposed, so test-error repair success rate
is unavailable. There are no independent semantic accuracy, diagnosis F1 or
reviewed mutation scores. Missing opportunities are not perfect scores.

- `metrics.json`, `runs.csv`, `variants.csv`: automatic objective measurements.
- `closed-loop-observations.json`: literal failure retention, unchanged actions,
  resource usage, policy states and actual mutation attempts.
- `figures/`: completion, controlled fault detection, resources, outcomes,
  case summaries and reference replay. Unavailable mutation-feedback and the
  generic resource-ratio view are omitted.
- `evidence.zip` and `evidence-files.sha256.json`: byte-identical frozen inputs,
  snapshots, reports, requests, reference replays and unreviewed review templates.

```sh
unzip experiments/results/v20-closed-loop/evidence.zip -d /tmp/reqtest-v20-loop
npm run experiment:analyze -- /tmp/reqtest-v20-loop/index.json /tmp/reqtest-v20-loop-analysis
```

Current inputs are in `examples/experiments-closed-loop-smoke.json`. Executing
that manifest makes four new paid observations under current code. The next
useful case is an explicitly declared test-error challenge to check real repair
without treating valid implementation failures as test-generation mistakes.
