# Admitted valid-failure retention under v21

A single adaptive development follow-up on 2026-11-01, using gpt-6-luna and
unchanged policy v21. The preceding [controlled recovery study](../v21-controlled-recovery/README.md)
blocked its value-only boundary candidate for missing the promised integer-result
check. This follow-up freezes the complete T1 produced by that study's B3
correction, including its type witnesses. Source and original requirement are
unchanged. `candidate-provenance.json` identifies the parent archive and artifact.

This is not an independent new project, natural initial test generation, a held-out
benchmark or a code-version effectiveness comparison. The unsuccessful earlier
literal-retention result is retained separately and is not replaced.

## Observed execution

All three workflow rows and the common preparation completed. B1 executes the
fixed seed with zero model calls. The common analysis/admission prefix approved
T1 and executed its real failure on the original boundary-fault implementation.
B2 and B3 reused that exact reviewed suite and analysis.

| Arm | Initial approved failure | Final original test | Fault detection | Decision |
| --- | --- | --- | --- | --- |
| B2 | Exposed | Code and function unchanged | Retained; matching pass on corrected copy | One improvement request returned no replacement artifacts; none applied. |
| B3 | Exposed | Code and function unchanged | Retained; matching pass on corrected copy | Execution-phase potential implementation defect with original requirement, source, test and log evidence; no improvement requested. |

Strict literal valid-failure retention is **1/1 in each full arm** for this
specified candidate. That single-case result is not an independent accuracy or
population safety rate. B3 detects no additional defect over B2; it supplies an
inspectable explanation instead of an empty repair proposal. No unchanged-code
proposal was returned, so this model study does not exercise the exact v21 no-op
filter. Its scripted Docker regression remains separate.

The external fixed witness fails before and passes after the declared correction.
The Agent never patches the original implementation. All original source bytes
match the frozen project archive, and the final failing checks keep the requirement
Uncertain. In particular, a successful workflow is not a passed requirement.

## Resources and boundaries

Common preparation: 2 requests / 6,895 tokens. B2 continuation: 1 / 3,851.
B3 continuation: 1 / 4,110. Actual billed-request accounting counts the preparation
once: **4 model requests and 14,856 provider-reported tokens**. Strategy totals
in `paired-comparison.json` include the common prefix separately; do not add them
as actual billing. No request error, retry, replacement or exhausted budget occurred.
B2 ran first. One repeat cannot establish cost, latency or stability superiority.

Together with the parent study: 17 actual requests / 60,574 known tokens. Do not
pool their repeated/adapted boundary candidates as independent accuracy samples.
The bad-import correction in the parent study remains admission-driven; no current
study exposes and repairs a generated-test error after admission. Independent
semantic accuracy, diagnosis F1 and reviewed mutation scores remain unavailable.
Mutation is disabled to isolate failure handling; labels are developer/AI-assisted
and reviewed=false. No academic report has been authored.

## Reproduction

The archive contains 23 exact frozen evidence files. `controlled-observations.json`
records original-code retention, source integrity, diagnosis and corrected-copy
checks. `recovery-metrics.json` and `diagnosis-exposure.json` retain the narrow
measurements; figures show fault detection, resources, literal retention and
initial runtime exposure.

```sh
unzip experiments/results/v21-retention-followup/evidence.zip -d /tmp/reqtest-v21-retention
npm run experiment:analyze -- /tmp/reqtest-v21-retention/index.json /tmp/reqtest-v21-retention-analysis
# New paid observations under current code, not exact output replay:
npm run evaluate -- examples/experiments-retention-followup.json
```
