# Implementation status

Audit date: 2026-10-22. Scope: the current Version 2 working tree, including
uncommitted implementation files. This is a capability audit, not an independent
measurement of model accuracy or a production-readiness certification.

## Source language

The project-owned source, comments, configuration templates, UI labels, examples
and documentation have no detected Chinese characters or CJK/fullwidth punctuation.
Run `npm run check:english` to check tracked and non-ignored new text files. CI runs
the same command. The checker reports file names and line numbers without printing
file contents. A temporary non-English fixture was correctly rejected during audit.

A wider scan also covered the legacy local backend/frontend directories. Chinese
matches were found only in downloaded third-party repository snapshots under `tmp/`.
These are test inputs and evidence, not Version 2 product source. They were preserved
verbatim. Dependencies, generated build files, private runtime data and user-provided
evidence are not rewritten by the language check.

## Proposal functional requirements

Implemented means a capability is connected in the prototype. It does not establish
that all model-generated analyses or test oracles are correct.

| ID | Capability | Status | Evidence and limits |
| --- | --- | --- | --- |
| FR1 | Requirements, Python repository and existing pytest inputs | Implemented within scope | Text entry, PDF/DOCX/TXT/Markdown extraction, ZIP and pinned GitHub snapshots. Selected blocks retain locations and original hashes. Private access uses a connected GitHub account or transient token. |
| FR2 | Behavior/rule/condition/boundary/exception decomposition | Implemented; accuracy pending evaluation | Structured model output, stable behavior IDs and original requirement quotes. |
| FR3 | Requirement-quality analysis | Implemented; accuracy pending evaluation | Ambiguous, incomplete and insufficiently testable categories with evidence. |
| FR4 | Relevant implementation and existing-test inspection | Implemented within scope | Python AST inspection, pytest collection and validated file/node references. |
| FR5 | Requirement-code-test consistency | Implemented; accuracy pending evaluation | Conflicts link to affected behavior IDs and original artifact quotes. |
| FR6 | Behavior-to-existing-test traceability | Implemented; semantic mapping pending evaluation | Collected pytest node links and source/test evidence are retained. |
| FR7 | Four verification states | Implemented; decision quality pending evaluation | Verified, Partially Verified, Unverified and Uncertain use recorded mapped outcomes. |
| FR8 | Behavior-level gap detection | Implemented; recall pending evaluation | Missing checks are listed and targeted by generated tests. |
| FR9 | Supporting artifact and retrieval evidence | Implemented within scope | Snapshots, fingerprints, quotes, retrieved documents/hashes, execution logs and mutation differences. Older reports may lack newer metadata. |
| FR10 | Targeted pytest generation | Implemented | Original-contract review gates execution of generated artifacts. |
| FR11 | Controlled execution and recorded outcomes | Implemented within scope | Docker, pytest, read-only inputs and resource/time limits. Project dependencies need a prepared sandbox image. |
| FR12 | Evidence-based diagnosis before refinement | Implemented for recorded failures; accuracy pending evaluation | Collection, baseline, execution and re-measurement diagnoses retain phase-specific evidence. |
| FR13 | Selected mutation testing | Implemented within scope | Real mutmut execution on one selected file. Relevant non-equivalent scores require independent review. |
| FR14 | Feedback-driven improvement and re-measurement | Implemented within scope | One bounded improvement action, followed by execution and applicable mutation re-measurement. A repaired suite that passes is mutation-tested before it can earn Verified. |
| FR15 | Final traceable verification report | Implemented as a prototype | UI evidence panels, JSON report and generated-test ZIP; report usefulness still needs user evaluation. |

## Additional product capabilities

- Better Auth registration, login, logout and persistent sessions.
- Passwords of 8–128 characters with uppercase, lowercase and numeric requirements;
  live requirement indicators and server-side enforcement.
- PostgreSQL account/session storage and per-user Python verification reports.
- Cancelled/failed run evidence, recent history, document retrieval and artifact exports.
- B0–B3 benchmark runner, isolated reference fault probes, review templates and scoring.
- English-only source check in local tooling and CI.
- Dependency preflight against an immutable sandbox image, without importing project code.
- Clarification and re-run against an owned saved source snapshot, with linked report comparisons.
- Browser reconnection and PostgreSQL-backed worker recovery with saved checkpoints.
- Private accounts, reports and original requirement documents with owner-only access.
- Workspace model selection and connection checks live in a Settings dialog. HTTP checks were removed; project verification is the only workflow.
- Runtime, dependency installation and disposable test services live in collapsed Advanced settings. Project inputs share setup invalidation and are locked during preflight.
- SMTP verification/reset flows and a loopback-only local Mailpit development mailbox.
- Project-run evaluation dashboard with requirement/outcome charts, evidence checks and traceability; a target-project CI command/template.

## Resolved issues

### Collection/baseline failures with an empty generated suite

Location: `lib/python-agent.ts`, baseline measurement, final measurement selection
and `diagnose()`.

The earlier controlled reproduction used an existing test importing a missing
dependency while no generated test was accepted. It previously produced:

```text
collection exit: 2
baseline exit: 2, recorded outcome: error
final measurement exit: 5, no selected tests
diagnoses: []
verification state: Uncertain
workflow status: completed
```

The workflow now diagnoses collection and baseline failures before test generation.
Regression checks use real Docker execution and deterministic reasoning to verify
that both phases retain environment diagnoses and exact traceback evidence, even
when the final suite remains empty. Existing assertion failures are also retained
separately for baseline and subsequent execution. Only current generated-test errors
can authorize generated-test replacement.

The UI exposes the phase of each diagnosis, warns about initial check failures and
shows collection, baseline and latest-execution logs separately. Collection timeouts
keep affected runs uncertain even if selected checks subsequently pass. Completed
continues to mean workflow termination, not successful verification of every behavior.

## Remaining work

### P1: Independent evaluation is not finished

The retained post-fix pilot completed 12 real-model runs: three synthetic projects
across B0–B3. Reference/output reviews remain pending. These cases were used during
development, so they are not a held-out benchmark. The pilot does not establish
that B3 outperforms the other variants or that semantic coverage is exhaustive.

Complete independent reference/output annotation, then evaluate held-out projects
with repeated runs and all relevant failure classes. Pending or insufficient evidence
must continue to produce null accuracy/coverage/mutation metrics. Historical pilot
mutation reports with missing killed-mutant differences cannot establish a fully
reviewed mutation score; the updated sandbox retains these differences for new runs.

### Document and project limits

PDF/DOC/DOCX/TXT/Markdown ingestion is connected. Extraction retains original bytes,
SHA-256 and page/body-block locations. All extracted text now fills the editable
Requirements field automatically. Line/block selection has been removed. Exact
unchanged excerpts retain original citations; edited text is user-provided.
Requirement text has no character or line-count limit and is never truncated.
English OCR and LibreOffice DOC conversion pass Docker regression cases, including
PDF pages containing native text and scanned images together. Each PDF page has an
explicit extraction outcome. Low-confidence OCR is retained but not selected by
default; confidence is not an accuracy score. Unbudgeted OCR of every page, partial
failures, conversion timeout/errors, encrypted/damaged documents and source
integrity failures are covered by controlled tests. Originals support owner-only
permissions and authenticated PDF page viewing. DOC locations explicitly refer to
converted body blocks. Complex layout accuracy, handwriting, additional OCR
languages and representative real-world scan quality remain outside this evidence.
Word headers, footers, drawings, tracked changes and nested tables are not fully read.

Focused Python/pytest and top-level Node.js/node:test projects pass real Docker
regressions. Compatible Python wheels, locked public npm packages, installed-version
records, disposable PostgreSQL/Redis, fresh service state and cancellation cleanup
are tested. Node selection, module-error diagnosis/one repair, genuine defect
preservation and Stryker patches/re-measurement are exercised. A real-model Node
defect demo supplements deterministic control-flow tests; it is not independent
accuracy evidence. Retained image tags survive development-image rebuilds.
GitHub branch/tag/commit selection, transient private-repository tokens and Account
OAuth linking are implemented. OAuth uses Better Auth token encryption and explicit
same-email linking. Tokens remain server-side and are not sent to the model or
sandbox. Disconnect deletes the stored credential, not the provider's grant or
saved snapshots. Consent requests the broad repo scope; selected-repository read-only
tokens remain an alternative. Mocked-provider tests cover callback state, account
isolation and encrypted persistence; real consent requires administrator-provided
OAuth App credentials. Static preflight still does not prove
startup readiness. Native install hooks, private registries, Jest/Vitest, nested
Node suites and general external services are unsupported. Browser automation is
available for Python projects through sandbox Chromium fixtures; frontend JavaScript
is not mutation-tested.

### Evaluation and deployment limits

The Evaluation UI summarizes the signed-in user's project verification runs with
requirement-state and test-outcome charts, source citations, integrity checks,
phase-specific diagnoses and downloadable evidence. It does not measure independent
accuracy or complete specification coverage. Benchmark execution, reference-label
review and scoring are separate CLI/file workflows. A held-out manifest supports
explicit dataset purpose and repeated runs. Existing development cases are not
relabeled as held-out evidence.

Project verification now shows task inputs, progress, a short summary and next
actions. Its results link opens the same run in Evaluation, which owns detailed
traceability and downloads. Original text is collapsed; retrieval and mutation
records are grouped under Technical details.

The target-project CI runner and manually triggered workflow template are implemented.
Installing the workflow, selecting an immutable tool commit and configuring secrets
in a target repository remain deployment tasks. No external repository was changed.

### Runtime and account deployment limits

New verification jobs use a PostgreSQL queue and a separate worker. Browser
disconnection does not cancel execution. Interrupted workers can retry twice,
reusing saved reasoning and tool checkpoints while retaining the pinned sandbox
image. Changed source/runtime/agent inputs prevent recovery with mixed evidence.
Owner cancellation is transactional with queue cancellation, and report writes
are fenced to the active worker attempt. Legacy in-memory runs remain explicitly
interrupted after a restart. Use npm run dev:all or npm run start:all to start
both processes; multi-host storage and hosted service supervision remain pending.

Team workspaces, invitations, roles and report sharing have been removed to keep
the product focused on individual requirement verification. Accounts and reports
are retained; legacy collaboration tables are unused. SMTP verification and recovery
are connected, with local Mailpit for development. Real recipients require a real
SMTP provider. Local production configuration checks and a paired web/worker
launcher are implemented. Offline local-Compose backups include PostgreSQL, .data,
the effective signing secret and integrity hashes. Restore rejects nonempty targets,
uses a database transaction and is exercised against a disposable database. Runtime
PID leases and a database maintenance lock protect one local workspace. Archives
are not encrypted and do not include external secrets or Docker images. Hosted
deployment, restart supervision, off-machine backup/retention and large-scale queue
operation remain operational work.

The project workspace now exposes authenticated runtime health, reusing pg-boss
worker registry heartbeats. Queue clients without a verification work handler do
not count as online workers. Task counts are restricted to the signed-in owner.
Health reads do not initialize queues or register instances. Missing workers are
distinct from normal pending work; queue/sandbox/status failures preserve form
inputs and saved evidence. Graceful-stop and forced-worker-death regressions cover
offline detection and subsequent checkpoint recovery. These checks do not establish
model access or project readiness.

### Production acceptance and artifact usability

Local production acceptance exercised the public shipping demo at immutable commit
`e5e22a108ede7d1ca0288de0139d27b996c6291b` with its original SRS and real model
requests. Four selected functional requirements produced nine approved tests:
eight passed, one exposed the seeded exact-threshold implementation defect, and
none had execution errors. Exported tests reproduced the same result in a separate
read-only Docker execution. Original document bytes, citations, pinned source,
preflight, worker execution and private report access were checked. Only four of
35 document blocks were selected; this is synthetic demonstration evidence.

The document input now copies all extracted text into Requirements automatically.
Source/extraction details are collapsed and no block-selection step is required.
Oversized text remains visible for editing and cannot be submitted until shortened. Test exports include runtime/run instructions,
source provenance and recorded outcomes alongside the approved artifacts.

### Real project compatibility

Recent real-project acceptance fixes support a selected repository/ZIP subdirectory
as the execution root, preserve dependency lockfiles up to 1 MB without sending
them into model reasoning, and allow up to 200 KB of focused source/test context.
The selected directory is recorded in setup, source provenance and test exports.
Python dependency installation has a separate 256 MB temporary workspace; execution
keeps its existing 32 MB temporary limit. Installer errors preserve stderr.

Word table rows now retain IDs and requirement text together. Multiline requirement
citations use stable-ID encoding through the model boundary and are decoded to the
unchanged original text before validation. Generated gap indexes are constrained by
the referenced behavior's own gap count. New Python SQLite outputs with a recognized
header are recorded by path/hash separately from source integrity. Original files,
generated test changes and unexpected new files remain protected. These are scoped
compatibility fixes, not relaxed oracle or correctness criteria.

Initial acceptance against `zheng515/ScheduleAgent_DOLMA` at commit
`44ee78d7053a8744f711fb507f9af86e258fcd75`, directory `backend`, used verbatim
FR-CAL-02/03/04 rows from its SRS in a locally converted Word document. A native
PDF conversion was checked separately for extraction and page provenance. The
initial real-model run analyzed ten behaviors, generated eight artifacts and approved
six; two clock-dependent/target-patching proposals were blocked. All 51 existing
and six generated checks passed with integrity retained. Mutation measurement
hit its 75-second budget without usable outcomes; states remain Unverified or
Partially Verified. The SRS was reverse-engineered and only three requirements
were selected. This is integration evidence, not an independent accuracy score or
verification of the frontend and live external services.

A follow-up used unchanged source and the same three requirement rows. Clock-aware
generation now prefers calendar invariants or independent before/after clock
readings with date-rollover allowances. The Agent autonomously added today/tomorrow
tests in one improvement action; all 51 existing and three approved generated
checks passed with integrity retained. An explicit-window test remained blocked
because its timezone expectation was not supported by the requirements.

Mutation execution now explicitly selects the approved generated suite and uses
static direct-call analysis to focus on supported top-level functions, with an
explicit whole-file fallback. Re-measurement preserves the original scope.
Timeouts terminate the process group and retain available cache evidence as
incomplete results. In this follow-up, both attempts finished within 75 seconds
on the same 66 mutant IDs and diffs for `formatting.py:resolve_window`: killed
mutants increased from 27 to 42, with 24 survivors remaining. These raw tool
counts are not an independently reviewed mutation score or whole-file coverage.
Remaining survivors, uncovered behaviors and date/time-format ambiguity remain
unresolved. Regression checks passed: 49 tests passed, three optional tests skipped,
with no failures; lint, types, English-only checks and the production build passed.

### Survivor review and collection context

Survivor relevance review now processes all retained usable diffs in bounded batches
of 16, including newly surviving mutants after re-measurement. A decision binds the
mutant ID, file, exact diff, original requirement quote and mapped behavior. Duplicate,
missing, mismatched or older unbound decisions cannot exclude a survivor. A negative
decision for one behavior cannot clear other behaviors in the same source file, so
each survivor is reviewed separately for every behavior mapped to its file.

An earlier version requested one decision per survivor while state calculation
required one per mapped behavior. When several behaviors shared a source file, any
survivor, even a message-only change, therefore blocked Verified for the others. On
`examples/shipping` all four behaviors stayed Partially Verified and the CI gate
failed. With per-behavior requests, the same run reviewed both message-only
survivors for all four behaviors, every behavior was Verified and the gate passed.
Repaired suites previously skipped mutation testing because only the initially
passing path measured mutations; a repaired suite that passes is now measured too.
The UI summarizes only the latest recorded survivors, separating test gaps,
clarification, changes outside the cited behavior and unreviewed evidence. Incomplete
measurements with no survivor outcomes do not resolve earlier gaps.

Real-model follow-up on the same DOLMA source and three selected requirements reviewed
all 24 previous survivors and proposed two supported additions: explicit UTC bounds
and incomplete-window correction. The original three approved tests were reused as
the starting suite; this was a controlled continuation, not a new extraction or an
independent benchmark. All 51 existing and five approved generated checks passed.

The incomplete-window test exposed a pytest context difference: full-suite execution
loaded `tests/conftest.py`, while isolated mutation execution could not import its
local helper. Mutation runs now collect each original test directory's conftest, or a
representative module when no conftest exists, then deselect its test functions.
The report records setup files and exported commands preserve them. Collection hooks
and module import effects remain part of raw outcomes; unrelated module side effects
and module-local fixtures are not reproduced. Loading every original test module was
rejected after exceeding the unchanged 75-second measurement budget.

With the smaller conftest setup, both controlled mutation attempts completed within
75 seconds on identical scope, setup files and 66 mutant IDs/diffs. Killed mutants
increased from 42 to 49; 17 survived. The remaining model labels are one test gap
and 16 changes outside the cited behavior, with no missing reviews. The remaining
Monday-midnight microsecond change needs precision clarification before a strict
assertion is added. One formerly negative relevance judgment (Mutant #56) disagreed
with the later execution result; retain it for independent review rather than
turning model labels into gold data. Regression: 55 passed, three optional tests
skipped, zero failed; lint, types, English-only checks and production build passed.

An exploratory re-review also admitted a previously blocked timezone-identity
assertion; execution failed and the report remained uncertain. A model diagnosis
using a full node ID instead of the requested artifact ID was not accepted. These
cases remain evaluation inputs for review consistency and diagnosis-ID handling;
they are not evidence of an implementation defect in the target repository.

### Diagnosis ID recovery

Diagnosis provider schemas now restrict IDs to the supplied canonical failure list.
For older/custom outputs, an exact recorded failed node can map to its generated
artifact ID only when the approved artifact file uniquely matches. Function names,
guessed filenames, passed nodes and ambiguous matches are not aliases. Original model
IDs remain in proposed diagnoses; accepted diagnoses use canonical IDs. Duplicate
canonical/node decisions remain uncertain, and requirement/code/test/log evidence
checks and the one-improvement limit are unchanged.

Docker regression covers successful recovery from a grounded node-ID diagnosis,
duplicate aliases and unsupported source evidence. Existing implementation defects
and original test failures still cannot authorize generated-test repair. Provider
schema regression verifies canonical IDs and exact original-quote decoding.

A controlled real-model DOLMA replay reused the previously observed false approval
of T2 to exercise recovery, rather than claiming the initial review was correct.
The first replay produced the canonical T2 ID but a category/reason contradiction,
so no repair was authorized. After clarifying category definitions, a second replay
used three real-model calls for diagnosis, repair and independent replacement review.
It diagnosed the unsupported timezone-object assertion as a generated-test error,
performed one improvement and passed all 51 existing plus one generated check with
source/test integrity retained. Both attempts are preserved locally; this is recovery
evidence, not an independent diagnosis-accuracy estimate. Regression: 61 tests,
58 passed, three optional tests skipped, zero failures.

### Repeated component classification

`npm run evaluate:decisions -- 3` evaluates nine small development cases three times
with the production test-review and diagnosis tasks and reasoning function. Reference
labels remain outside every model request. Frozen input/task snapshots, raw outputs,
request errors, elapsed time and source/dependency fingerprints are retained. Re-scoring
needs no API key. Duplicate attempts, changed inputs or agent versions are rejected;
missing/invalid repeats remain in denominators. Accuracy and false-support metrics
remain null until reference review is complete and every attempt is valid.

The first real-model run returned 27 valid classifications, with six of nine cases
unanimous. C01 varied over whether value equality sufficiently checks an integer-return
contract; C04 once supported an extra timezone-object assertion and twice blocked it;
C09 alternated between environment_failure and uncertain for a missing import.
These are classification-consistency observations, not independently established error
rates. The raw traces and draft reference labels remain available for review. Docker
checks reproduce each snippet's pass/fail/import-error scenario. The fixtures use
synthetic trace summaries and measure raw model decisions, not full Agent admission
gates, repair safety or held-out accuracy. Regression: 67 tests, 64 passed, three
optional tests skipped, zero failures; build, types, lint and language checks passed.

### Decision boundaries and invalid analysis evidence

Generation and review share an assertion policy: explicit return-type claims need
separate semantic-type and value checks; every additional assertion needs original
contract support. A timezone offset does not entail a named timezone identity.
Failure diagnosis distinguishes an unavailable implementation dependency from an
invented generated import, and an unsupported exact expectation from competing
supported requirement interpretations. Source/log citation fields remain separate.

Development references for C01/C03 were corrected: equality-only tests do not
establish their assigned integer/datetime type claims. C08 uses the explicit
classification precedence for invented expectations in generated tests. References
remain unreviewed. New C10/C11 controls check type and value independently. Real
Docker probes demonstrate wrong-type values passing the older checks and failing
the stronger controls; correct values pass both. Historical copied labels are retained.

The final component experiment returned 33 valid decisions. All eleven cases were
unanimous across three repetitions, including the two supported positive controls.
The original nine input hashes are unchanged: identical-label agreement increased
from 6/9 to 9/9 on shared cases. This is development consistency, not held-out accuracy;
accuracy and false-support metrics remain null pending independent review. A prior
intermediate experiment remains available and exposed additional type/ambiguity
boundaries before the final policy. The later analysis-correction change leaves the
component review/diagnosis tasks unchanged; these component results are not a test
of whole-agent recovery.

A fixed production demo then exposed invalid analysis citations: escaped newlines
and a paraphrased document sentence. The workflow now requests at most one correction,
retains the original response/error in analysisCorrection, and applies the same exact
validation again. A second unsupported analysis stops the run. No source text is
normalized or accepted by fuzzy matching. Docker regression exercises both successful
correction and refusal of a second invalid response without changing implementation.

The final fixed GitHub/SRS acceptance used commit
`e5e22a108ede7d1ca0288de0139d27b996c6291b` and the unchanged original SRS, selecting
four functional blocks. Four generated artifacts were approved: three passed and
one exposed the seeded exact-threshold defect, with zero execution errors. The
product-generated test ZIP reproduced the same result in a separate read-only,
network-isolated Docker run. Source integrity was retained, the defect was diagnosed
and no improvement action modified a valid failing assertion. The final analysis
was valid on its first response; the correction path is exercised by controlled
Docker regression. The earlier real-model citation failure remains saved separately.
Regression: 69 tests, 66 passed, three optional tests skipped, zero failures; types,
lint, English check and production build passed. Independent review remains pending.

## Controlled automated experiments: 2026-10-26

Three synthetic development projects ran across B0–B3, three repetitions each:
36 completed runs and 96 real model requests. Model, source, requirements and Docker
image were fixed within the experiment. External contract witnesses validated the
original/corrected reference copies without entering model context. Per-request
latency, usage, input archives, source snapshots and failure traces are retained.

All configurations completed 9/9 runs. On six seeded-fault runs per configuration,
B0, B1 and B3 detected 6/6; B2 detected 5/6. All initially detected faults remained
detected. B2 inventory repetition 1 blocked the equality test's exact return-class
assertion, leaving the explicit boundary defect unexecuted. B3 shipping repetition
3 retained a weak suite with only 1/9 raw mutants killed, compared with 7/9 in the
other shipping measurements. These are failure observations, not independently
reviewed error classifications. No run produced two comparable complete mutation
measurements, so no mutation-improvement delta is claimed.

Standalone CSV/JSON results, PNG/SVG figures and a portable evidence subset are in
`experiments/results/2026-10-26`. Re-scoring the exported evidence reproduces the
same metrics without model calls. Independent semantic/diagnosis/mutation-quality
metrics remain unavailable as requested; this is not held-out evidence or proof that
B3 outperforms direct generation. No final academic report was authored.

Next.js and matching tooling were updated to 16.4.3, Zod to 4.6.7, and vulnerable
transitive dependencies patched. The current npm audit reports zero known
vulnerabilities. Regression: 83 passed, three optional tests skipped, zero failed;
lint, types, English checks and production build passed. The post-run API-key
non-null type assertion emits identical JavaScript, verified against the frozen
runner and recorded in its source-equivalence artifact.

## Recommended order

1. Independently review the revised development labels and run a held-out B0–B3 evaluation; monitor type, oracle and diagnosis boundaries on new inputs.
2. Review the supported document/layout and dependency scope on target demo projects.
3. Configure real SMTP, encrypted off-machine backups and target-repository CI for any hosted deployment.

See the root README for startup and checks, and `examples/benchmark/README.md` for
independent annotation and metric definitions.
