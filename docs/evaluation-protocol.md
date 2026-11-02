# Evaluation protocol

Current policy: `contract-witness-v22-bounded-mutation-review`.
The default independent B0-B3 matrix is `examples/experiments-baselines.json`.
See [baseline definitions](baseline-configurations.md) and the
[current evidence inventory](../experiments/README.md). This is a technical
protocol, not the academic report. Deleted studies contribute no current results.

## Study design and completed observations

The predeclared [v22 plan](../experiments/v22-benchmark-plan.md) uses frozen commit
`bd12d23`, gpt-6-luna and one pinned sandbox image. Source, contracts, manifests
and Agent identities are retained in each study archive.

- Click smoke: four independent workflows, one repeat; 4/4 completed, two limited.
- Main matrix: Click 8.1.7, Packaging 24.2 and Werkzeug 3.0.6; independent B0-B3,
  three repeats; 36/36 completed with 12 limited mutation assessments. All final
  generated nodes and reference replays pass. These inputs inject no source fault.
- Fault supplement: existing Booking and Inventory synthetic boundary faults;
  independent B0-B3, one repeat; 8/8 completed. All configurations detect both
  faults on original/corrected copies. B2's unchanged proposals are stopped;
  B3 records two grounded defect diagnoses and retains the failures.

See [full results and limitations](../experiments/results/v22-summary/README.md).
Only actual resource usage is added across studies: 286 requests / 16,994,380
known tokens, zero unknown usage. Effectiveness denominators remain separate.
The frozen v22 studies contain no observed admitted generated runtime-error
repair opportunities.
Independent semantic/diagnosis accuracy and reviewed mutation strength are
unavailable. Requirements, faults and witnesses are developer/AI-assisted inputs,
not independently reviewed native SRS labels. All observations are development
cases; repeated runs share projects. Node/browser model effectiveness is outside
this Python benchmark.

B0 uses requirements and bounded implementation code. B1 adds repository evidence.
B2 adds analysis, admission, execution and one bounded improvement without
failure classification. B3 obtains grounded diagnoses before repair selection.
The same admission, mutation and stopping safeguards apply to both full arms.
They share four mutation-review requests and 60 seconds inside the global cap
of 32. Limited assessment is explicit and cannot establish full assurance.

The owner retired v20/v21 studies after these new archives were verified. Whole
studies, including successes and failures, are excluded from current metrics;
[cleanup](../experiments/cleanup-v22.json) records hashes and Git recovery.
They are not pooled with v22. Current results show a decision-trace difference,
not B3 superiority or natural runtime-error repair success.

The separate [v23 matched diagnosis ablation](../experiments/results/v23-diagnosis-ablation-2026-11-02/README.md)
uses one controlled admitted runtime setup error and one valid implementation
failure. Six of six linked workflows completed. B3 classified the setup failure
as `generated_test_error`, repaired it and passed fixed-witness replay; it
classified the valid boundary failure as `potential_implementation_defect` and
did not open repair. B2 also repaired the setup error and preserved the boundary
failure after its unchanged proposal was stopped. This closes the missing
controlled repair-path observation without establishing a higher B3 final
success rate, natural admission accuracy or independent diagnosis accuracy.

## Controlled recovery modes

The CLI also supports explicitly declared seeded candidates and shared B1/B3
initial suites. A diagnosis ablation uses B1/B2/B3, shared preparation, mutation
disabled and equal follow-up ceilings. These custom modes are separate from the
full independent matrix and remain covered by scripted regression tests:

1. Freeze the initial candidates, analysis, admission and initial execution.
2. Clone the exact preparation for B2/B3; alternate follow-up order by repeat.
3. Retain original source integrity, executable-suite and preparation identities.
4. Permit one reviewed improvement; never substitute a new preparation after failure.
5. Preserve blocked, failed, missing, interrupted and budget-exhausted outcomes.

An optional controlled preparation reference can freeze developer/AI-assisted
analysis and admission without provider calls. Its hash and source are retained;
it establishes the challenge precondition and is not an independent human label.
Controlled interventions measure recovery paths, not natural-error frequency.
Retired controlled observations are not current results. These modes remain
regression-tested and do not create natural-error frequency measurements.

## Objective measurements

- Completion keeps all planned rows in denominators, including missing attempts.
- Defect detection requires a generated assertion failing on original faulty code
  and passing on a separately corrected disposable copy. Fixed external witnesses
  must validate the reference. The original implementation is never patched.
- Test-error recovery requires a changed approved original artifact, passing
  execution and a usable fixed-witness reference replay. Repeated unchanged
  approved code is a non-applied proposal, not a successful repair.
- Valid-failure retention checks unchanged approved code/function and retained
  defect detection. Lost detection is reported; literal identity is narrower
  than semantic equivalence.
- Requests, known/unknown provider tokens, context bytes and wall time are saved.
  Shared work counts once in actual billed totals; paired strategy totals include
  their shared prefix. No monetary estimate is inferred from a request cap.
- Raw paired mutation counts require complete identical mutant IDs, differences
  and scope. They are not an independently reviewed relevance/equivalence score.
- Independent semantic accuracy, diagnosis F1 and reviewed mutation strength stay
  unavailable without qualified reference and output annotations. No opportunity
  or missing evidence is not a perfect score.

## Reproduction

Follow [real-project preparation](../examples/real-projects/README.md).

```sh
# No model calls; validates the declared references and environment.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-baselines.json --validate-only
# 36 new paid workflows; not automatically started by validation.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run experiment:run
npm run experiment:analyze -- .evidence/evaluation/RUN/index.json experiments/results/NEW-STUDY
python3 scripts/archive-experiment-evidence.py experiments/results/NEW-STUDY --remove-exported-copy
```

Each study freezes inputs, Agent sources, image/model identities, requests,
reports and reference executions. Changed code or contracts require a fresh
study. Never replace disagreeing attempts or pool adaptive cases as independent
samples. Archives verify original bytes before removing redundant export copies.

The 16-case AI-assisted decision reference and trace inputs remain under
`tests/fixtures/decision-reference*`. They are regression inputs, not new model
observations or human review. The optional `npm run evaluate:decisions -- 3
--reference PATH` command creates 48 new paid component requests; it does not
change the production Agent or regenerate deleted results.
