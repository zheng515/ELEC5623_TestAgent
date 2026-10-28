# Runtime diagnosis development cases

These neutral-ID, developer-seeded cases probe runtime failures after the same
analysis and admission preparation. No reference category is sent to the model.

| ID | Known fixture construction | Expected category |
| --- | --- | --- |
| D01 | A two-file threshold implementation excludes equality. | potential_implementation_defect |
| D02 | The implementation imports an unavailable transport only when called. | environment_failure |
| D03 | A test consumes the generator during a type check, then checks the exhausted iterator. | generated_test_error |

Expected categories are developer fixture references, not independent labels.
D02 has no functional reference oracle: the transport is intentionally unavailable,
so the implementation's contract cannot be validated in this environment.
D01 has a separately corrected-copy oracle; D03 has a single-consumption oracle.

Admission is never bypassed. A proposal rejected during common preparation is
reported as not exposed to runtime diagnosis, even when B1 executed it. The study
retains that outcome; it does not force an erroneous test through the review gate.
B2/B3 share identical preparation, source, suite and ceilings. The measurement
separates runtime exposure, diagnosis classification, repair attempts and literal
artifact preservation. It cannot establish general correctness or B3 superiority.

## Separate development revision: D04

D02's initial three-repeat study rejected the return-only candidate because its
assigned contract also required verifying the sending action. D02 remains frozen.
D04 is a separately declared case using the same unavailable-dependency source
with a narrower return-only contract. It was added after inspecting D02's admission
results, so it is an adaptive development case, not held out or confirmatory.
It keeps the same production admission gates and does not force approval.
Earlier runtime/dependency model studies and their top-level manifests were
removed. These sources remain reusable regression fixtures, not current model
observations. See [current studies](../../experiments/README.md).
