# Evaluation protocol

Current policy: `contract-witness-v22-bounded-mutation-review`.
The default independent B0-B3 matrix is `examples/experiments-baselines.json`.
See [baseline definitions](baseline-configurations.md) and the
[current evidence inventory](../experiments/README.md). This is a technical
protocol, not the academic report. Deleted studies contribute no current results.

## Study design

The default matrix fixes source, requirements, model, image and request budgets
per case: Click 8.1.7, Packaging 24.2 and Werkzeug 3.0.6, four independently
generated configurations and three repeats (36 workflows). Requirements and fixed
witnesses are developer/AI-assisted, not native upstream SRS files or independent
human labels. The current repeated matrix has not been executed.

The retained v21 [2026-11-02 independent Click smoke](../experiments/results/v21-independent-smoke-2026-11-02/README.md)
uses frozen commit `b16b7ac` and the unchanged four-row proposal manifest.
No-model validation and all three complete original suites pass. B0/B1 complete,
but B2/B3 fail at the 32-request cap during remaining mutation review after their
generated tests pass. All four rows, 66 actual requests and 3,643,104 known tokens
are retained. The smoke acceptance gate did not pass; a completed runner index
is not a successful workflow result. Inspect its deterministic pair-budget
conflict before authorizing the full study. No policy or manifest was changed
during that observation. The current v22 follow-up bounds review allocation and
separates limited assurance from execution failure; see the
[policy change](mutation-review-budget.md). Its updated manifests require a new
freeze and separate paid evidence. The v21 failures are not replaced or pooled.

B0 uses requirements and bounded implementation code. B1 adds retrieved project
evidence. B2 adds analysis, admission, execution and bounded refinement without
failure diagnosis. B3 obtains grounded diagnoses before selecting repair. Both
full configurations use the same admission, mutation and stopping rules. B0/B1
are internal alternatives, not measurements of commercial coding products.

The retained four-run v20 pilot uses two existing synthetic fixtures and B2/B3,
one repeat each. Both configurations detect its boundary fault; no natural test
error exposed a repair opportunity. The observed unchanged-code improvement was
fixed in v21 and validated offline. A separate controlled v21 study runs two
seeded candidates through six B1/B2/B3 rows and two common preparations. Both
full arms correct the rejected import and retain boundary-fault detection after
adding type witnesses. Both initial candidates were admission-blocked: initial
runtime diagnosis was not exposed, and literal unchanged-artifact retention
fails in both full arms. It does not establish superiority or natural-error repair.
An adaptive type-complete candidate then passes admission in a separate follow-up;
both full arms retain its original executable and detection, and B3 records an
execution-phase defect diagnosis. This uses the preceding B3 correction and is
not an independent project or a replacement observation.
A bounded natural Click follow-up generated six tests without seeds or source
faults. All passed normal common admission and execution in B2/B3, so approved
runtime-failure exposure was zero. The run stopped without another project or
candidate search; repair effectiveness remains unavailable rather than successful.
The retained Click execution-scope check is tool-only and remains incomplete;
it does not establish model quality or a latency advantage.

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

Controlled interventions measure recovery paths, not natural-error frequency.
The retained controlled study establishes one admission-driven import correction
per full arm, not post-admission runtime test-error repair effectiveness.

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
