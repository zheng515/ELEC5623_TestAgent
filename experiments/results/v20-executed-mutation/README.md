# Generated-test execution scope

Tool-only development checks on the unchanged Click 8.1.7 source and 14 saved B2
assertions from the original acceptance input subset. No model calls, new test generation,
independent semantic labels, held-out benchmark or academic report.

## Selection policy

Existing statically resolved function scopes are preserved. When static mapping
would fall back to a whole Python file, coverage.py 7.11.0 records dynamic test
function contexts. Only the generated test functions' contexts select lines;
code executed solely during pre-test setup or imports does not select lines.
This is execution evidence, not semantic requirement completeness. The trace has
a 15-second ceiling inside the same total 75-second preparation/execution budget.
Failed or empty traces remain incomplete without a broad fallback.

Remeasurement fixes the original line set so mutation candidates remain comparable.
If new tests execute additional lines, those lines are explicitly unassessed and
the attempt remains incomplete. A fresh assessment may select them. Behaviors
mapped to other unassessed implementation files cannot earn Verified from the
selected file; existing-test evidence is not an implementation mutation target.
The website displays the selected line count and newly executed unassessed lines.

## Same-suite observations

| Observation | v19 file fallback | v20 final execution scope |
| --- | ---: | ---: |
| Discovered mutation candidates | 986 | 325 |
| Returned outcomes | 200 | 200 |
| Available differences | 98 | 94 |
| Mutation wall time | 86.214 s | 86.281 s |
| Mutation engine budget reached | Yes | Yes |
| Assessment incomplete | Yes | Yes |
| Saved generated cases passed | 14 | 14 |

Sources and approved-suite code hashes match. Candidate count dropped by 661,
but the tool still used its budget. These single development observations do not
demonstrate reduced latency, model cost, equivalent coverage or B3 superiority.
Unexecuted code and unselected files are outside the assessed mutation scope.
Raw outcomes are not a relevance/equivalence-reviewed mutation score.

`initial-selection/` retains the first v20 selection run before the additional
unassessed-new-lines guard; `final/` uses the guard revision. Their source/image
identities remain separate. `comparison.json` checks the source and suite hashes
against the earlier file-fallback measurement. Those retired study directories
were deleted at the owner's request; their summary inside this frozen comparison
is contextual history, not an additional retained current experiment.
Original tool outcomes and snapshots in this directory remain unchanged.

## Engineering checks and reproduction

The Docker regressions in `tests/mutation-scope.test.ts` cover indirect/class
calls, pre-test setup exclusion, empty/failing traces, invalid frozen line IDs,
unchanged paired candidates and newly executed branches remaining unassessed.
A separate assurance regression rejects credit for another implementation file.

Build current base and evaluation images, then use a fresh output directory:

```sh
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npx tsx scripts/check-mutation-runtime.ts experiments/results/v20-executed-mutation/replay-inputs.zip click-full-B2-1/report.json .evidence/executed-mutation-new 75
```

Each attempt saves baseline/combined execution, raw mutation evidence, source
snapshot, image identity and test-code hashes. API credentials are unnecessary.
`replay-inputs.zip` contains four byte-identical original files needed by that
command: the index, Agent snapshot, source archive and selected completed B2
report. The unchanged index also names retired observations that are absent from
this subset; it must not be presented as a complete model-study archive.
`replay-inputs.json` records the original archive hash and subset provenance.
Current code creates a new tool observation and cannot reproduce old timings exactly.

The subsequent [four-run model pilot](../v20-closed-loop/README.md) records actual
requests, latency and retained-failure evidence; it does not establish B3 superiority.
