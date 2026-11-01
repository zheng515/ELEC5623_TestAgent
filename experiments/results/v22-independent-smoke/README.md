# v22 independent Click smoke

Frozen commit `bd12d236fe65009ba02655f48556b0b397e3f575`, tag
`v22-benchmark-freeze`, policy `contract-witness-v22-bounded-mutation-review`.
Observed 2026-11-02 in Australia/Sydney; raw timestamps use UTC.

The unchanged smoke manifest was run once on pinned Click 8.1.7: four independent
B0-B3 workflows, one repeat, mutation enabled, 32 workflow requests, and shared
four-request/60-second mutation-review limits in the full arms. No initial tests
or source defects were seeded. Contracts and references are developer/AI-assisted.

| Configuration | Workflow | Final eligible/admitted artifacts | Generated passed / failed / errors | Requests | Known tokens |
| --- | --- | ---: | --- | ---: | ---: |
| B0 | Completed | 6 | 6 / 0 / 0 | 1 | 55,404 |
| B1 | Completed | 6 | 6 / 0 / 0 | 1 | 62,350 |
| B2 | Completed; mutation review limited | 13 | 13 / 0 / 0 | 12 | 697,908 |
| B3 | Completed; mutation review limited | 10 | 10 / 0 / 0 | 11 | 692,089 |

All four final generated suites pass separate reference replays and retain exact
source fingerprints. B0/B1 eligibility is not semantic admission. The runner
records `completed_with_limits`: 4/4 completed, zero failed/missing, two limited.
Actual resources total **25 requests / 1,507,751 known tokens**. No automatic
retry or unknown usage is recorded; no monetary cost estimate is inferred.

B2/B3 stop after four mutation-review requests, retaining 1,168/840 unreviewed
behavior pairs. These counts include returned survivors without usable diffs;
they are not counts of all possible or unreturned mutants. Incomplete execution
and review remain explicit and cannot establish full adequacy. No admitted
generated runtime failure appears, so this observation cannot measure runtime
test-error repair or diagnosis accuracy. No improvement action was admitted.

This smoke establishes a usable bounded execution/accounting/export path on one
attempt. It does not establish stability, independent semantic correctness, B3
superiority or a matched cost improvement over an older policy. It is not pooled
with the repeated real-project matrix.

`identity.json` freezes model/image/Agent/manifest identities. Standard JSON/CSV,
`workflow-details.json` and `runner.log` retain outcomes and stopping reasons.
`evidence.zip` contains 25 byte-verified original files, including frozen inputs,
Agent snapshot, reports, requests, reference checks and post-run source checks.
Unzip it and run `npm run experiment:analyze -- PATH/index.json OUTPUT` to inspect
the saved observation without provider calls. Running the smoke manifest again
would create new paid observations.
