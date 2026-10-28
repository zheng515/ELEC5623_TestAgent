# Scoped public-project benchmark

Status: reusable public-module fixtures and a 30-workflow manifest. Previous
execution results were removed at the user's request on 2026-10-28. These inputs
do not establish current model performance. This benchmark runs outside the website. It is not the academic report or an external-product contest.

## Source and scope

Five actual open-source libraries supply the implementation and documentation.
Versions are selected for Python 3.11 compatibility and recorded by full commit
SHA in each case's provenance.json. Only the listed modules and APIs are included;
this does not evaluate the complete upstream applications or their full test suites.

| Project | Version | Selected API | Condition |
| --- | --- | --- | --- |
| more-itertools | 10.5.0 | grouper, roundrobin | No injected mutation |
| boltons | 24.0.0 | ceil, floor | Injected exclusive option boundary in ceil |
| python-slugify | 8.0.4 | slugify | Injected reversal of the lowercase condition |
| humanize | 4.11.0 | naturalsize | Injected decimal base for binary/GNU units |
| pathspec | 0.12.1 | from_lines, match_file, match_files | No injected mutation |

These are controlled mutations, not claimed upstream bugs or historical fixes.
Original source modules are copied intact except for the three declared patches.
The recipes, mathutils and filesize modules are imported directly from the fixture
root instead of their original package paths. Their function bodies are unchanged
by that import adaptation. Package source and licenses are retained. Each provenance
record maps copied files to the original bytes and identifies the reversible patch.

SRS.md is author-derived from fixed upstream docstrings and README excerpts. It
is not a native upstream SRS or an independently reviewed reference. Original
excerpts and source URLs are in project/API_DOCUMENTATION.md. Requirements and
witnesses cover selected finite examples, not every documented API behavior.
Reference labels, witnesses, patch metadata and provenance are outside the
model-visible project directory. Implementation docstrings remain visible.

## Frozen protocol

manifest.json fixes five cases, B0/B3 and three repetitions: 30 planned workflows,
15 per configuration. There are nine seeded-fault observations per configuration,
representing three distinct controlled defects repeated three times. Six runs per
configuration use the two cases without injected defects. No upstream existing
tests are included; this scope evaluates requirement-based generation on module
fixtures, not improvement over complete upstream suites.

B0 is direct generation with schema/original-quote checks. B3 adds analysis,
retrieval, model admission review, execution feedback, diagnosis and at most one
reviewed improvement. They share model, source, requirements and image, but have
unequal request budgets. B0 is not Codex, Claude or another commercial product.
The same model generates and reviews; that is self-checking, not independent review.

The dataset is marked pilot. Candidate inspection and model pretraining exposure
mean this is not an independent held-out industry evaluation. Freeze all inputs
before calls, keep the first results, and do not select replacement cases or edit
prompts based on which variant wins. Changed sources require a separately named
study. Variant order rotates within each case/repetition; case order, API cache
and provider drift are not randomized or controlled.

## Environment and execution

The existing Docker sandbox is extended only with text-unidecode==1.3 for the
upstream slugify dependency. The runner pins the resulting image ID.

```sh
docker build -t reqtest-public-benchmark:1 examples/public-benchmark
# Docker only; all five references must validate before any model calls.
REQTEST_SANDBOX_IMAGE=reqtest-public-benchmark:1 npm run evaluate -- examples/public-benchmark/manifest.json --validate-only
# Starts 30 paid model workflows. No automatic provider retries.
REQTEST_SANDBOX_IMAGE=reqtest-public-benchmark:1 npm run evaluate -- examples/public-benchmark/manifest.json
```

## Measurements and interpretation

Report planned and usable workflow completion, initial/final defect detection,
generated assertion failures on separate reference copies, execution errors and
skips, accepted improvements, preserved valid failures, tokens, requests, latency
and per-case repeat variation. Empty suites and incomplete reference probes remain
unavailable. A failing assertion may correctly detect an injected defect.

Record invalid citations, blocked proposals and unsupported repairs as inspectable
cases, not a general hallucination rate. Real citations do not establish correct
interpretation. Without independent review, semantic accuracy, diagnosis F1 and
relevance-adjusted mutation scores remain unavailable. Matching outcomes across
three repetitions do not guarantee future stability. More passing tests do not
establish higher requirement coverage or an advantage over direct generation.

Use the existing experiment analyzer and plotting script to export portable
JSON/CSV, raw reports and standalone PNG/SVG figures. Preserve missed defects,
blocked outputs and failures alongside successes. No website or account data is
selected by this benchmark.
