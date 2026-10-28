# Repeated decision evaluation

Model: gpt-6-luna
Dataset purpose: development challenge cases; not held out.
This evaluates raw model classification, not whole-agent test admission or diagnosis grounding. Fixture trace summaries are synthetic. Classifications use the production tasks and reason function.

Valid decisions: 48/48. Unanimous cases: 15/16. Missing/invalid: 0.
Integrity: hashed_inputs_reference_tasks_and_agent. Reference hash: ba3886c2118b51994ef591fa79c5c401220a629b31c9d9aecba15fa1a574c807. Attempts hash: 95b26229ab9deae0fe4b089db1f065ed6cb59f41d6fa30c3abec0f144fb2af72.
Requests attempted / planned: 48/48; failed: 0.
Provider total tokens: 81658; known subtotal: 81658; requests without total-token usage: 0.
Request latency median / p95 (ms): 3610 / 5369.
Provider-reported usage only. Unknown usage is not zero; known subtotals are not complete bills. Latency includes failed attempts and excludes offline scoring. No currency cost is inferred.
Consistency is agreement on identical inputs, not correctness. Errors and missing repeats remain in the denominator.
Reference status: ai_assisted_reference. Independent accuracy fields require human review and all planned valid decisions. AI-assisted reference comparisons are explicitly labelled development agreement.

Classification accuracy: unavailable; diagnosis accuracy: unavailable; false-support rate: unavailable.

Test-admission precision / recall / F1: unavailable / unavailable / unavailable.
Diagnosis Macro-F1: unavailable across 0 represented classes. Inspect diagnosisConfusion in metrics.json.
Raw component classifications only. AI-assisted referenceComparison measures agreement with the specified development labels, not independent human accuracy. Independent accuracy fields require human-reviewed references. Missing/invalid attempts prevent scoring; confusion/Macro-F1 require single-label references and exclude absent classes.

Reference comparison basis: ai_assisted.
Agreement with reference: 0.9791666666666666; diagnosis agreement: 1.
Admission precision / recall / F1 against reference: 0.9 / 1 / 0.9473684210526315.
Diagnosis Macro-F1 against reference: 1. Inspect referenceComparison.diagnosisConfusion in metrics.json.
AI-reference agreement is not independent human accuracy, external validation or a held-out result.

| Case | Component | Repeated labels | Reference labels |
| --- | --- | --- | --- |
| C01 | test_review | blocked, blocked, blocked | blocked |
| C02 | test_review | blocked, blocked, blocked | blocked |
| C03 | test_review | supported, blocked, blocked | blocked |
| C04 | test_review | blocked, blocked, blocked | blocked |
| C05 | diagnosis | generated_test_error, generated_test_error, generated_test_error | generated_test_error |
| C06 | diagnosis | potential_implementation_defect, potential_implementation_defect, potential_implementation_defect | potential_implementation_defect |
| C07 | diagnosis | generated_test_error, generated_test_error, generated_test_error | generated_test_error |
| C08 | diagnosis | generated_test_error, generated_test_error, generated_test_error | generated_test_error |
| C09 | diagnosis | environment_failure, environment_failure, environment_failure | environment_failure |
| C10 | test_review | supported, supported, supported | supported |
| C11 | test_review | supported, supported, supported | supported |
| C12 | test_review | supported, supported, supported | supported |
| C13 | test_review | blocked, blocked, blocked | blocked |
| C14 | diagnosis | generated_test_error, generated_test_error, generated_test_error | generated_test_error |
| C15 | diagnosis | requirement_ambiguity, requirement_ambiguity, requirement_ambiguity | requirement_ambiguity |
| C16 | test_review | blocked, blocked, blocked | blocked |

Inspect cases.json, attempts.json and disagreements.json. For later review, create a separate reference file and use score ROOT --reference PATH --reason TEXT. Retain AI provenance when recording genuine human review; never overwrite the frozen reference. Do not copy predictions into reference labels.
Re-score without model calls: npm run evaluate:decisions -- score /Users/jingxiao/Documents/26s2/5623/ELEC5623_TestAgent/experiments/results/2026-10-28-v12/decisions
