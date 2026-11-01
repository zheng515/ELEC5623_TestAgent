# Baseline configurations and evidence requirements

Policy v22 uses `examples/experiments-baselines.json` as the default CLI matrix:
three projects, four independent configurations, three repeats and 36 planned
workflows. Source, requirements, model, image and request budget are fixed per
case. The `proposal` protocol rejects omitted configurations, disabled mutation
and shared/seeded substitutes. Validation alone makes no model calls.

For bounded acceptance, `examples/experiments-smoke.json` uses the same definitions
on Click 8.1.7 with one repeat: four paid workflows and at most 32 model requests
per workflow. It checks configuration and execution paths, not repeat stability,
held-out effectiveness or superiority. The complete repeated matrix remains a
separate command; a smoke run does not silently start it.

The [retained v21 smoke](../experiments/results/v21-independent-smoke-2026-11-02/README.md)
attempted all four configurations on frozen `b16b7ac`. B0/B1 completed; B2/B3
exhausted their 32-request caps during mutation-pair review, with incomplete
mutation evidence. This is a failed acceptance gate, not a completed repeated
matrix or evidence of B3 superiority. See its budget analysis before spending on
the full matrix; changed budgets or review policy require a separate study.
Current manifests declare the same four-request, 60-second review budget for
B2/B3 inside the unchanged 32-request global cap. See the
[v22 semantics and engineering validation](mutation-review-budget.md).
This change does not replace v21 failures or establish v22 model effectiveness.

| Configuration | Model input and control flow |
| --- | --- |
| B0 - Direct LLM | Requirements and bounded implementation code; no existing-test code/catalog, repository documents, semantic analysis, diagnosis or feedback refinement. |
| B1 - Grounded Test Generator | Adds repository context and retrieved document bodies; direct generation without analysis or feedback refinement. |
| B2 - Full Agent without Failure Diagnosis | Requirement-quality analysis, behavior gaps, reviewed generation, execution, mutation-guided improvement and re-measurement; failed generated artifacts are selected for repair without cause classification. |
| B3 - Full Verification Agent | Same full workflow plus grounded failure diagnosis before repair eligibility is decided. Valid implementation failures remain evidence. |

B0/B1 B/T IDs are bookkeeping only. Existing-test measurements are saved but never
sent to their generation requests. B0 excludes conventional and actually collected
test files. B1/B2/B3 prioritize retrieved document bodies within the recorded
context budget; omitted files remain explicit. Configured capabilities are not
claims that every stage completed. Unresolved failures may prevent mutation.

All configurations share sandbox, source integrity, schema/original-quote checks
and recorded request budgets. B0/B1 execution eligibility is not model-reviewed
approval. Both full agents share semantic admission and the one-improvement limit.
B2 cannot bypass those guards to manufacture bad results: its repair attempt may
be rejected. B2 records no fabricated
`generated_test_error` diagnoses; its diagnosis Macro-F1 is not applicable.
Reference failure labels can still measure actual incorrect repairs. Compare
B2/B3 repair safety and retained failures, then assess B3 diagnosis against
qualified references rather than invent a B2 diagnostic accuracy.

Controlled shared-preparation modes remain covered by regression tests. They
isolate diagnosis and repair selection; the independent full-workflow matrix
also includes generation variability. The retired shared-initial model studies
and their dedicated manifests were deleted. Neither design guarantees a B3 advantage.

The v20 B2/B3 pilot is a separate four-run custom subset on two existing synthetic
fixtures. Both configurations detect its boundary fault. It exposed a repeated
approved executable being recorded as an improvement; v21 filters such proposals
under the same rules in both configurations. No post-fix model run or natural
test-error repair opportunity is claimed for that pilot. The separate v21
controlled recovery study has six seeded workflow rows and two common
preparations. Both full arms repair the admission-rejected import; both strengthen
the rejected boundary candidate and retain detection, but fail literal
unchanged-artifact retention. Initial runtime diagnosis was not exposed. The
no-op guard was not exercised by these model proposals. A separate type-complete
follow-up admits the adaptive boundary candidate: both full arms retain it
literally unchanged and B3 diagnoses its executed failure. The earlier blocked
result remains, and these repeated candidates are not independent samples.
See the experiment inventory.

## Rubric traceability

| Criterion | Engineering evidence | Remaining evidence |
| --- | --- | --- |
| Product completeness and technical implementation | Shared production orchestrator, four executable profiles, safe tools and end-to-end regressions. | Freeze the demonstrated revision and run the new matrix before claiming measured effectiveness. |
| GenAI engineering and system architecture | Context boundaries, structured outputs, contract review, grounded B3 diagnosis, bounded actions and recorded capabilities. | Semantic validation; schema validity is not correctness. |
| Evaluation, evidence and critical analysis | Full baselines plus separate ablations, source/model/image identities, resource usage, reference replays, failed/missing rows and non-applicable metrics. | Qualified C1/C2/C3 annotations remain necessary for independent precision/recall/F1. |
| Novelty and positioning | Internal baselines test project mechanisms; related-work analysis distinguishes overlap and contribution. | B0/B1 are not Codex/Claude measurements and do not establish external-product superiority. |
| Alignment with Track A | Requirements lead to executable tests, tool evidence, diagnosis and bounded action selection. | Demonstrate the user workflow on the assessed source revision. |
| Product quality and workflow | Website remains B3; experimental variants stay in the CLI; failures and uncertainty remain visible. | Independent first-user usability evidence. |
| Documentation and team delivery | Setup, architecture, protocol and commands are maintained. | Team contribution confirmation and the academic report remain pending. |

This technical checklist is not the academic report or an automatic full-mark
claim. Exact baseline-skip handling, bounded mutation evidence and generated-test
execution scope remain covered by Docker regressions. Tool-only and scripted
checks are separate from model quality. One repeat does not measure stability.
