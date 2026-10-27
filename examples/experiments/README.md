# Controlled project experiments

This directory contains reproducible experiment inputs, executable reference
witnesses and export instructions. It is separate from the website and does not
contain the final academic report.

## Protocol

`examples/experiments.json` fixes three synthetic development projects, four
configurations and three repetitions: 36 complete-agent runs. These projects were
used during development; they are not a held-out or representative industry sample.

| Project | Known condition | External reference check |
| --- | --- | --- |
| shipping | Correct implementation, weak existing test | Fixed value, boundary, type and exception checks pass |
| booking | Inclusive-threshold implementation fault | Contract check fails on original code and passes after the external threshold patch |
| inventory | Equal-stock code/test conflict and an ambiguous notification requirement | Defined stock/type checks fail on original code and pass after the external equality patch; notification semantics remain unscored |

The B0 direct generator, B1 retrieved-context generator, B2 loop without failure
diagnosis and B3 diagnosed loop use the same requirements, source archive, model and
immutable Docker image for each project. B2 still uses the common original-contract
review gates. It must not be described as an unrestricted agent that always accepts
an unsafe repair. No implementation code is patched inside the agent workspace.

Before each case, fixed contract witnesses run on separate original/corrected
copies, outside model context. Their hashes, source fingerprints and patch hashes
are retained. They validate only their explicitly listed checks. They do not prove
that the full requirement document was extracted or interpreted correctly.

The current runner uses the same SRS parser and supporting context as the website.
The runner saves the original manifest, input archives, production agent/dependency
source snapshot, image ID, per-stage reports, request errors, provider token usage,
wall time, corrected-copy probes and independent-review templates. Requests have no
automatic retries. The agent retains its one-correction and one-improvement limits.
Changed agent inputs stop further runs. Every planned run remains in denominators,
including missing, cancelled and failed runs. Re-scoring makes no model calls.

## Commands

Requires the normal Node.js, Docker and sandbox setup in the root README.

```sh
# No model calls: validate original/corrected reference witnesses.
npm run evaluate -- examples/experiments.json --validate-only

# Real model calls. Configure OPENAI_API_KEY in .env.local first.
npm run experiment:run

# Use the index.json path printed by the runner.
npm run experiment:analyze -- .evidence/evaluation/<run>/index.json experiments/results/<run>

# Standalone publication figures; no website dependency.
python3 -m pip install matplotlib
python3 scripts/plot-experiment.py experiments/results/<run>
```

The exported directory contains metrics.json, runs.csv, variants.csv,
failure-cases.json and PNG/SVG figures. Its evidence/ subdirectory contains only
this controlled experiment's reports, request measurements, input archives,
reference checks and source snapshot, so analysis can be reproduced after moving
the result directory. The original working directories remain in .evidence.
Review exports before sharing; account credentials, .env files and unrelated private
evidence are never selected by the exporter.

## Measurements

- Workflow completion and completed runs with usable passing/failing execution.
  Finding a real defect is a useful outcome; all tests passing is not the goal.
- Initial/final seeded-fault detection, reconstructed from the original failed
  generated node and its passing counterpart on an externally corrected copy.
  Reference witnesses and probe evidence must match the saved source and patch.
- Detection preservation among runs that initially detected a seeded fault. No
  initial detection means an unavailable rate, not perfect safety.
- End-to-end run latency, including failed runs, excluding external reference
  probes; provider-reported input/output/total tokens and request errors. Unknown
  token usage remains unavailable. Currency cost is not inferred.
- Paired raw mutation killed counts only when there are two actual complete
  measurements with identical scope, mutant IDs and diffs. A single attempt is not
  duplicated as an improvement pair. Raw counts are not a relevance/equivalence-
  reviewed mutation score.
- Retained failure diagnoses, blocked tests, final failing nodes and refinement
  history for case-level inspection.

Independent semantic accuracy, finding Precision/Recall/F1, diagnosis Macro-F1 and
reviewed mutation scores remain unavailable until references and outputs receive
human review. Existing review/scoring tools remain available via the benchmark
README; no human reviewer or review flag is manufactured by this experiment.

## Limits to state alongside figures

Historical runs used a fixed configuration order. New runs rotate configurations within each case/repetition; project order remains fixed. API cache,
model-service variability and time drift are not controlled. Do not interpret
latency differences as a randomized causal result. Repetitions within a project
are correlated; three projects do not support general effectiveness claims or
population confidence intervals. Defect probes use two deliberately seeded faults.
No improvements, incomplete mutations and unavailable results must stay visible.
The model that proposes and reviews tests is the same configured model; this is
separate-call self-checking, not independent correctness validation. Figures show
recorded counts and distributions rather than an overall product-quality score.

The recorded model name is a provider alias, not a frozen set of model weights.
Pinning source and Docker inputs does not guarantee identical future API outputs.
