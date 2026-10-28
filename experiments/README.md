# Current experiments

Policy v16. Only `results/v16-current/` contains retained experiment results.
Older v12/v14/v15 and initial open-source pilot results, raw runs, preflights,
component predictions and review packs were deleted at the owner's request.
Their metrics are no longer part of the current evidence.

[Current results and limitations](results/v16-current/README.md) cover:

| Study | Completed / planned workflows | Interpretation |
| --- | ---: | --- |
| Full projects | 18/18 | Click, Packaging and Werkzeug; shared B1/B3 candidates |
| Stopped context study | 11/27 | Failed, cancelled and missing observations remain explicit |
| Diagnosis ablation | 27/27 | Shared preparation; admission rejection is not runtime diagnosis |
| Typed valid failure | 9/9 | Adaptive overstrict candidate revision |
| Semantic valid failure | 9/9 | Adaptive candidate; copied execution-citation failures retained |
| Execution-reference regression | 9/9 | Same-case engineering follow-up with exact log references |

Five completed studies contain 72 workflows and 18 common preparations. The
stopped study remains separate. Source revisions, costs, raw requests, failures,
plots and all 245 sealed artifacts remain unchanged. Current private raw studies
were matched byte-for-byte to their exported archives before cleanup.

[Reproduction inputs](../examples/real-projects-v16/README.md) and
[evaluation protocol](../docs/evaluation-protocol.md) describe the current scope.
Repeated and adaptive cases are not independent unseen projects. No independent
semantic accuracy or external-product superiority is claimed.

Reusable source fixtures and fixed witnesses remain for regression tests. The
16-case AI-assisted reference and its original trace inputs now live under
`tests/fixtures/decision-reference*`; they are test data, not current model-study
results or human annotations. Application runs, accounts and backups were not
changed. No new model calls were made during cleanup.
