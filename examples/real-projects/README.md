# Pinned real-project inputs

These inputs support the current independent B0-B3 matrix. Complete pinned
upstream archives supply the source; the production importer applies its
supported-file and hidden-path filters. Source exclusions, hashes and the exact
Python test catalog are recorded separately from bounded model context.

| Project | Version / commit | Public API scope |
| --- | --- | --- |
| Click | 8.1.7 / `874ca2bc1c30d93a4ac6e36a15ed685eafe89097` | CLI defaults, invalid input, repeated options, flags, choices and integer bounds |
| Packaging | 24.2 / `d8e3b31b734926ebbcaff654279f6855a73e052f` | Versions, specifiers, markers and normalized names |
| Werkzeug | 3.0.6 / `5eaefc3996aa5cc8c5237d8b82f1b89eed6ea624` | Multi-value dictionaries, headers and integer routing |

Six finite requirements per project derive from pinned documentation and public
docstrings. [Original excerpts](requirement-sources.json), licenses, fixed
witnesses and unreviewed labels are retained. They are developer/AI-assisted
inputs, not native upstream SRS files or independently checked accuracy labels.
These cases inject no implementation fault. They are older pinned versions,
not claims about current upstream releases.

## Prepare and validate

Node 22, Python 3 and Docker are required. Preparation downloads pinned archives
and registry dependencies; project execution uses disposable offline sandboxes.

```sh
python3 scripts/prepare-real-projects.py
docker build -t reqtest-python:1 sandbox
docker build -f examples/real-projects/Dockerfile -t reqtest-real-projects:2 examples/real-projects
# Fresh destination required; imports and runs complete suites, without a model.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npx tsx scripts/preflight-real-projects.ts
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-baselines.json --validate-only
```

The prepared sources live in `.evidence/opensource-candidates/`. For another
full-suite preflight, pass a fresh destination to `scripts/preflight-real-projects.ts`.

```sh
# Four new paid Click workflows, one per B0-B3 configuration.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-smoke.json
# 36 new paid workflows: three projects, four configurations, three repeats.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run experiment:run
```

Retired studies and their dedicated manifests were deleted. These reusable inputs
are not retained observations. Passing six specified API checks does not establish
whole-repository coverage. See [current evidence](../../experiments/README.md)
and [the protocol](../../docs/evaluation-protocol.md).

## Bounded runtime-error observation

`examples/experiments-click-runtime-smoke.json` runs one pinned Click case and
one repeat, without seeded tests or injected faults. B1 generates naturally from
the six fixed contracts and project context. A common preparation applies normal
analysis, admission and execution before B2/B3 reuse the same reviewed suite.
This custom shared-prefix study is not independent full-website B3 generation.

Six model requests each for B1, preparation, B2 and B3 cap the whole experiment
at 24 requests; failed calls consume slots and are not automatically retried.
Mutation is disabled to focus on failure handling. If no approved generated
runtime failure appears, retain that absence and stop without trying other
projects or new candidates. An upstream project is not presumed bug-free:
remaining failures need original-contract, source and execution investigation.
Unresolved causes do not count as confirmed generated-test errors or repair wins.

```sh
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-click-runtime-smoke.json
```
