# Frozen v22 benchmark plan

Owner authorized execution and subsequent old-experiment cleanup on 2026-11-02.
This plan is declared before new v22 paid observations.

Policy: `contract-witness-v22-bounded-mutation-review`. Use the local configured
`gpt-6-luna` model alias and pinned `reqtest-real-projects:2` image digest. Freeze
the code commit, Agent fingerprint, manifest, imported source and requirement
identities for each run. The working implementation has passed the documented
quality checks and no-model reference validation.

## Declared observations

1. `examples/experiments-smoke.json`: Click, four independent configurations,
   one repeat, four workflows. This checks dispatch, execution, accounting,
   reference replay and exports. It is separate from the repeated matrix.
2. `examples/experiments-baselines.json`: three pinned real projects, four
   independent configurations, three repeats, 36 workflows. This assesses
   completion, reference disagreements, literal suite variation, latency and
   resource usage on the declared contracts. These projects have no injected
   source fault and cannot establish comparative defect-detection effectiveness.
3. `examples/experiments-faults-v22.json`: the existing Booking boundary fault and
   Inventory equal-stock fault/contradictory-test fixture, four independent
   configurations, one repeat, eight workflows. This is a supplementary synthetic
   study, not two additional independent upstream repositories or a stability
   study. Tests are generated naturally; initial test candidates are not seeded.
   Source faults, contracts and witnesses are developer/AI-assisted inputs.

Total: 48 planned workflows across three separately indexed studies. The shared
global cap is 32 requests/workflow; mutation review is bounded by four requests
and 60 seconds. These caps do not predict actual usage or monetary spending.

## Gates and reporting

Start the two benchmark manifests after the smoke confirms usable execution and
exports. `completed_with_limits` is an expected explicit assessment outcome, not
full verification. A semantic model failure remains an observation. An exposed
reproducible implementation defect requires a new code/policy freeze and separate
evidence; do not mix observations across revisions.

Run each declared manifest once, with no automatic retries or replacement
candidates. Keep failed, missing, timed-out and unknown-token rows in denominators.
Provider authentication/quota failures can stop execution; retain all missing
planned rows rather than silently starting a substitute study.

For source-fault detection require a generated failure on the faulty source and a
passing replay on a separate corrected copy validated by the fixed witness.
Keep false-assertion proxies, reference disagreements, actual admission-driven
corrections, approved runtime failures and runtime repair opportunities distinct.
No opportunity means unavailable. No independent semantic accuracy, diagnosis F1,
reviewed mutation score, first-user usability or B3 superiority is presumed.

## Authorized cleanup after new evidence is exported and verified

Remove whole retired v20/v21 model/tool studies, including their successes and
failures, and their old raw evaluation workspaces. Record removed paths, hashes,
counts and the Git revision retaining the old evidence. Exclude removed studies
from current aggregate metrics and repair links/documentation.

Preserve current v22 studies, pinned reusable inputs, regression fixtures,
production UI acceptance, application accounts/runs, credentials and backups.
Old experiments are available through Git history; do not rewrite history or
remove failure rows selectively. Do not push or merge to main.
