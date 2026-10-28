# Repeated workflow comparison

Status: reusable B0/B3 development-study protocol. Previous execution outputs
were removed on 2026-10-28 at the user's request. This file does not authorize
or establish completion of a new paid experiment. The current v12 plan is
examples/experiments-budgeted.json; see ../../experiments/README.md.

## Question and scope

Does the full B3 workflow detect the two seeded defects as consistently as direct
B0 generation, and what extra execution evidence does it provide for its token
and latency overhead? Equal or worse detection is a valid result. Do not tune
prompts between repetitions to obtain an advantage.

The manifest examples/experiments-repeat.json defines three development projects,
B0/B3 and three repetitions, giving 18 planned workflow runs. All future execution
must freeze the current policy, source and runtime before calls. No previous
score, authorization or timing is carried forward as a new result.

| Case | Condition | Objective observation |
| --- | --- | --- |
| Shipping | Correct code with weak existing checks | Usable generated execution and reference-copy disagreements |
| Booking | Exclusive rather than inclusive threshold | A generated check fails on original code and passes on the separately corrected copy |
| Inventory | Equal-stock defect, conflicting existing test and vague notification rule | Same corrected-copy detection check; record the ambiguous rule without scoring semantic accuracy |

B0 uses direct generation with source/requirement scaffolding and structural
checks. B3 also uses retrieval, semantic analysis, separate-call admission review,
execution feedback, diagnosis and at most one reviewed improvement. The same
model generates and reviews; review is not independent validation. This compares
bundled workflows with unequal request budgets, not an isolated component effect,
an equal-cost comparison or external products such as Codex and Claude.

## Freeze and preflight

The cleanup baseline is commit `62fb9cf`. Commit the protocol and reference-check
corrections before paid execution and record that final commit with the run.
Use one unchanged model ID, dependency lock, source, SRS and immutable sandbox image
throughout. The runner snapshots these inputs, hashes agent files and stops if
they change. A model alias does not freeze provider weights.

```sh
# Docker only: validates all reference fixtures and makes no model requests.
npm run evaluate -- examples/experiments-repeat.json --validate-only
```

Require all three reference checks to be valid: Shipping passes unchanged;
Booking and Inventory fail on their original copies and pass after their isolated
patches. Require the oracle regression to accept integer subclasses and reject
boolean returns. Built-in-only input rules do not require concrete-class returns.
Reference labels, witness tests and corrective patches remain outside model inputs.

Local preflight on 2026-10-27 passed all three fixtures with zero model runs.
Shipping exited 0; Booking and Inventory each exited 1 before their external
patch and 0 afterward. Both Docker reference regression tests passed, including
integer-subclass acceptance and boolean-return rejection across all three cases.
These checks validate the apparatus, not B0/B3 model performance.

## Execution and decision rules

Run `npm run evaluate -- examples/experiments-repeat.json`.
The existing runner rotates B0/B3 order by repetition within each project, retains
all failures and enforces a ten-minute workflow timeout. Project order remains
fixed; provider caching and time drift are not controlled. Do not silently rerun
failed observations. A changed implementation starts a new experiment directory.
Authentication, quota or cancellation stops retain an incomplete experiment;
missing observations remain in planned denominators.

| Measurement | Definition and denominator |
| --- | --- |
| Usable completion | Runs with passing/failing execution and intact source, out of nine planned per configuration |
| Seeded-fault detection | Matching generated failure on original code and pass on corrected copy, out of six fault observations per configuration; unresolved probes prevent a complete rate |
| Reference disagreement | Final generated suites with assertions failing on the reference copy; show observed replay count out of nine and keep errors, skips, empty suites and unavailable replays separate |
| Stability | Per-case three-run detection and reference-disagreement observations; suite hashes describe literal variation only |
| Resource overhead | Provider token counts, request counts and paired per-case/per-repeat wall times; missing usage stays unavailable; do not infer currency cost |
| Refinement | Actual accepted improvement count and preservation of prior valid failures; zero improvements means no measured refinement benefit |

Export with `npm run experiment:analyze -- <index.json> <output-directory>` and
generate standalone figures using the existing plotting script. Present per-case
results alongside aggregate counts, latency and tokens. Do not pool the old pilot
with new runs or treat repeated runs as independent industry projects.

No human reviewer is currently available. Semantic extraction accuracy, diagnosis
F1, general false-positive precision and relevance-adjusted mutation scores remain
unavailable. Reference witnesses validate finite inputs only. If B3 has no detection
advantage, report the extra cost and show its recorded decisions as workflow
features without claiming higher accuracy. A later diagnosis/refinement study
needs a separately agreed design that actually exercises those paths.
