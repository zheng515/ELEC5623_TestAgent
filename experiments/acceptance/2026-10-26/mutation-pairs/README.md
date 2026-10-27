# Mutation-by-behavior review replay

Three real-model repetitions reuse the same shipping report, passing execution,
approved test code and surviving mutation diffs. The original report has four
behaviors in shipping.py and two survivors, with only two negative judgments.
The strict gate was blocked for every behavior because six required pairs were
missing. The production pair reviewer fills those six pairs; it does not propagate
one exclusion to another behavior. All three repetitions produced eight grounded
negative pair decisions, four Verified behavior states and a passing strict gate.

Tests and execution measurements remain byte-for-byte equivalent in the JSON
hash checks. This isolates review cardinality from fresh generation and execution.
The model receives the frozen original source, requirements and analysis plus the
pending pairs. Production review task, schema and admission functions are used;
the surrounding context is a smaller review-only replay, not a full new Agent run.
No target code is patched or rerun, and no independent semantic accuracy is claimed.

Inspect before.json, after-1.json through after-3.json and metrics.json. The snapshot
records the exact reviewer implementation and dependency versions. Source.zip
matches the original source fingerprint. Reproduce into a NEW directory with:

```sh
node --import tsx scripts/evaluate-mutation-pairs.ts experiments/acceptance/2026-10-26/mutation-pairs/before.json experiments/acceptance/2026-10-26/mutation-pairs/source.zip .evidence/new-pair-replay
```

This makes paid model requests and may return different judgments. Missing,
duplicate, unsupported, ambiguous or relevant pairs still prevent full verification.
Original single-behavior records are preserved and never silently upgraded.
