# AI-assisted decision annotations

Annotated 2026-10-28 by OpenAI Codex from original rules, source, candidate assertions and actual saved Docker outcomes. This is an annotation worksheet, not the academic report or independent human review.
All 16 cases are annotated. reviewed remains false, reviewer remains blank and independentHumanReviewed remains false. The same assistant contributed to the implementation and fixtures; do not describe these as independent ground-truth labels. No application model-evaluation run was started.

[Machine-readable labels and exact evidence](reference.ai-assisted.json) | [Original reviewer evidence](../../reviews/2026-10-27-contract-decisions/cases.json)

| Case | Component | AI-assisted label | Actual execution | Rationale |
| --- | --- | --- | --- | --- |
| C01 | test_review | blocked | passed | The assigned behavior includes both integer return type and zero value. The assertion fee(10000) == 0 checks the value only: it also accepts 0.0 or False. Under the current admission policy, the claimed type coverage is insufficient even though this implementation passes. |
| C02 | test_review | blocked | failed | The requirement explicitly returns zero at the inclusive threshold, but the candidate expects 1000. The observed result is zero, so this is a contradictory assertion, not an implementation defect. |
| C03 | test_review | blocked | passed | The test compares both returned instants with datetime values but has no predicate establishing that the actual results are datetimes. Under the assigned behavior and current admission policy, a value equality check does not establish the promised semantic return type. |
| C04 | test_review | blocked | failed | The contract requires datetime results preserving the instants; it does not require ZoneInfo("Australia/Sydney") as the timezone object. The extra timezone-object assertion is unsupported and fails on the fixed-offset result from datetime.fromisoformat. |
| C05 | diagnosis | generated_test_error | failed | The failing operation expects fee(10000) == 1, while the original requirement explicitly requires zero. The implementation returns zero as recorded in the failure. The unsupported expected value is in the generated test. |
| C06 | diagnosis | potential_implementation_defect | failed | The value assertion fee(10000) == 0 is directly supported by the inclusive >= 10000 requirement. The implementation uses > 10000 and the recorded result is 1000. Preserve this justified failing assertion and investigate the implementation boundary. |
| C07 | diagnosis | generated_test_error | failed | The recorded failure occurs at start.tzinfo == ZoneInfo("Australia/Sydney"), after the instant comparisons. The original contract does not require that timezone object. The unsupported representation assertion causes this failure. |
| C08 | diagnosis | generated_test_error | failed | The original requirement says only that the cancellation fee shall be reasonable; it does not require zero for amount 10000. The generated artifact invents that exact expectation. Under the declared diagnosis precedence this is a generated-test error, with the vague requirement recorded as context. |
| C09 | diagnosis | environment_failure | error | Collection fails while delivery.py imports delivery_transport, before notify() can be called. The generated test correctly imports the supplied delivery module. Classify the unavailable implementation dependency as an execution environment blocker. |
| C10 | test_review | supported | passed | The candidate checks fee(10000) at the explicit inclusive threshold, checks semantic integer type while excluding bool, and separately checks zero value. Those obligations are all present in the original requirement and the recorded execution passes. |
| C11 | test_review | supported | passed | The candidate explicitly checks both actual results with isinstance(..., datetime) and separately checks preservation of both supplied instants. It introduces no requirement for a particular timezone object and passes in the recorded execution. |
| C12 | test_review | supported | passed | The requirement explicitly requires ValueError for a negative amount. The candidate calls fee(-1) within pytest.raises(ValueError), checks exactly that exception category without specifying message text, and passes. |
| C13 | test_review | blocked | failed | The original rule specifies ValueError but no error-message text. The candidate additionally requires the regex Amount must be positive. Execution raises the required ValueError and fails only because its message is invalid amount. The extra message obligation is unsupported. |
| C14 | diagnosis | generated_test_error | error | The submitted source module is shipping.py, but the generated test imports invented_shipping. Collection fails on that import before reaching the target. This contradicts the supplied layout and is a generated-test setup error. |
| C15 | diagnosis | requirement_ambiguity | failed | At amount 10000 the original >= clause requires zero and the <= clause requires 1000. Both clauses apply simultaneously. The test follows the first clause and the implementation follows the second; the recorded failure cannot resolve the conflicting contract. |
| C16 | test_review | blocked | passed | The original requirement does not define large or specify a threshold. The candidate assumes that amount 10000 must return zero. Passing execution agrees with the implementation but cannot justify an expectation absent from the contract. |

## Important distinctions

- C01/C03 are blocked under the current assigned-coverage policy despite passing. A focused value-only assertion is not inherently unsupported, but it cannot claim a separate semantic type check.
- C06 diagnoses a justified failing value assertion; missing a separate type assertion does not turn that failure into a test error.
- C08 invents an exact value under a vague rule. C15 instead follows one of two explicitly conflicting clauses. The declared classification precedence distinguishes them.
- C09 identifies a missing dependency in the implementation import chain. It does not establish the ultimate packaging/environment cause. C14 is a bad import introduced by the generated test itself.
- Passing execution in C16 cannot define the meaning of large in the original requirement.

## Reuse and next step

The blank reviewer pack is unchanged. For independent review, give a teammate the original blank pack before showing these annotations or draft answers. They must check/correct decisions and document their own evidence and name. Do not simply relabel these AI annotations as human-reviewed.
These annotations are now accepted as development reference answers at the project owner's request. The source remains AI-assisted and reviewed=false. The runner reports referenceComparison agreement, admission Precision/Recall/F1 and diagnosis confusion/Macro-F1 against these specific labels. Independent-human accuracy fields remain unavailable. Missing/invalid planned decisions still prevent scoring.

Run a new component study with this reference (paid model calls, not started by this change):

```sh
npm run evaluate:decisions -- 3 --reference experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json
```

Frozen references preserve AI authorship, acceptance and exact evidence. Changing reviewed=true alone cannot upgrade an AI reference whose independentHumanReviewed flag is false.
No model outputs were invented to compute scores. No annotation is supplied to the application Agent as an operational instruction.
