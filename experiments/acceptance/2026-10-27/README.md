# Integrated local acceptance

Date: 2026-10-27. These are development acceptance checks of the integrated
working tree: one synthetic Shipping project in two implementation conditions.
They are not a formal experiment, benchmark, independent model-accuracy evaluation
or an independent user study. No benchmark runner was started.

The correct case uses four line-based requirements and one existing test. The
defective case uses the full numbered SRS and no existing tests. Their output
counts and latencies must not be interpreted as a controlled comparison.

| Check | Actual result | Meaning |
| --- | --- | --- |
| Correct implementation, fresh model run | Four requirements, four behaviors, eight approved generated tests plus one existing test; nine passes, no failures/errors/skips. Strict CI exited 0. | This particular run completed the verification pipeline and all four behavior states were Verified. |
| Known threshold defect, fresh model run | Four numbered requirements, five behaviors, five approved generated tests; four passes and one failure. Strict CI exited 1 as expected. | The original 10000-cent assertion failed. The Agent recorded a potential implementation defect and retained the assertion without an improvement or implementation edit. |
| Exported tests, separate execution | Correct copy: nine passes. Defective copy: four passes and one failure. Both recorded intact execution. | The exported suites reproduced the original outcomes without new generation. |
| Saved-suite execution | Nine passes, unchanged suite/source fingerprints, zero model calls. | Repeating saved tests is separate from fresh model analysis. |
| Mutation relevance on the correct copy | Seven killed, two survived; eight grounded survivor/behavior decisions. | Each survivor was judged separately against all four mapped behaviors. Raw counts are not an independently reviewed mutation score. |

## Evidence

- [Correct implementation](integrated-shipping/result.json): `report.json`,
  `tests.zip`, `source.zip`, `export-replay.json`, and `saved-suite-replay.json`.
- [Known defect](integrated-defect/result.json): `report.json`, `tests.zip`,
  `source.zip`, the complete `SRS.md`, and `export-replay.json`.
- [Validation manifest](validation.json): source file hashes, immutable image
  references in the reports, regression results and browser-check scope.
- `implementation.zip`: selected app, component, library, sandbox and CLI source
  plus the dependency lock. No environment files, credentials or account data.
  The base commit is recorded, but the assessed code also includes uncommitted
  changes; the archive and hashes identify the actual tested implementation.

The integrated regression had 102 passing tests, two optional skips and no failures.
Build, typecheck, lint and English-source checks passed. Browser checks used mocked
transport and saved/synthetic records, including rejected retries, request failures,
automatic document text, downloads, and expanded evidence at 320/390/768/1440 px.
Those browser checks are not independent usability evidence.

## Repeat deliberately

These commands make paid model requests and can produce different proposals:

```sh
npm run verify -- examples/verification.json
npm run verify -- experiments/acceptance/2026-10-27/integrated-defect/verification.json
```

The second command should reject the defective implementation; exit 1 is expected.
Inspect its evidence rather than treating every nonzero exit as an infrastructure
failure. To replay a saved export, extract its `source.zip` and `tests.zip` into an
empty directory and run `python -m pytest tests reqtest_generated` for the correct
copy, or `python -m pytest reqtest_generated` for the defective copy. Match the saved
Python/pytest environment. No model call is needed for this replay.

These two outcomes do not establish reliability across projects, semantic accuracy,
exhaustive coverage or superiority over another system. Human review and the agreed
formal experimental protocol remain separate work. No account history was populated
by these CLI checks.
