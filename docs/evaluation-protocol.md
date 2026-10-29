# Evaluation protocol - policy v16

This technical protocol is not the academic report. The current inventory is
[experiments/README.md](../experiments/README.md). Only v16 result exports and their matching private raw studies are retained;
older results, model runs and preflights were deleted at the owner's request.
Current studies freeze their own inputs, Agent sources, image and model identity.

## Complete-runtime open-source studies (v16)

`examples/experiments-real-projects-v16.json` uses complete runtime code from
pinned Click 8.1.7, Packaging 24.2 and Werkzeug 3.0.6, six finite public API
requirements each, shared B1/B3 candidates and three repeats (18 workflows).
Sources are unmodified and full imported upstream baselines run by file.
Structured catalogs and exact execution nodes are retained; a separately bounded
model catalog is not an execution sample. No implementation defect is injected
in this study, so generated failures on these sources are not assumed to be
upstream defects. Passing fixed witnesses and separate replays support the
specified cases only. Source versions are in the portable evidence archive.

`examples/experiments-real-challenges-v16.json` specifies three controlled
interventions on the same complete runtimes: Click inclusive-boundary source
fault with a failing candidate, Packaging's wrong generated assertion, and
Werkzeug's wrong generated import. It uses B1/B2/B3, three repeats and one frozen
common preparation per case/repeat (27 workflows, nine preparations). Preparation
holds analysis, admission and initial execution fixed; B2/B3 receive equal
follow-up ceilings and alternating order. All are development interventions,
not naturally occurring upstream bugs or an unseen held-out set.

An initial candidate of this study stopped after actual provider context errors
exposed an unbounded repair payload. Its 27 planned rows, missing observations,
errors and cancellation remain separate. The repaired study has its own frozen
source fingerprint. A regression checks that complete saved measurements reach
the repair prompt as a bounded, explicitly scoped view.

C01's value-only assertions omit a witness for the stated integer callback type.
Admission blocks do not earn runtime-diagnosis credit. The separate
`examples/experiments-real-typed-v16.json` adds an explicit type assertion without
changing its contract, source fault, model, image or budget (nine workflows).
Its concrete `type(value) is int` assertion was itself overstrict: the unchanged
contract promises integer semantics, not the exact built-in class. Its admission
blocks remain visible. A further separate
`examples/experiments-real-semantic-v16.json` uses `isinstance(value, int)` with
boolean exclusion under the existing assertion policy (nine workflows). Both
adaptive revisions are not additional independent projects or blind results.
Fixture reference categories are developer/AI-assisted; independent semantic
accuracy remains unavailable. No admission bypass or required B3 win is imposed.

Each study exports JSON/CSV, exact inputs, Agent/model/image identities, raw
requests, reports and separate source-copy executions. Large exported evidence
is optionally packaged into a byte-verified `evidence.zip`; unzipping restores
the original relative paths and index. Original private run directories are not
deleted. Report known provider usage once per actual request, including shared
preparations once; unavailable usage stays unknown. Do not pool results across
source revisions, repeated contexts or adaptive parent/child cases as independent
product-accuracy estimates.

A later execution-reference regression repeats the unchanged C05 manifest after
provider-safe `E...` log-line encoding was added. Its preceding study retained
two Uncertain decisions caused by malformed copied execution quotes. The new
study has a distinct source fingerprint and is a targeted engineering regression,
not a blind improvement estimate. Existing category/evidence gates remain active;
the encoding restores original trace lines rather than accepting normalized or
invented excerpts. Legacy images without explicit catalog completeness remain
marked incomplete. Actual raw decisions and all earlier failures stay exported.

## Controlled recovery and diagnosis ablation

`examples/experiments-real-challenges-v16.json` declares three controlled cases
on complete upstream runtimes, three repeats and B1/B2/B3. Candidates and fixed
reference witnesses remain outside the model-visible project. The same protocol
applies to the separate typed and semantic Click candidate revisions.

1. B1 executes the frozen candidates unchanged, with no model generation.
2. One shared preparation performs original-contract analysis, admission review
   and initial execution, stopping before diagnosis or refinement.
3. B2 and B3 clone that exact analysis and reviewed suite, then independently
   execute the same source. B2 uses the explicit unconditional-repair baseline;
   B3 obtains a grounded diagnosis before selecting repair eligibility.
4. Other prompts, admission gates, model, image and follow-up request ceiling are
   identical. Follow-up order alternates across repeats. Shared preparation is
   not regenerated after an arm fails. Each arm permits at most one improvement.
5. Original source integrity, exact initial-suite identity and shared-preparation
   identity are checked. Failed, missing and budget-exhausted outcomes remain.

This isolates diagnosis and its downstream repair selection within this controlled
workflow. It does not isolate an arbitrary reasoning algorithm, provide a
population accuracy estimate, or represent naturally generated error frequency.
The baseline remains subject to original-contract admission; it is not permitted
to bypass source integrity or change the implementation.

## Objective measurements

- Completion: all planned rows remain in denominators.
- Missing boundary: a generated failure on original defective code must pass on
  the separately corrected copy. Passing unrelated examples earns no detection.
- Import/unsupported-assertion recovery: the original candidate ID must have an
  approved changed artifact, passing generated execution, and usable passing
  fixed-witness reference replay.
- Valid-failure retention: approved original code/function remain unchanged and
  still expose the seeded defect, with corrected-copy evidence.
- Detection loss: an initially exposed seeded defect is no longer detected after
  refinement. This is not general independently reviewed incorrect-repair accuracy.
- Resources: actual requests, known/unknown provider token usage, context/source
  bytes and wall time are recorded. Paired end-to-end totals include B1 and shared
  preparation for each strategy. For actual billed totals, shared work is counted
  once overall, not once per strategy. No currency estimate is inferred.

`recovery-metrics.json`, `paired-comparison.json`, raw reports, request records,
reference executions and frozen inputs are exported together. Missing evidence
produces unavailable metrics rather than invented zeros. Literal unchanged-code
retention is a narrower measurement than semantic assertion equivalence.

## Component regression inputs

The 16 development cases in `examples/benchmark/decision-cases.ts` and their
AI-assisted reference in `tests/fixtures/decision-reference.ai-assisted.json`
remain reusable test inputs. The original trace pack is preserved beside the
reference; AI authorship, date, evidence hash and unreviewed flags remain explicit.
Old component predictions, scores, audit exports and blank review packs were
removed. These fixtures are not additional current experimental observations.
No human review is planned; independent semantic accuracy remains unavailable.

The optional `npm run evaluate:decisions -- 3 --reference PATH` command creates
48 new paid component requests and freezes its own inputs and outcomes. It does
not regenerate the deleted results or change the live Agent's workflow.

## Run and analyze

Follow [real-project preparation](../examples/real-projects-v16/README.md) first.

```sh
# No model calls.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-projects-v16.json --validate-only
# New paid observations; existing retained results stay unchanged.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run experiment:run
npm run experiment:analyze -- .evidence/evaluation/RUN/index.json experiments/results/NEW-STUDY
```

The source set is checked before each workflow. Code/model/prompt changes require
a fresh frozen study. Do not silently replace disagreeing attempts or pool adaptive
cases as independent samples. Current v16 archives retain all their successful,
failed, cancelled, blocked and missing observations after the older-version cleanup.
