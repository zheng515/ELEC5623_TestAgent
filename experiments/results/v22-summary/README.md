# Frozen v22 benchmark summary

Assessed code: `bd12d236fe65009ba02655f48556b0b397e3f575`, tag
`v22-benchmark-freeze`, policy `contract-witness-v22-bounded-mutation-review`.
Observed 2026-11-02 in Australia/Sydney. The predeclared plan is
[v22-benchmark-plan.md](../../v22-benchmark-plan.md). No Agent source or policy
changed during the observations. No planned run was replaced or automatically retried.

## Separate studies

| Study | Completed / planned | Limited review workflows | Requests | Known tokens |
| --- | --- | ---: | ---: | ---: |
| [Independent Click smoke](../v22-independent-smoke/README.md) | 4/4 | 2 | 25 | 1,507,751 |
| [Repeated real-project matrix](../v22-real-project-matrix/README.md) | 36/36 | 12 | 240 | 15,392,920 |
| [Synthetic fault supplement](../v22-fault-cases/README.md) | 8/8 | 0 | 21 | 93,709 |

All 48 workflows completed; zero workflow failures, missing rows or unknown-usage
requests were recorded. Actual resources total **286 requests / 16,994,380
provider-reported tokens**. Resource totals can be added; effectiveness
denominators are not pooled. No currency cost is inferred. Workflow completion
does not mean every assertion passed or every requirement was verified.

## Real-project observations

Three pinned projects, four configurations and three repeats give nine workflows
per configuration. This is three projects, not nine independent projects.

| Configuration | Completed | Final generated passing nodes | Model requests | Known tokens | Median agent seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| B0 | 9/9 | 54 | 9 | 543,006 | 41.374 |
| B1 | 9/9 | 54 | 9 | 641,391 | 41.922 |
| B2 | 9/9 | 138 | 108 | 6,909,487 | 188.542 |
| B3 | 9/9 | 151 | 114 | 7,299,036 | 196.583 |

All 397 final generated nodes pass, and all 36 final reference replays are usable
with no failed assertions. B0/B1 eligibility is not semantic admission. More
tests do not prove more requirement coverage. Five full-agent improvement actions
were applied, but no admission-error correction or admitted-runtime repair
opportunity appeared. Zero diagnoses were requested in this matrix.

Each project/configuration produces three distinct literal approved-suite hashes
across three repeats. Execution outcomes were consistent here while generated
text varied. This does not establish semantic equivalence or population reliability.

The full arms use substantially more recorded resources on these contracts,
without a measured execution/reference-disagreement advantage. B3's differences
here cannot be attributed to diagnosis: that stage was not exercised, and the
independent generations differ. Twelve workflows retain limited mutation review;
partial execution, unavailable diffs and unreviewed pairs remain explicit.

## Known-fault observations

Booking and Inventory are existing synthetic development fixtures with declared
boundary faults, not two new upstream projects. All four configurations detect
both faults: a generated assertion fails on the original and passes on a separate
corrected copy validated by the fixed witness. All eight failing generated nodes
are retained; every final corrected-copy replay passes.

- B2 retains the valid failures in both cases. Its proposed improvements repeat
  unchanged approved tests; the no-op guard stops before another review/execution.
  Neither proposal is counted as an applied improvement.
- B3 retains both valid failures without selecting a repair and records two
  execution-phase `potential_implementation_defect` diagnoses with grounded
  requirement/source/test/execution references.
- **No additional defect-detection advantage for B3 is demonstrated.** Its observed
  difference is the explicit diagnosis/decision trace. These two case-consistent
  model judgments are not independent diagnosis accuracy or F1.

No admitted generated-test runtime-error opportunity is observed across these
studies. Runtime test-error repair effectiveness remains unavailable, not 100%.

## Reproduction, scope and cleanup

Each study retains exact inputs, Agent snapshot, manifests, reports, provider
usage, reference executions and post-run source checks in `evidence.zip`, with
uncompressed checksums. Reanalysis from each archive reproduces all six standard
analysis outputs byte-for-byte without provider calls. Plots, JSON/CSV, stopping
reasons and limitations accompany the archives. `studies.json` records identities
and actual resource accounting.

This is a Python-focused internal development evaluation. Requirements, source
faults and witnesses are developer/AI-assisted, not independently reviewed native
SRS labels. Independent semantic accuracy, diagnosis F1, reviewed mutation
strength, first-user usability, external-product superiority and held-out
generalization are unavailable. Node/browser behavior has separate engineering
regressions and is not measured by these model studies. Model aliases/API behavior
can drift; rerunning a manifest creates new paid observations.

At the owner's request, retired v20/v21 experiments are removed as whole studies,
including their successes and failures. They are excluded from this summary.
[Cleanup inventory](../../cleanup-v22.json) records paths, hashes and the Git
revision retaining their exported evidence. Reusable inputs, regression fixtures,
production UI acceptance, application accounts/runs, credentials and backups are
preserved. No academic report or independent human annotations were authored.
