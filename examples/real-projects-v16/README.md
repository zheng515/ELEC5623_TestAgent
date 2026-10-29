# v16 real-project validation and controlled follow-ups

These technical inputs extend the approved/submitted Track A project. No academic
report is authored. All reference inventories are developer/AI-assisted, not
independent human annotations. Sources, contracts and perturbations are explicit.

Start in a fresh checkout/evidence workspace to preserve previous attempts.
Keep existing configuration and application data. Node 22, Python 3 and Docker
are required. Image preparation downloads registry dependencies; project execution
uses disposable offline sandboxes. Never place secrets in imported projects.

```sh
python3 scripts/prepare-real-projects.py
docker build -t reqtest-python:1 sandbox
docker build -f examples/real-projects/Dockerfile -t reqtest-real-projects:2 examples/real-projects
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npx tsx scripts/preflight-real-projects.ts

# Actual paid model calls; source/model/image/inputs and all outcomes are retained.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-projects-v16.json

# Prepare all five frozen cases once; requirements and candidates are read unchanged.
python3 scripts/prepare-real-challenges.py
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-challenges-v16.json

# Adaptive candidate revisions: these are not independent new projects.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-typed-v16.json
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-semantic-v16.json
```

To prepare only one study, pass its manifest to `scripts/prepare-real-challenges.py`.
Per-study summary and plotting scripts live with their frozen results under
`experiments/results/v16-current/rendering/`; active analysis uses the shared
`npm run experiment:analyze` and `scripts/plot-experiment.py` entry points.

Current code includes exact execution-line references. Historical studies use
three distinct frozen source snapshots; running these commands now creates new
observations under current code. Reanalyse original archives to inspect prior
results. Do not aggregate adaptive candidates as independent projects or suppress
admission blocks, context errors, uncertainty or failed assertions.

The latest same-C05 execution-reference regression isolates an engineering
revision with the same model, image, contract, candidate and request ceilings.
Both B2 and B3 preserve its valid failure; model categories are checked against a
controlled developer fixture reference. No external-product superiority or
independent semantic accuracy is established.

[All results, source revisions, figures and validation](../../experiments/results/v16-current/README.md)
and [protocol](../../docs/evaluation-protocol.md) explain the completed and stopped
attempts. A study can be archived without losing evidence:

```sh
npm run experiment:analyze -- .evidence/evaluation/EXPERIMENT/index.json experiments/results/STUDY
python3 scripts/archive-experiment-evidence.py experiments/results/STUDY --remove-exported-copy
```

The archive verifies every original byte before removing its redundant exported
directory. The original `.evidence/evaluation` run directory is not removed.
