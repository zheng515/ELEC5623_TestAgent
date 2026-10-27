# Standalone benchmark protocol

Status: draft and paused at the user's request. The experimental protocol is not
confirmed. Do not start further benchmark runs until it is confirmed. Existing
partial attempts are incomplete development data, not final benchmark results.

This benchmark is outside the website. It contains five small, synthetic projects
written after the current contract-policy change. They were not used to tune that
policy, but are agent-authored fixtures, not independently reviewed or an industry
benchmark. The manifest deliberately uses purpose=pilot, not held-out.

The experiment precedes this benchmark: re-run examples/experiments.json first,
then execute this manifest without editing agent code in between. Freeze source,
SRS text, model name, dependency lockfile and Docker image. The runner rejects
agent changes during either run. Any later tuning needs a separately named study;
keep all first-run results, including missed defects and invalid model output.

| Case | Condition | Objective witness |
| --- | --- | --- |
| membership | Exclusive instead of inclusive five-year threshold | A failing generated assertion passes on the corrected copy |
| credits | bool returned instead of integer zero | Numeric equality alone misses the defect; a type check distinguishes it |
| refund | Wrong exception for negative amounts | ValueError witness fails originally and passes on the correction |
| capacity | Conforming implementation for listed witnesses | Fixed normal, boundary and exception checks pass |
| discount | Defined subtotal and unspecified loyalty policy | Only subtotal has executable reference checks; loyalty correctness remains unscored |

B0 is direct generation and B3 is the full diagnosed workflow, both using the same
model and supplied SRS. Neither is Codex, Claude, CoverUp or TestGen-LLM. No external
product performance comparison is claimed. Both share the current assertion policy;
the study compares workflow configurations, not model quality. The full workflow
has more model requests and time available; token and latency trade-offs are shown.

A partial version-3 attempt was stopped when a separate teammate report exposed
mutation/behavior review cardinality. Its first results remain under
experiments/development-failures/2026-10-26/interrupted-benchmark-v3. The final
version-4 run uses a fresh frozen implementation and does not merge those attempts.

Three repetitions per configuration produce 30 planned runs and nine seeded-fault
runs per configuration (three defects repeated, not nine independent defects).
Variants rotate within each case/repetition to reduce one ordering bias. Case
order stays fixed. Fresh model outputs can differ despite identical inputs.

Gold labels, patches and executable witnesses remain outside every model-visible
project. Each original/corrected witness is validated before calls for that case.
Human review flags stay false. Semantic accuracy, diagnosis accuracy and ambiguity
classification accuracy remain unavailable. Recorded ambiguity flags, blocked
tests and diagnoses are workflow observations, not ground-truth correctness.
Environment errors, cancellation and source-integrity refusal are covered by
separate Docker regression checks, not this five-project dataset.

```sh
npm run evaluate -- examples/standalone-benchmark/manifest.json --validate-only
npm run evaluate -- examples/standalone-benchmark/manifest.json
npm run experiment:analyze -- <printed-index.json> experiments/benchmarks/<run>
python3 scripts/plot-experiment.py experiments/benchmarks/<run>
```

The exporter retains portable JSON/CSV, source archives, exact reports, model-call
usage, failure cases and source fingerprints. Figures show actual executed test
outcomes, seeded-fault detection and latency/tokens. More passing tests alone does
not establish stronger tests. These are experiment artefacts, not the final report.
