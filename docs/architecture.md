# Framework architecture

## Scope and trust boundary

The current product is a local development tool. SQLite stores real input and run records. The B0 orchestrator reads the project under test, calls an LLM to analyse requirements, plan structured scenarios, and generate pytest tests, then executes those tests against that project in a container. Input documents and repository contents are evidence to analyse, never instructions granting tool permissions: the agent prompts state this, and the requirement text is passed inside delimiters as data.

**A repository reference is user input, so reading it is a trust boundary.** Inspection stays off until `REQTEST_REPOSITORY_ROOT` is set; every path must resolve inside that root, symlinks are never followed, remote URLs are refused rather than cloned, and a bounded code copy is saved locally. Only public interfaces are sent to the model: signatures, class names and docstrings. Interfaces are extracted from the saved copy, which is mounted into the sandbox read-only.

**Generated test code is untrusted model output and never runs on the host.** It executes only inside the sandbox image, and when Docker is unavailable it does not execute at all. There is no subprocess fallback, deliberately.

```text
React workspace → typed API client → /api/v1 → FastAPI routes
                                             ├─ SQLite Store
                                             └─ RunManager (persisted queue, one local thread)
                                                  └─ Orchestrator protocol
                                                  ├─ ScaffoldOrchestrator  (no credentials)
                                                  └─ DirectLLMOrchestrator (B0 / B2)
                                                       ├─ inspector → RepositorySnapshot
                                                       ├─ analyzer  → RequirementAnalysis
                                                       ├─ planner   → TestPlan
                                                       ├─ generator → GeneratedTestSuite
                                                       └─ runner    → ExecutionResult
                                                            └─ docker run (no network,
                                                                 repo mounted read-only)
```

`create_app` picks the orchestrator once at startup: `DirectLLMOrchestrator` when the Anthropic SDK resolves a credential, `ScaffoldOrchestrator` otherwise. Every agent stage declares a Pydantic output contract and receives a validated instance, so no stage parses free-form model prose.

## API v1

Authentication endpoints are `/auth/register` (POST, 201), `/auth/login` (POST, 200),
`/auth/me` (GET, 200/401), and `/auth/logout` (POST, 204), all under `/api/v1`.
Registration accepts `name`, `email`, and `password`; login accepts `email` and `password`.
Both establish a revocable server-side session through an HttpOnly, SameSite=Lax cookie.
Public user objects contain only `id`, `name`, `email`, and `created_at`.
Passwords are salted scrypt hashes; stored session tokens are SHA-256 digests.

Project and run routes require a session and enforce project ownership, including both report
formats and recent runs. Their existing URLs and payloads remain unchanged. Foreign records
return 404, and missing/expired sessions return 401. `/health` and `/system` stay public.
All POST requests require `Content-Type: application/json`, including bodyless requests;
untrusted browser Origins are rejected. Credentials-enabled CORS uses explicit allowed origins.
Auth endpoints throttle attempts per client IP in SQLite; all API responses use `no-store`.

The database migrates existing installations by adding `users`, `sessions`, `auth_attempts`,
and `projects.owner_id`. Legacy projects retain their contents and remain unowned/inaccessible
until explicitly assigned by an administrator. Session and ownership checks apply after restart.
The frontend mounts the workspace only after resolving `/auth/me`, clears it on sign-out/401,
and rechecks authentication on window focus and cross-tab session changes.

| Method | Path | Result |
| --- | --- | --- |
| GET | /health | Service health and version |
| GET | /system | Available and unconnected integrations |
| GET | /projects | Projects, newest first |
| POST | /projects | Validate and persist a project; 201 |
| GET | /projects/{id} | Project and original requirements |
| GET | /projects/{id}/runs | Persisted run history |
| GET | /runs?limit=5 | Recent runs across projects, newest first; limit 1–100 |
| POST | /projects/{id}/runs | Persist queued run and return 202; Location identifies its polling URL |
| GET | /runs/{id} | Run, events, input fingerprint and report |
| GET | /runs/{id}/report | JSON report download |
| GET | /runs/{id}/report.html | Portable HTML report download |

All paths above are prefixed with `/api/v1`. Missing records return 404; invalid project fields return 422. A repository reference is an optional string, not permission or a command to access the filesystem.

Create-project body:

```json
{
  "name": "Shipping service",
  "description": "Boundary and exception verification",
  "repository_ref": "",
  "requirements_text": "An order of at least 10,000 cents receives free shipping."
}
```

## State and evidence

- Project inputs are immutable through this API version. Runs refer to an existing project.
- Each run stores UTC timestamps, ordered events, a report and SHA-256 of the serialized project input. This fingerprint is **not** a source-code snapshot.
- Run mode is `scaffold`, `baseline_b0` without execution, or `baseline_b2` when the sandbox enables the bounded feedback loop. A failed run keeps whatever it had already extracted and records why it stopped; it never substitutes a plausible result.
- `semantic_coverage = null` and `mutation_score = null` in every mode. Null means not evaluated, not 0% coverage. `executed_tests` is zero when no execution outcomes were recorded.
- `requirement_coverage` in new reports (`validation_version = 1`) counts only generated artifacts with server-computed `validation_status = validated` and nonempty validated checks. Requirement IDs are derived from their known plan references. It measures validated code-to-plan links, not semantic correctness, source completeness, execution success, or adequacy. Older reports keep historical values and have no validation-version claim.
- `execution_success_rate` is the share of executed tests that passed, and `null` when nothing ran. `executed_tests` counts cases pytest actually reported, so a sandbox that produced no readable report counts as zero rather than as success.
- `test_plan` stores the planner output before generation. `planning_gaps` lists testable requirements without scenarios; `uncovered_scenarios` lists planned scenarios without generated tests. These are distinct from requirement coverage and execution outcomes.
- A planning failure preserves extracted requirements and repository interfaces; a generation failure also preserves the plan. A legacy report without these fields loads with `test_plan = null` and empty gap lists; legacy tests default to empty `scenario_ids`. SQLite stores report JSON, so this additive change needs no database migration.
- `coverage_gaps` lists extracted testable requirements without a validated generated artifact (FR14).
- Verification status is decided in `_status` and never rises above what was proven. `Uncertain` when the requirement is ambiguous or untestable. `Unverified` when the project was not inspected, when no linked test ran, or when any linked generated test lacks a final outcome, when a planned scenario lacks an implementation, or when any linked test failed or errored — a green test against a *guessed* module is not evidence. `Partially Verified` when the project was inspected, every planned scenario was implemented, and every linked generated test has a final passing outcome. `Verified` is deliberately unreachable: passing tests show the behavior held for the cases that were written, and nothing yet evaluates whether those cases were adequate. Mutation testing is what unlocks it.
- `evidence` holds one record per executed test, and each behavior's `evidence_refs` point at the outcomes of its own tests, which is the requirement → scenario → test → evidence chain the UI walks for new runs.
- In B2 mode, only recognized generated-test syntax errors or missing fixtures are classified as invalid tests and may be refined once; other execution errors remain inconclusive using the requirement, repository interface, and error message. Assertion failures remain suspected defects and are never rewritten merely to match observed output. The one-iteration bound prevents uncontrolled repair loops.
- The behavior contract reserves the proposal's four statuses: Verified, Partially Verified, Unverified, Uncertain. No synthetic behaviors are inserted.
- SQLite connections are per operation with transactions and foreign keys. This is local persistence, not a distributed job queue. Startup migrations add run status and worker ownership columns and a unique partial index preventing two active runs for a project.

## Agent integration points

`create_app(settings, orchestrator)` accepts an implementation of the `Orchestrator` protocol. This allows an implementation or a test double to be injected without changing the HTTP routes.

Implemented:

1. **RequirementAnalyzer** (`services/analyzer.py`): structured requirements with verbatim source quotes, testability, and ambiguity findings. Ids are renumbered on collision because traceability depends on them.
2. **TestPlanner** (`services/planner.py`): independent structured scenarios with normal, boundary, and negative categories, preconditions, inputs, steps, expected results, source references, and assumptions. It filters links to known testable requirements and available interfaces, renumbers scenarios as `S1`, `S2`, etc., and applies `REQTEST_MAX_SCENARIOS`. A prompt asks for source-grounded expectations; reference validation does not prove their semantic correctness.

3. **TestGenerator** (`services/generator.py`): pytest artifacts generated from the saved plan, linked to validated scenario ids and their derived requirement ids, plus coverage gaps. Generated is distinct from executed everywhere in the report.

4. **SandboxRunner** (`services/runner.py`): `docker run` with `--network none`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, and memory, CPU, PID and wall-clock limits. Results are read from pytest's own JUnit XML; a timeout force-removes the container. `--continue-on-collection-errors` is required, not cosmetic: without it one uncollectable generated module aborts the session and every other result is lost.

   The guarantees were checked by running probe tests inside the image rather than by trusting the flags: outbound sockets fail, `/` and `/home/sandbox` are unwritable, `/tmp` and the mounted workspace are writable (pytest needs both), the process runs as uid 10001, and `mount()` fails because capabilities are dropped. A container that exceeds its memory limit is killed with exit 137 and produces no report, which is recorded as zero executions and an explanatory issue — never as a pass. Re-run those probes after changing any flag in `_command`.

5. **ArtifactInspector** (`services/inspector.py`): `ast`-based interface extraction confined to `REQTEST_REPOSITORY_ROOT`. Module names are derived as they would be imported from the mount root, so `pkg/orders.py` becomes `pkg.orders`; the root directory's own `__init__.py` is skipped because nothing imports it from there. The report preserves both the interface SHA-256 and a separate manifest fingerprint of copied file bytes, paths, executable permissions and directories (NFR6).

6. **Bounded refinement** (`services/refiner.py`, `services/repair_guard.py`): the model proposes repairs, but the server accepts only removal of an unused fixture parameter named by a recorded missing-fixture error. Both modules must parse; after that one transformation, the complete AST must match. Assertions, input expressions, imports, helpers, decorators, control flow, exception checks, and project calls cannot change. Each original test must contain a nonconstant check and its module must contain an identifiable project API call. Dynamic namespace access prevents proving that a fixture is unused and is rejected. Unparseable originals and other edits have no supported automatic repair. Invalid and duplicate candidates are excluded, with rejection reasons retained in the report; accepted replacements retain their original lineage, name, and module. Rejected repairs retain original failures and do not trigger a rerun. Structural preservation is not a semantic coverage or adequacy proof; first-generation tests use the separate code-to-plan validator, and accepted repairs must pass it again.

7. **Code-to-plan validator** (`services/test_validator.py`): the planner's optional `ScenarioCheck` records a fully qualified inspected function, scalar or flat-list arguments, named keyword entries, and an equality or precise exception oracle. A Python 3.11 AST parser recognizes a deliberately limited straight-line subset, resolves imports and literal variables, tracks call results, and matches each declared scenario against actual calls and assertions. Unsupported nested inputs, control flow, helpers, classes, decorators, mocks, fixture-dependent behavior, dynamic constructs, missing contracts/interfaces, setup preconditions, and unresolved assumptions receive `needs_review`. Generated artifacts are retained but only fully validated artifacts execute or earn coverage. The checker overwrites model-provided validation fields, supplies line references, and refinement revalidates accepted code. Missing final outcomes are checked by test ID and actual function name, not only artifact ID. These checks establish structural correspondence to the saved plan, not semantic correctness of the plan itself.

Still to build:

8. **EvidenceRetriever**: the RAG store that turns B0 into B1.
9. **MutationRunner**: selected relevant mutations, outcome classification and bounded improvement.

The run endpoint reserves a queued record transactionally before returning 202. `RunManager` owns one daemon worker and saves running checkpoints before each stage. A checkpoint includes the current report, generated artifacts, and ordered events in the run JSON; events are not separate append-only database records. GET `/runs/{id}` and project run lists expose the latest snapshot. The frontend polls every two seconds while active and retains its last snapshot through connection failures. Browser requests use a 15-second timeout.

Active duplicate submissions for a project return the existing run. `REQTEST_MAX_ACTIVE_RUNS` (default 20) bounds queued plus running jobs globally; a full queue returns 429 and `Retry-After: 5`. Unexpected worker failures preserve the latest checkpoint and do not kill processing of the next job. Worker ownership and active-state checks prevent late callbacks from overwriting an interrupted run.

This is a single-process local queue: do not run multiple API workers against the same database. Startup and orderly shutdown mark unfinished jobs failed with an interruption event, preserving saved outputs. In-flight external calls cannot be forcibly cancelled by the thread; subsequent checkpoints stop further stages. No automatic resumption, cancellation endpoint, or distributed queue is provided.

Analysis rejects blank or fabricated source quotes before planning. Execution archives each attempt's test code, outcomes, diagnostics, exit code, and timeout flag. Repair outcomes replace the corresponding original outcomes; missing rerun results cannot reuse old passes. `execution_gaps` lists generated artifacts without final outcomes. Final summaries use the latest attempt metadata, while the archived first attempt remains visible in HTML, JSON, and the workspace. These provenance and completeness checks do not prove semantic correctness or test adequacy.

`frontend/lib/types.ts` mirrors the backend schemas by hand, so update both together when adding states. OpenAPI is available at `/openapi.json` for future type generation.

## Development and production

The dev frontend proxies `/api` to `BACKEND_URL` (default `http://127.0.0.1:8000`). A separate hosted API can be selected via the build-time `VITE_API_BASE_URL`; it is a public URL and must never contain credentials. Backend settings use the `REQTEST_` prefix, except `ANTHROPIC_API_KEY`, which keeps the SDK's own name. Leaving it unset is a supported configuration, not an error: the app falls back to scaffold mode and says so through `/api/v1/system`. The same applies to a missing Docker daemon or sandbox image, which leaves execution unconnected.

A blank value in `.env` is normalised to `None`, because `Path("")` resolves to the process working directory and would otherwise switch repository inspection on silently. Image availability is checked with `docker image ls --quiet`, not `docker image inspect`: with the containerd image store, `inspect` fails for a short reference that `docker run` accepts, which would disable execution for a working image.

The orchestrator, the runner and the inspection setting are all resolved once, at startup. Starting Docker, exporting a key, or setting a repository root while the server is running has no effect until it restarts. Secrets, databases and installed dependencies are ignored by Git.

Accounts protect persisted projects and reports. Repository access still uses a shared configured root;
it is not per-user repository authorization. Public hosting additionally needs HTTPS with secure
cookies, trusted proxy configuration, repository permissions, and production execution isolation.
Automatic job resumption, distributed workers, and production deployment remain future work. Frontend build success alone does
not constitute a deployment or end-to-end browser verification.

### Specification analysis scope

After extraction, the server audits verbatim quotes against the saved specification.
Unique quote occurrences produce source links with zero-based Unicode character
start/end offsets (end exclusive) and one-based line numbers. Overlapping links are
merged for gap detection. Repeated quotes are ambiguous and do not credit all their
occurrences. Source fragments containing letters or numbers outside these links remain visible as
unlinked text, including partial sentences. These fragments may be omitted rules or
context; the audit does not classify them as defects.

The audit records the extraction limit, returned and retained requirement counts,
and whether the limit was reached. It is preserved in progress checkpoints, failed
planning/generation reports, JSON exports, and HTML exports. Historical runs without
an audit show unknown completeness. Coverage continues to measure only extracted
testable requirements with validated code-to-plan links. Even when all text is
linked, semantic completeness is **not established**: a quote spanning multiple
rules does not prove that every rule was extracted or interpreted correctly. The
agent continues automatically for known requirements while reporting these limits.

### Saved code snapshots

`services/repository_snapshot.py` captures bounded ordinary files and directories
before interface extraction. It uses directory descriptors and refuses file
symlinks, checks for changes during copying with a second full scan, and saves a
manifest alongside the copy. Read-only file permissions preserve executable bits.
The manifest fingerprint covers relative paths, bytes, file sizes, normalized file
permissions and directories. `RepositorySnapshot.sha256` remains the interface
fingerprint for compatibility; `artifact.content_sha256` identifies copied content.

Both initial and repair execution use the same saved copy. Integrity checks before
and after every attempt compare the copy against the report's recorded manifest.
Missing, modified or legacy copies cannot fall back to the live repository. Failed
integrity checks produce no trusted outcomes and are reported as snapshot errors,
not product defects. Successful attempts store the content fingerprint in their
execution result. Copies are retained in the configured snapshot store and are
separate from the project-input fingerprint. Capture is not an atomic filesystem
snapshot and does not pin Docker images or dependency versions. There is currently
no automatic storage-retention policy.

### Execution environment provenance

`DockerTestRunner.for_run()` creates a runner scoped to one verification run. Its
first eligible execution resolves the configured tag to one full local image ID,
inspects that ID, and starts a constrained inventory container with no project or
test mounts. The inventory records Python, platform and all installed Python
distribution versions. Both inventory and tests use the immutable ID with
`--pull never`; repair reuses the same runner, while a subsequent run resolves the
tag again. No runtime dependency installation occurs. The default image pins
pytest and its transitive dependencies in `sandbox/requirements.lock`.

Every attempt stores an environment record and fingerprint alongside the code
fingerprint. Missing images, ambiguous tag resolution, invalid inventories and
probe failures produce environment errors without test outcomes. These failures
are distinct from assertion failures and cannot promote a requirement's status.
Legacy attempts without metadata remain unknown. The fingerprint excludes the
requested tag and descriptive registry digests so equivalent tags do not imply a
runtime change. It identifies the recorded image, Python, platform and packages;
it is not a complete replay bundle and does not establish project dependency
readiness. Real Docker integration checks are opt-in and use deterministic model
fixtures rather than a live provider.

### Project setup preflight

After requirement analysis and before planning, `project_readiness.py` checks the
saved snapshot using the run-scoped runner. `readiness_probe.py` is read as trusted
source text and executed with `python -I` inside the pinned, read-only, network-free
container. The host does not import this probe or project modules. It reads static
PEP 621 runtime declarations, Python constraints and simple requirements files;
relative includes are confined to the snapshot. Package markers use the container's
Python/platform, and declared distributions, version constraints, transitive
requirements and requested extras are checked against installed metadata. Dynamic
or unsupported declarations are explicit unresolved checks, not presumed ready.

The probe checks only unconditional top-level absolute import roots via filesystem
module discovery. It does not import project code, invoke setup scripts or install
packages. Conventional `src` layouts use `src` and repository-root import paths in
that order, with source paths preserved in evidence references; packages named
`src` retain their name. Conflicting discovered module names block generation.
The preflight's environment record is reused for actual execution and repair.

Blocked checks return a terminal `blocked` run at the planning stage with analyzed
requirements, source audit, snapshot, environment and actionable setup details.
Planning, generation and execution are skipped. Missing sandbox/repository data is
`unknown`, allowing B0 proposals without claiming runtime readiness. Legacy runs
without a preflight remain unknown. Passing supported checks does not prove project
startup: conditional imports, selected optional project extras, external services
and native system dependencies are not validated.

Source modules that shadow Python standard-library roots or the pytest, pluggy and
packaging runner dependencies are rejected as layout conflicts. This prevents an
import path from replacing the tools used to collect and interpret test outcomes.
