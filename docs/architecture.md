# Framework architecture

## Scope and trust boundary

The current product is a local requirement-analysis release. SQLite stores real input and run records. The deterministic analyzer decomposes source text into traceable behavior candidates, but does not claim semantic verification, inspect repositories, call LLMs, generate tests, or execute user code. Input documents and repository contents are evidence to analyse, never instructions granting tool permissions.

```text
React workspace → typed API client → /api/v1 → FastAPI routes
                                             ├─ SQLite Store
                                             └─ Orchestrator protocol
                                                  └─ AnalysisOrchestrator
                                                       └─ RequirementAnalyzer
```

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
| POST | /projects/{id}/runs | Analyze requirements synchronously; 201 |
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
- Current run mode is `analysis`, status is `blocked`, and stage is `understand`.
- `executed_tests = 0`; `semantic_coverage = null`; `mutation_score = null`. Null means not evaluated, not 0% coverage.
- The analyzer creates one candidate per sentence while preserving labels, source quotes, and line references. Every candidate remains `Unverified` until execution evidence exists.
- SQLite connections are per operation with transactions and foreign keys. This is local persistence, not a distributed job queue. Schema migrations will be needed when the schema changes.

## Agent integration points

`create_app(settings, orchestrator)` accepts an implementation of the `Orchestrator` protocol. This allows an implementation or a test double to be injected without changing the HTTP routes.

Suggested next components:

1. **RequirementAnalyzer** (implemented): requirement source references and conservative behavior decomposition.
2. **ArtifactInspector**: read-only source/test references and versioned snapshots.
3. **GapEvaluator**: behavior-to-test mappings and evidence-based status rules.
4. **TestGenerator**: test specifications, then pytest artifacts; generated is distinct from executed.
5. **SandboxRunner**: isolated execution with resource limits, test results, logs and exit codes.
6. **FailureDiagnoser**: evidence-backed diagnosis before any repair. Preserve legitimate failing tests for suspected code defects.
7. **MutationRunner**: selected relevant mutations, outcome classification and bounded improvement.

Before integrating a real long-running agent, expand run states to queued/running/blocked/completed/failed, separate events into append-only records, persist source/test snapshots and evidence references, and return 202 for enqueued work. Add polling or server-sent events to the frontend. The current synchronous endpoint is limited to quick requirement analysis.

The frontend contracts accept analysis and legacy scaffold records. Update both backend schemas and `frontend/lib/types.ts` together when adding more states. OpenAPI is available at `/openapi.json` for future type generation.

## Development and production

The dev frontend proxies `/api` to `BACKEND_URL` (default `http://127.0.0.1:8000`). A separate hosted API can be selected via the build-time `VITE_API_BASE_URL`; it is a public URL and must never contain credentials. Backend settings use the `REQTEST_` prefix. Secrets, databases and installed dependencies are ignored by Git.

Do not expose this local, unauthenticated scaffold to untrusted networks. Production authentication, jobs, deployment and execution isolation are separate future work. Frontend build success does not constitute a deployment or end-to-end browser verification.
