# Current experiments

Frozen implementation: `bd12d236fe65009ba02655f48556b0b397e3f575`, tag
`v22-benchmark-freeze`, policy `contract-witness-v22-bounded-mutation-review`.

Start with the [benchmark summary](results/v22-summary/README.md) and
[predeclared plan](v22-benchmark-plan.md). The three separately analyzed studies
completed all 48 workflows, with zero workflow failures/missing rows and zero
unknown usage: **286 requests / 16,994,380 provider-reported tokens**.

| Study | Scope | Recorded result |
| --- | --- | --- |
| [Independent smoke](results/v22-independent-smoke/README.md) | Click, B0-B3, one repeat | 4/4 completed; two limited assessments; 25 requests / 1,507,751 tokens. |
| [Real-project matrix](results/v22-real-project-matrix/README.md) | Click, Packaging, Werkzeug; B0-B3; three repeats | 36/36 completed; 397 final generated nodes pass; all 36 reference replays usable; 12 limited assessments; 240 requests / 15,392,920 tokens. |
| [Synthetic fault supplement](results/v22-fault-cases/README.md) | Booking and Inventory; B0-B3; one repeat | 8/8 completed; every configuration detects both faults and preserves detection; B3 records two grounded diagnoses; 21 requests / 93,709 tokens. |

B3 demonstrates an explicit decision trace, not extra defect detection. Full arms
use more resources on the real-project contracts without a measured execution
advantage. No admitted generated runtime-error repair opportunity appears;
repair effectiveness remains unavailable. All cases are development inputs,
with developer/AI-assisted contracts and witnesses, not independent human labels.
No independent semantic accuracy, diagnosis F1, reviewed mutation score, external
competitor advantage or user-study result is claimed. Repeats share projects.

Each study has a byte-verified archive, exact identities, JSON/CSV, original log
and post-run source checks. All six standard analysis outputs reproduce exactly
from each archive without model calls. Study denominators are not pooled;
only actual resource totals are added. Rerunning a manifest creates new paid data.

[Production UI acceptance](results/ui-workflow-2026-11-01/README.md) remains separate
engineering evidence for authentication, upload, GitHub preflight, queue/Docker
saved-suite replay, exports, account isolation and responsive checks. Its large
layout fixture is not a model observation or independent human usability study.
The website Evaluation page remains scoped to individual runs; benchmarks stay offline.

The owner requested retirement of old experiments after the new studies finished.
[Current cleanup](cleanup-v22.json) removes whole v20/v21 studies and their old raw
workspaces/configurations, including successes and failures; exported evidence is
recoverable from Git revision `bd12d23`. [Earlier cleanup](cleanup.json) records
prior v16-v19 retirement. Removed studies are excluded from current metrics.
Pinned inputs, active regression fixtures, application accounts/runs, credentials,
backups and production UI acceptance are preserved. No academic report was written.

See [evaluation protocol](../docs/evaluation-protocol.md),
[baseline definitions](../docs/baseline-configurations.md) and
[pinned input setup](../examples/real-projects/README.md).
