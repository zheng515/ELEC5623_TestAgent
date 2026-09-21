# Framework architecture

## Scope and trust boundary

The current product is a local development tool. SQLite stores real input and run records. The B0 orchestrator reads the project under test, calls an LLM to analyse requirements and generate pytest tests, then executes those tests against that project in a container. Input documents and repository contents are evidence to analyse, never instructions granting tool permissions: both agent prompts state this, and the requirement text is passed inside delimiters as data.

**A repository reference is user input, so reading it is a trust boundary.** Inspection stays off until `REQTEST_REPOSITORY_ROOT` is set; every path must resolve inside that root, symlinks are never followed, remote URLs are refused rather than cloned, and only the public interface of each module is read — signatures, class names, docstrings, never whole file bodies. The repository is mounted into the sandbox read-only.

**Generated test code is untrusted model output and never runs on the host.** It executes only inside the sandbox image, and when Docker is unavailable it does not execute at all. There is no subprocess fallback, deliberately.

```text
React workspace → typed API client → /api/v1 → FastAPI routes
                                             ├─ SQLite Store
                                             └─ Orchestrator protocol
                                                  ├─ ScaffoldOrchestrator  (no credentials)
                                                  └─ DirectLLMOrchestrator (B0 baseline)
                                                       ├─ inspector → RepositorySnapshot
                                                       ├─ analyzer  → RequirementAnalysis
                                                       ├─ generator → GeneratedTestSuite
                                                       └─ runner    → ExecutionResult
                                                            └─ docker run (no network,
                                                                 repo mounted read-only)
```

`create_app` picks the orchestrator once at startup: `DirectLLMOrchestrator` when the Anthropic SDK resolves a credential, `ScaffoldOrchestrator` otherwise. Every agent stage declares a Pydantic output contract and receives a validated instance, so no stage parses free-form model prose.

## API v1

| Method | Path | Result |
| --- | --- | --- |
| GET | /health | Service health and version |
| GET | /system | Available and unconnected integrations |
| GET | /projects | Projects, newest first |
| POST | /projects | Validate and persist a project; 201 |
| GET | /projects/{id} | Project and original requirements |
| GET | /projects/{id}/runs | Persisted run history |
| GET | /runs?limit=5 | Recent runs across projects, newest first; limit 1–100 |
| POST | /projects/{id}/runs | Record a scaffold run synchronously; 201 |
| GET | /runs/{id} | Run, events, input fingerprint and report |
| GET | /runs/{id}/report | JSON report download |

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
- Run mode is `scaffold` (status `blocked`) or `baseline_b0` (status `completed` or `failed`). A failed run keeps whatever it had already extracted and records why it stopped; it never substitutes a plausible result.
- `executed_tests = 0`; `semantic_coverage = null`; `mutation_score = null` in every mode. Null means not evaluated, not 0% coverage.
- `requirement_coverage` is the share of testable requirements linked to at least one generated test. It is derived from `GeneratedTest.requirement_ids`, which is filtered against the extracted requirement ids, so a reference the model invents cannot inflate it. It measures generation, not execution.
- `execution_success_rate` is the share of executed tests that passed, and `null` when nothing ran. `executed_tests` counts cases pytest actually reported, so a sandbox that produced no readable report counts as zero rather than as success.
- `coverage_gaps` lists testable requirements that no generated test references (FR14).
- Verification status is decided in `_status` and never rises above what was proven. `Uncertain` when the requirement is ambiguous or untestable. `Unverified` when the project was not inspected, when no linked test ran, or when any linked test failed or errored — a green test against a *guessed* module is not evidence. `Partially Verified` when the project was inspected and every linked test passed against it. `Verified` is deliberately unreachable: passing tests show the behavior held for the cases that were written, and nothing yet evaluates whether those cases were adequate. Mutation testing is what unlocks it.
- `evidence` holds one record per executed test, and each behavior's `evidence_refs` point at the outcomes of its own tests, which is the requirement → test → evidence chain the UI walks.
- The behavior contract reserves the proposal's four statuses: Verified, Partially Verified, Unverified, Uncertain. No synthetic behaviors are inserted.
- SQLite connections are per operation with transactions and foreign keys. This is local persistence, not a distributed job queue. Schema migrations will be needed when the schema changes.

## Agent integration points

`create_app(settings, orchestrator)` accepts an implementation of the `Orchestrator` protocol. This allows an implementation or a test double to be injected without changing the HTTP routes.

Implemented:

1. **RequirementAnalyzer** (`services/analyzer.py`): structured requirements with verbatim source quotes, testability, and ambiguity findings. Ids are renumbered on collision because traceability depends on them.
2. **TestGenerator** (`services/generator.py`): pytest artifacts linked to requirement ids, plus coverage gaps. Generated is distinct from executed everywhere in the report.

3. **SandboxRunner** (`services/runner.py`): `docker run` with `--network none`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, and memory, CPU, PID and wall-clock limits. Results are read from pytest's own JUnit XML; a timeout force-removes the container. `--continue-on-collection-errors` is required, not cosmetic: without it one uncollectable generated module aborts the session and every other result is lost.

   The guarantees were checked by running probe tests inside the image rather than by trusting the flags: outbound sockets fail, `/` and `/home/sandbox` are unwritable, `/tmp` and the mounted workspace are writable (pytest needs both), the process runs as uid 10001, and `mount()` fails because capabilities are dropped. A container that exceeds its memory limit is killed with exit 137 and produces no report, which is recorded as zero executions and an explanatory issue — never as a pass. Re-run those probes after changing any flag in `_command`.

4. **ArtifactInspector** (`services/inspector.py`): `ast`-based interface extraction confined to `REQTEST_REPOSITORY_ROOT`. Module names are derived as they would be imported from the mount root, so `pkg/orders.py` becomes `pkg.orders`; the root directory's own `__init__.py` is skipped because nothing imports it from there. The snapshot carries a SHA-256 of the interfaces, so a run can be tied to exactly what it read (NFR6).

Still to build:

5. **EvidenceRetriever**: the RAG store that turns B0 into B1.
6. **FailureDiagnoser**: evidence-backed diagnosis before any repair. Preserve legitimate failing tests for suspected code defects.
7. **MutationRunner**: selected relevant mutations, outcome classification and bounded improvement.

Before integrating a real long-running agent, expand run states to queued/running/blocked/completed/failed, separate events into append-only records, persist source/test snapshots and evidence references, and return 202 for enqueued work. Add polling or server-sent events to the frontend. The current synchronous endpoint is deliberately only for quick scaffold recording.

`frontend/lib/types.ts` mirrors the backend schemas by hand, so update both together when adding states. OpenAPI is available at `/openapi.json` for future type generation.

## Development and production

The dev frontend proxies `/api` to `BACKEND_URL` (default `http://127.0.0.1:8000`). A separate hosted API can be selected via the build-time `VITE_API_BASE_URL`; it is a public URL and must never contain credentials. Backend settings use the `REQTEST_` prefix, except `ANTHROPIC_API_KEY`, which keeps the SDK's own name. Leaving it unset is a supported configuration, not an error: the app falls back to scaffold mode and says so through `/api/v1/system`. The same applies to a missing Docker daemon or sandbox image, which leaves execution unconnected.

The orchestrator, the runner and the inspection setting are all resolved once, at startup. Starting Docker, exporting a key, or setting a repository root while the server is running has no effect until it restarts. Secrets, databases and installed dependencies are ignored by Git.

Do not expose this local, unauthenticated scaffold to untrusted networks. Production authentication, jobs, deployment and execution isolation are separate future work. Frontend build success does not constitute a deployment or end-to-end browser verification.
