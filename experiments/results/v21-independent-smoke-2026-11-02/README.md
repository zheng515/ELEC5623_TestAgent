# Current-policy independent Click smoke

This study runs the unchanged `examples/experiments-smoke.json` once: Click
8.1.7, independently generated B0/B1/B2/B3 suites, one repeat, mutation enabled,
32 model requests per workflow and no automatic retries. It is a bounded smoke
observation, not a repeatability study or the 36-workflow matrix.

The frozen product revision is `b16b7ac`, policy
`contract-witness-v21-unchanged-proposal-stop`, model alias `gpt-6-luna`, Node
22.23.2, and sandbox image
`sha256:b64182700c09f1552bc215dc2d3cfdb933893e46138391140ecc306e562928da`.
The local observation date is 2026-11-02 in Australia/Sydney; raw timestamps use
UTC. Source, contracts, manifest and Agent snapshot identities are retained.

## Result: the smoke acceptance did not pass

All four planned workflows were attempted. B0/B1 completed; B2/B3 failed after
exhausting the unchanged 32-request budget during remaining mutation review.
No workflow was replaced or retried. The runner saved `status: completed` and
exited zero because it processed every planned row; workflow completion is
**2/4**, with **2 failed** and **0 missing**.

| Configuration | Workflow | Final eligible / admitted artifacts | Generated passed / failed / errors | Requests | Known tokens | Agent seconds |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| B0 | Completed | 6 | 6 / 0 / 0 | 1 | 55,240 | 16.949 |
| B1 | Completed | 6 | 6 / 0 / 0 | 1 | 62,444 | 16.432 |
| B2 | Failed: request budget | 10 | 10 / 0 / 0 | 32 | 1,828,796 | 358.858 |
| B3 | Failed: request budget | 12 | 12 / 0 / 0 | 32 | 1,696,624 | 372.894 |

B0/B1 artifacts have execution eligibility, not full-agent semantic admission.
All four final executions preserve source integrity and the 22 original Click
skips. B0/B1 also pass separate final reference replays. The frozen runner does
not replay failed workflows, so B2/B3 reference replay outcomes are unavailable.
The post-run source check matches every imported tree to the pinned preflight.

B2 initially admits nine of ten artifacts, then corrects the rejected integer
type witness. B3 initially admits ten of twelve artifacts, then corrects two
rejected boolean type witnesses. Each full arm uses one reviewed improvement
action; no new artifact is added. These are admission-driven corrections.
There are zero admitted generated runtime failures and zero diagnosis requests,
so runtime repair success and diagnosis accuracy remain unavailable.

Actual resources total **66 requests / 3,643,104 provider-reported tokens**.
All request usage is known, with no recorded provider errors or automatic retry.
Budget exhaustion happens before dispatching another request. No currency cost
or efficiency advantage is inferred. Failed runs remain in every denominator.

`metrics.json`, `runs.csv`, `variants.csv`, `workflow-evidence.json` and
`failure-cases.json` retain the standard analysis. `budget-analysis.json` records
the per-run accounting, admission corrections and deterministic pair arithmetic.
`runner.log` retains the original attempt order and terminal messages.
`evidence.zip` contains 23 byte-verified frozen files, including the post-run
source check. Reanalysis from that archive reproduces all six standard JSON/CSV
analysis outputs byte-for-byte without model calls. Original raw run directories
are retained locally. `validation.json` and `artifacts.sha256.json` record the
checks and final artifact identities.

## No-model preparation

The complete default manifest passed `--validate-only` with zero provider calls.
Every pinned upstream file matched its inventory, with no missing or extra files:
Click 146 files, Packaging 90 files and Werkzeug 311 files. All three fixed
contract witnesses passed with source integrity preserved.

| Imported original suite | Passed | Failed / errors | Original skips | Complete node catalog |
| --- | ---: | ---: | ---: | --- |
| Click 8.1.7 | 589 | 0 / 0 | 22 | Yes, 611 nodes |
| Packaging 24.2 | 26,921 | 0 / 0 | 0 | Yes, 26,921 nodes |
| Werkzeug 3.0.6 | 913 | 0 / 0 | 1 | Yes, 914 nodes |

`preflight.json` summarizes preparation. `preflight.zip` retains 30 byte-verified
files, including source inventories, both manifests, reference validation,
inspection and complete original-suite execution records.
`preflight-files.sha256.json` identifies their exact uncompressed bytes.
These are engineering checks; the original platform skips remain skips.

## Budget finding

The full workflows independently reach an expensive mutation-review tail.
`reviewSurvivingMutations` in the frozen `lib/python-agent.ts` enumerates every
unreviewed `(surviving mutant, mapped behavior)` pair with an available difference,
then sends batches of 16. The workflow request limit also includes analysis,
generation, admission and improvement.

- B2 has 66 eligible survivors mapped to 12 behaviors: 792 pairs, requiring
  50 review requests after 10 earlier requests. This cannot fit a 32-request cap.
- B3 has 65 eligible survivors mapped to 11 behaviors: 715 pairs, requiring
  45 review requests after 8 earlier requests. This also cannot fit the cap.

B2 completes 352 grounded pair records and leaves 440 pairs unreviewed. B3
completes 384 and leaves 331 unreviewed. The failed reports retain intermediate
behavior-state snapshots from before terminal review exhaustion; these are not
fresh final adequacy assessments. No behavior snapshot is `Verified`.

Both mutation executions return timed-out, incomplete evidence. Their raw counts
cannot establish complete adequacy or a paired mutation advantage: independently
generated suites can execute different source lines and mutant scopes.
Completed pair reviews are model judgments, not independent human annotations.

This arithmetic reproduces a budget conflict on the retained artifacts without
another provider request. It does not establish a provider outage, a bad API key,
a generated-test failure or a confirmed correctness defect in the policy.
Changing review allocation, batching, budgets or terminal handling would require
a separately versioned follow-up; this study must remain unchanged.

## Interpretation and next gate

Keep workflow completion, test execution and requirement assurance separate.
The runner's terminal index or shell exit status only says the planned attempts
were processed; inspect each report's status before calling the smoke successful.
Do not count a coverage addition as generated-test-error repair. No seeded source
fault is present, and passing tests do not prove the project bug-free.

Do not start the 36 paid workflows automatically. Inspect this budget conflict
before deciding whether to accept incomplete runs under the frozen protocol or
design a separate, symmetric B2/B3 budget policy. Raising the cap blindly does not
address an incomplete mutation execution or establish a monetary spending limit.
Any changed policy must retain unreviewed pairs as unknown and must not promote
requirements from incomplete evidence. Preserve this smoke as its own study.

No independent semantic accuracy, diagnosis F1, repair success rate, repeat
stability, B3 superiority or academic-report result is established here.

## Reproduce

Select Node 22.23.2 from `.nvmrc` and make Docker available on `PATH`.

```sh
# Inspect the retained observation without provider calls:
unzip experiments/results/v21-independent-smoke-2026-11-02/evidence.zip -d /tmp/reqtest-v21-independent-smoke
npm run experiment:analyze -- /tmp/reqtest-v21-independent-smoke/index.json /tmp/reqtest-v21-independent-smoke-analysis
# No provider calls:
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-baselines.json --validate-only
# New paid observations; not an exact output replay:
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-smoke.json
```

The complete repeated matrix remains unrun. The product code, original
requirements, manifests, local credentials and saved application runs were not
changed by this continuation.
