# Focused-context model acceptance

Date: 2026-10-27. Policy: contract-witness-v7-focused-context.
This is a small development acceptance check, not a held-out benchmark,
independent accuracy evaluation, repeated reliability study or final academic report.
The historical six-run pilot remains unchanged.

## Four component observations

The model received four captured production follow-up contexts and production tasks.
Initial analysis, candidate tests and admission were scripted to reach each target
stage. The failure traces were captured from real Docker execution. These four
requests assess raw review/diagnosis outputs, not four complete Agent workflows.
Draft expected labels were outside model inputs and remain independently unreviewed.

| Controlled input | Observed model decision | Tokens | Model request time |
| --- | --- | --- | --- |
| ValueError test adds an unspecified exact message | Blocked | 1531 | 3.907 s |
| A large-order requirement gives no threshold | Blocked | 1494 | 2.249 s |
| A generated test imports a nonexistent module | generated_test_error | 2238 | 2.872 s |
| A valid boundary assertion fails on an exclusive implementation | potential_implementation_defect | 2115 | 4.174 s |

All four decisions matched the draft expectations. Original requirement quotes
matched their submitted text. Both diagnosis outputs cited real source/test/log
substrings. Exact matching establishes textual provenance, not semantic correctness.
No independent classification accuracy is reported. There was no positive admission
control or repeated model request in this small component set.

The four requests used 7378 provider-reported tokens. These are observations of
focused contexts only; no full-context control requests were made. Smaller input
bytes from deterministic tests must not be presented as measured token savings.

## One complete Booking workflow

The existing Booking project, SRS and external contract witnesses were run through
the current B3 pipeline once, using examples/experiments/context-acceptance.json.
Reference labels, corrections and witness checks were outside model context.

- Completed with five passing outcomes and one failing outcome, no errors or skips.
  Counts include one existing test and five approved generated artifacts.
- The generated exact-24-hour check detected the seeded inclusive-threshold defect.
  The Agent diagnosed a potential implementation defect and retained the assertion.
- No implementation code was changed and no test improvement was applied.
- All five generated checks passed on the separately corrected reference copy.
- Agent wall time was 39.966 seconds, excluding external reference probes.
- Five model requests used 17389 provider-reported tokens.
- The first analysis contained a fabricated/paraphrased README quotation. Exact
  source validation rejected it. The single permitted analysis correction succeeded;
  the original response and validation failure remain in report.json.

This acceptance demonstrates that the current pipeline can recover from this
citation error and preserve this particular defect. It does not show that the model
always identifies hallucinations, that refinement improves detection, or that the
focused policy has lower cost. The historical v6 Booking observation used four
requests, 14381 tokens and 27.265 seconds. The new observation used more resources;
one observation per version, different generated suites, caching and service time
prevent a causal before/after comparison.

Across the component checks and full workflow, there were nine paid model requests
and 24767 reported tokens, with no automatic provider retries or repeat runs.

## Evidence and reproduction

- components/index.json: input/source hashes, raw labels, provenance checks,
  serialized context bytes, request time and full provider token usage.
- components/inputs/: four exact model inputs and tasks; draft labels are not in them.
- components/*-output.json: original structured model decisions.
- components/agent-snapshot.json: frozen implementation and fixture source.
- components/replay.mjs: a reproduction helper derived from the executed
  TypeScript runner, with native ESM/CommonJS import compatibility and a help flag. New execution makes four paid
  requests against the current workspace implementation; it is not an offline score.
- booking/evidence/: frozen project ZIP, SRS, source snapshot, external witnesses,
  report, request records, reference replay and unreviewed annotation templates.
- booking/metrics.json and booking/failure-cases.json: objective workflow observations.
- verification.json: automatic integrity, quote, fault-retention and replay checks.
- artifact-hashes.json: hashes of the exported acceptance files.

Recompute the full-workflow metrics without model requests:

```sh
npm run experiment:analyze -- experiments/acceptance/2026-10-27-focused-context/booking/evidence/index.json /tmp/reqtest-v7-acceptance-rescore
```

The separate five-project benchmark is still paused. Agree on experimental cases,
controls and repetitions before spending on another comparison. A useful next change
is reducing citation-copying errors without weakening exact-source validation.
