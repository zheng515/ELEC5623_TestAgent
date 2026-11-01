# Controlled test-recovery acceptance

Two deliberately seeded development candidates, one repeat, shared preparation
and B1/B2/B3. This custom subset isolates diagnosis and downstream repair selection;
it is not the complete independent B0-B3 matrix, a natural model-error sample,
a held-out benchmark or the academic report.

| Case | Original contract | Deliberate intervention | Objective check |
| --- | --- | --- | --- |
| shipping-candidate | Line 2 of examples/shipping/SRS.md | T1 imports absent shipping_fee instead of shipping; the threshold assertion remains supported. | A changed approved T1 must pass both project execution and separate fixed-witness reference replay. |
| booking-candidate | R1 of examples/benchmark/booking/SRS.txt | T1 correctly asserts the inclusive boundary; existing booking.py has > instead of >=. | Original T1 must remain unchanged and fail on the original source, then pass on a separately corrected copy. |

The source projects and existing tests are reused unchanged. Focused requirements
are verbatim original bodies. Witnesses and reference labels are outside the
model-visible projects. Labels are developer/AI-assisted and reviewed=false.
They are not independent diagnosis accuracy labels. No expected decisions or
reference patches enter model context; admission is never bypassed.

B1 executes the seeded candidates without model calls. One B3 prepare-only prefix
per case performs analysis, admission and execution before diagnosis. B2/B3 clone
that exact state and share the same six-request follow-up ceiling. Mutation is
disabled to isolate failure handling. Every arm permits one reviewed improvement.
Total worst-case paid requests: two cases times (six preparation + six B2 + six B3),
or 36 requests; B1 consumes none. No automatic retries or replacement attempts.

If admission rejects the bad import, record admission recovery separately from
runtime diagnosis. A blocked test is not an exposed runtime failure. If a model
misclassifies the defect, preserves the broken test or fails a citation check,
retain that observation. One repeat cannot estimate stability or superiority.

```sh
# Fixed-witness preflight; no model calls.
npm run evaluate -- examples/experiments-recovery-smoke.json --validate-only
# Six declared workflow rows plus two common preparations; paid requests as above.
npm run evaluate -- examples/experiments-recovery-smoke.json
```

## Typed-candidate follow-up

`examples/experiments-retention-followup.json` selects one further booking case,
using the type-complete T1 produced by the observed B3 correction. Provenance is
in `typed-followup.provenance.json`. This is an explicitly adaptive candidate,
not another independent project or a replacement for the original study. It
plans three workflow rows and one preparation, with at most 18 additional model
requests. Its actual study used four; both studies together used 17 requests,
below the initially declared 36-request ceiling.

The [original study](../../experiments/results/v21-controlled-recovery/README.md)
and [follow-up](../../experiments/results/v21-retention-followup/README.md)
retain different inputs and outcomes. Both full arms retained the admitted
failing candidate literally unchanged in the follow-up. This does not establish
runtime generated-test-error repair or a B3 detection advantage.
