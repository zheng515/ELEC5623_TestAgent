# Implementation status

Audit date: 2026-10-20. Scope: the current Version 2 working tree, including
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
| FR14 | Feedback-driven improvement and re-measurement | Implemented within scope | One bounded improvement action, followed by execution and applicable mutation re-measurement. |
| FR15 | Final traceable verification report | Implemented as a prototype | UI evidence panels, JSON report and generated-test ZIP; report usefulness still needs user evaluation. |

## Additional product capabilities

- Better Auth registration, login, logout and persistent sessions.
- Passwords of 8–128 characters with uppercase, lowercase and numeric requirements;
  live requirement indicators and server-side enforcement.
- PostgreSQL account/session storage and per-user Python verification reports.
- Cancelled/failed run evidence, recent history, document retrieval and artifact exports.
- Optional HTTP black-box checks with reviewed status/JSON assertions and exported tests.
- B0–B3 benchmark runner, isolated reference fault probes, review templates and scoring.
- English-only source check in local tooling and CI.
- Dependency preflight against an immutable sandbox image, without importing project code.
- Clarification and re-run against an owned saved source snapshot, with linked report comparisons.
- Browser reconnection and PostgreSQL-backed worker recovery with saved checkpoints.
- Better Auth team roles, verified-email invitations and opt-in read-only report sharing.
- SMTP verification/reset flows and a loopback-only local Mailpit development mailbox.
- Web evaluation annotation workspace and a target-project CI command/template.

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
SHA-256 and page/body-block locations. Only explicitly selected blocks enter a run.
English OCR and LibreOffice DOC conversion pass Docker regression cases, including
PDF pages containing native text and scanned images together. Each PDF page has an
explicit extraction outcome. Low-confidence OCR is retained but not selected by
default; confidence is not an accuracy score. OCR page/time budgets, partial
failures, conversion timeout/errors, encrypted/damaged documents and source
integrity failures are covered by controlled tests. Originals support owner/team
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
Node suites, browser automation and general external services are unsupported.

### Evaluation and deployment limits

The Evaluation UI collects independent human annotations and validates downloaded
reviews; it does not complete human assessment automatically. A held-out manifest
supports explicit dataset purpose and repeated runs. Existing development cases are
not relabeled as held-out evidence.

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

Team membership and roles are provided by Better Auth. Reports are private by default
and owners may share them for read-only team access. SMTP verification and recovery
are connected, with local Mailpit for development. Real recipients require a real
SMTP provider. Local production configuration checks and a paired web/worker
launcher are implemented. Offline local-Compose backups include PostgreSQL, .data,
the effective signing secret and integrity hashes. Restore rejects nonempty targets,
uses a database transaction and is exercised against a disposable database. Runtime
PID leases and a database maintenance lock protect one local workspace. Archives
are not encrypted and do not include external secrets or Docker images. Hosted
deployment, restart supervision, off-machine backup/retention and large-scale queue
operation remain operational work.

## Recommended order

1. Independently review the pilot labels and run a held-out B0–B3 evaluation.
2. Review the supported document/layout and dependency scope on target demo projects.
3. Configure real SMTP, encrypted off-machine backups and target-repository CI for any hosted deployment.

See the root README for startup and checks, and `examples/benchmark/README.md` for
independent annotation and metric definitions.
