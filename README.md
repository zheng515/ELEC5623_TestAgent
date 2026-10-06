# ReqTest — Requirement-Aware Verification Agent

ReqTest is the University of Sydney ELEC5623 Group 04 project. It aims to connect natural-language requirements, Python source code, pytest tests, and execution evidence in an agent-driven verification workflow.

This repository contains a working **frontend, backend, B0/B2 agent, repository inspection, and execution sandbox**. A run reads the public interface of the project under test, splits requirements into testable items, builds a structured test plan, generates traceable pytest tests from its scenarios, executes them in an isolated container, and records every outcome as evidence. With both model access and the sandbox available, identifiable construction errors may trigger one guarded refinement and re-execution attempt. RAG retrieval and mutation testing remain planned integrations. **No behavior is ever reported as `Verified`**: passing tests show the stated behavior held for the cases that were written, not that those cases were enough.

## Technology

| Area | Current implementation |
| --- | --- |
| Frontend | React 19, TypeScript, vinext/Vite, and an English responsive interface |
| Backend | FastAPI, Pydantic, and versioned REST endpoints with OpenAPI documentation |
| Agent | Anthropic Messages API with structured output for requirement analysis, scenario planning, and test generation |
| Inspection | Read-only AST reading of the project under test, confined to a configured root |
| Execution | pytest inside a Docker sandbox with no network, a read-only filesystem, and resource limits |
| Persistence | SQLite for projects, requirements, goals, runs, events, and reports |
| Checks | pytest, Ruff, TypeScript, ESLint, Vitest, and a production build |

## Requirements and setup

Install Python 3.11+ and Node.js 22.13+. The recommended Node version is recorded in `.nvmrc`.

The agent stages need an Anthropic API key. Copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY`, or export it in your shell. **Without a key the app still starts**, in scaffold mode: projects and runs are recorded, but no requirement is analysed and no test is generated. `GET /api/v1/system` reports which mode is active.

Reading the project under test needs one more setting. `REQTEST_REPOSITORY_ROOT` is the directory that project repositories live under; a run may only read paths inside it. The server saves a bounded code copy locally and sends only public interfaces to the model. Leaving it unset means the saved repository reference is stored but never read, which is the safe default.

Executing generated tests additionally needs Docker. Build the sandbox image once:

```bash
bash scripts/build-sandbox.sh
```

Without Docker or the image, runs still analyse requirements, plan scenarios, and generate tests; they report that execution is not connected rather than skipping it silently. **Generated test code is model output and only ever runs inside that container** — there is no host-execution fallback.

From the repository root:

```bash
# If you use nvm, run: nvm install && nvm use
bash scripts/setup.sh
bash scripts/dev.sh
```

Open the frontend at http://localhost:3000. The API is available at http://127.0.0.1:8000/api/v1, and its interactive documentation is at http://127.0.0.1:8000/docs. Press `Ctrl+C` to stop both services. The development script checks whether ports 3000 and 8000 are available before starting. On Windows, run the shell scripts in WSL.

**Those two commands start the application, but a run will do nothing on its own.** With no further configuration the app starts in scaffold mode: it records projects and runs, and every agent capability reports `not_connected`. Each capability is switched on by one piece of configuration:

| To get | Do this | Then `/api/v1/system` reports |
| --- | --- | --- |
| Requirement analysis, test planning, and generation | Set `ANTHROPIC_API_KEY` in `backend/.env` or your shell | `analysis`, `planning`, `generation` ready; mode `baseline_b0` |
| Reading the project under test | Set `REQTEST_REPOSITORY_ROOT` to the directory your repositories live under | `inspection` ready |
| Running the generated tests | Start Docker, then `bash scripts/build-sandbox.sh` | `execution` ready |

Copy `backend/.env.example` to `backend/.env` and fill in the values you want. A blank value means *not configured*, so copying the file without editing it changes nothing. Open http://localhost:3000 and check the **Integration status** panel, or `curl http://127.0.0.1:8000/api/v1/system`, to see which capabilities are live — the app always reports what it can and cannot do rather than failing silently.

Settings are read once at startup, so restart the backend after changing them.

To run the services separately, use two terminals after setup:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run dev
```

The frontend development server proxies `/api` to the backend. Copy either directory's `.env.example` to `.env` if you need to change the defaults. SQLite data is stored in `backend/data/reqtest.db` and is ignored by Git. The setup script also recognizes an optional, Git-ignored `.tools/node` installation for local development.

## What you can do now

Sign in with an email and password, or select **Create account** to register. Registration
signs you in immediately. Passwords must contain 8–128 characters. The workspace restores
your session on reload, and **Sign out** revokes the current session. Projects, runs, and
report downloads are private to the account that created them.

### Authentication API

Authentication follows the existing versioned JSON REST design:

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `{name, email, password}` → user and session cookie; 201 |
| POST | `/api/v1/auth/login` | `{email, password}` → user and session cookie; 200 |
| GET | `/api/v1/auth/me` | Current user; 200, or 401 when signed out |
| POST | `/api/v1/auth/logout` | Revoke the session and clear its cookie; 204 |

User responses contain `id`, `name`, `email`, and `created_at`; never password hashes or
session tokens. Email addresses are validated with `email-validator`, normalized (including
internationalized domains), and stored in lowercase. This validates syntax but does not prove
that the mailbox exists or belongs to the user; that requires an email-verification flow.
Duplicate emails return 409, invalid inputs return 422, and invalid credentials return 401. Registration and
login share a persistent limit of 20 attempts per client IP per 15 minutes (429 when exceeded).

Existing project/run/report paths and JSON response structures are unchanged, but require
the session cookie. Another user's records return 404. Health and integration status remain
public. Send `Content-Type: application/json` on every POST, including bodyless run creation
and logout. Browser clients must send credentials; cross-origin frontend URLs must be listed
in `REQTEST_CORS_ORIGINS`. Keep frontend and API on the same site, preferably using `/api`
through a reverse proxy. Cookie sessions do not use browser local storage.

Passwords use salted scrypt (`N=131072`, `r=8`, `p=1`). Random session tokens are stored only
as SHA-256 hashes in SQLite; cookies are HttpOnly and SameSite=Lax. Sessions expire after
seven days by default (`REQTEST_SESSION_TTL_SECONDS`). For HTTPS, set
`REQTEST_SESSION_COOKIE_SECURE=true`. JSON-only writes and Origin checks protect cookie
authentication against cross-site form submissions. API responses disable caching.

Startup adds authentication tables and a nullable project owner column to existing SQLite
databases without deleting existing data. Legacy projects remain unowned and hidden; they are
not automatically claimed by the first registered account. An administrator can assign a
known legacy project explicitly after backing up the database, for example with parameterized
SQL: `UPDATE projects SET owner_id = ? WHERE id = ? AND owner_id IS NULL`. Run ownership follows
its project. Email verification, password reset, and third-party sign-in are not included.

The repository inspection root is still shared server configuration, not a per-user repository
permission system. Run this as a trusted local/team tool; public multi-tenant repository hosting
requires separate repository permissions and deployment controls. Behind a reverse proxy,
configure trusted proxy addresses before relying on per-client throttling.

### Verification workspace

1. Open **Overview** to browse or search projects, open recent runs, and see integration status.
2. Open **New verification task** to enter a project name, requirement text, verification goal, and an optional repository reference. You can import a `.txt` or `.md` requirement file, or use the English shipping example.
3. Submit the form to save the project, queue a run, and open **Agent workspace**. If run creation fails, the project remains saved and a run can be created from its workspace.
4. Follow live workflow stages (refreshed every two seconds), recorded events, current metrics, and unresolved issues in **Agent workspace**. Expand **Test plan** scenarios to see their normal, boundary, or negative category, preconditions, inputs, steps, expected result, source evidence, assumptions, linked tests, and execution outcomes.
5. Open **Requirements & evidence** to read the saved requirements and filter the extracted behaviors by verification status.
6. Open **Runs & reports** for the saved test plan, requirement-to-test mapping table, run metrics, and portable HTML or JSON report downloads. Page links retain the selected project and run. Downloads are available after the run stops. Expand **Execution history** to compare original and repaired test code, outcomes, and sandbox diagnostics.

### Verify the test-plan workflow

1. Configure model credentials in `backend/.env` and restart the backend. Confirm `/api/v1/system` shows `baseline_b0` or `baseline_b2` and **Structured test planning** is ready.
2. Create a task using **Use shipping example**, then submit once. The agent performs analysis, planning, and generation automatically; no manual approval is required between stages.
3. In **Agent workspace**, check **Plan tests** and the **Test plan created** event. Expand a scenario and compare its expected result and source quote with the submitted requirements. Category counts and scenario content depend on the model and the stated requirements; missing business rules should remain gaps or assumptions.
4. Confirm each generated test names its scenario ID and requirement ID. Review **Requirements without scenarios** and **Scenarios without validated implementations** when present; a generated-test coverage rate does not mean every planned scenario was implemented.
5. Open **Runs & reports**, download HTML and JSON, and check that the plan and references are preserved. Refresh the page to verify persistence. Older runs display **No test plan recorded for this run** rather than inventing one.

`REQTEST_MAX_SCENARIOS` caps retained scenarios (default 80). Run submission returns **202 Accepted** with a persisted queued record and a `Location` pointing to `/api/v1/runs/{id}`. The browser polls saved progress every two seconds while a run is queued or running. All browser API requests use a 15-second timeout; model and sandbox time limits remain backend settings.

The local worker executes one job at a time. `REQTEST_MAX_ACTIVE_RUNS` limits queued and running jobs combined (default 20); a full queue returns 429. Submitting the same project while it has an active run returns that run. You can leave the page and return through its link without stopping the job. Temporary polling failures retain the last saved view and retry automatically.

Use one API process with this SQLite worker. On shutdown or restart, unfinished runs become failed and retain their saved stage outputs; start a new run to retry. Automatic continuation, cancellation, and distributed workers are not implemented. Existing in-flight model or sandbox calls may take until their configured timeout to end.

### Run modes

| Mode | When | What a run does |
| --- | --- | --- |
| `baseline_b0` | API credentials resolve without a sandbox | Reads available project interfaces, extracts structured requirements, flags ambiguous and untestable ones, plans scenarios with source references and expected results, generates pytest tests linked to those scenarios and their requirement ids, and reports coverage gaps |
| `baseline_b2` | API credentials and sandbox resolve | Runs the B0 stages, diagnoses execution errors, refines invalid tests once, and re-executes only those tests; assertion failures remain suspected product defects |
| `scaffold` | No credentials, or `REQTEST_LLM_ENABLED=false` | Records the project inputs and their fingerprint only |

A completed agent run reports two rates, and they measure different things:

- `requirement_coverage` — for new runs (`validation_version = 1`), share of extracted testable requirements linked to at least one artifact whose code passes server-side code-to-plan validation. It is labeled **Validated requirement links** in the UI. Unchecked or unsupported claims do not count; a requirement-level link does not mean every planned scenario is implemented. Old reports retain their historical metrics and are explicitly marked as not revalidated.
- `execution_success_rate` — share of **executed** tests that passed. `null` means nothing ran.

`semantic_coverage` and `mutation_score` stay `null`; `null` means *not evaluated*.

Verification statuses follow the evidence, and only ever downward from what was proven:

| Status | Meaning |
| --- | --- |
| `Uncertain` | The requirement is ambiguous or not testable as written |
| `Unverified` | No test ran against the real project, or one of its tests failed or errored |
| `Partially Verified` | The project was inspected, every planned scenario has a validated implementation, every linked artifact passes code-to-plan validation, and each validated test function has a final passing outcome |
| `Verified` | Not reachable yet; it needs test-adequacy analysis (mutation testing) |

### Code-to-plan validation

The planner saves a structured `check` before generation: an inspected target such as `shipping.fee`, JSON scalar or flat-list inputs (named keyword arguments are stored as `{name, value}` entries), and either an equality oracle or a precise built-in exception type. The server parses generated Python as AST without executing it on the host. Only direct function calls and straight-line test functions with supported checks are eligible. Local literal variables, imported aliases, and assertions on saved call results are supported. Wrong inputs, wrong or weakened oracles, fabricated APIs, shadowed bindings, constant checks, skip decorators, early returns, swallowed errors, and dynamic execution cannot establish a validated link.

Each artifact records `validation_status`, `validation_issues`, and `validated_checks` with scenario IDs, test function names, targets, and call/assertion line numbers. These fields are computed by the server; model-provided values are overwritten. **Needs review** artifacts remain visible, including their code and declared links, but are excluded from coverage and automatic sandbox execution. Repairs are checked again against the saved contract. Multi-function artifacts require final execution outcomes for every validated test function before partial verification is possible.

Nested input objects, missing repository interfaces or contracts, classes, helpers, parameterization, fixture-dependent behavior, unresolved assumptions, and setup preconditions currently require review. No manual approval step is inserted: supported checks continue automatically. Matching a contract is not proof that the planner interpreted the requirement correctly, that extraction was complete, or that the tests are adequate. The original document-to-plan semantics still need separate assessment.

Automatic repair is deliberately narrow: it can remove an unused fixture parameter explicitly named by a recorded missing-fixture error. The server compares the complete module AST and preserves test bodies, assertions, inputs, project calls, imports, helper functions, decorators, and control flow. Constant-only checks, modules without identifiable project calls, dynamic namespace access, and unparseable baselines are rejected. Syntax errors and other unsupported edits remain recorded errors rather than being rewritten without a protected baseline. Rejected replacements are not executed; their reasons appear in activity and unresolved issues, and original code and execution evidence remain available. This protects repair integrity; it does not prove the original tests implement every planned scenario or establish test adequacy.

Remote repositories are **not** cloned. A reference must be a local path inside `REQTEST_REPOSITORY_ROOT`; a URL is refused with an explanation.

`mode` records the active workflow. `baseline_b0` is one direct generation pass without retrieval or feedback. `baseline_b2` adds execution feedback and one bounded repair attempt for invalid tests. Neither mode includes RAG retrieval yet.

## Repository layout

```text
backend/
  app/
    main.py                   FastAPI app factory and startup
    schemas.py                Project, behavior, run, and report contracts
    api/routes.py             Versioned API routes
    core/config.py            Environment settings
    core/database.py          SQLite storage
    services/llm.py           Anthropic client and structured-output wrapper
    services/analyzer.py      Requirement structuring and ambiguity detection
    services/planner.py       Structured scenarios, source links, and planning gaps
    services/generator.py     Plan-driven test generation, traceability, and coverage gaps
    services/inspector.py     Read-only interface extraction from the project under test
    services/runner.py        Docker sandbox execution and result parsing
    services/orchestrator.py  Agent interface, scaffold and B0 implementations
  sandbox/Dockerfile          Image generated tests execute in
  tests/test_api.py           API and persistence tests
  tests/test_agent.py         Agent stage tests against a fake model
  tests/test_runner.py        Sandbox command and result-parsing tests
  tests/test_inspector.py     Inspection and path-confinement tests
  pyproject.toml
  requirements-dev.lock       Pinned development dependencies
frontend/
  app/page.tsx                Navigation, data loading, and task actions
  app/layout.tsx              Document layout and metadata
  app/globals.css             Responsive styles
  components/                Overview, task form, workspace, evidence, report
  hooks/use-resource.ts       Async loading and error states
  lib/api.ts                  API client and report download
  lib/navigation.ts           Hash-based page links
  lib/types.ts                Frontend API types
  tests/workspace.test.tsx    Component interaction tests
  vite.config.ts              Development proxy and build configuration
scripts/
  setup.sh                    Install dependencies
  build-sandbox.sh            Build the test-execution image
  dev.sh                      Start both services
  check.sh                    Run project checks
docs/architecture.md          API and future agent integration points
.github/workflows/ci.yml      Continuous integration checks
```

## Checks

```bash
bash scripts/check.sh
```

This runs backend lint and tests, frontend type checking and linting, Vitest component tests, and the frontend build. No check calls a model API or starts a container: the agent stages are tested against a fake model and the sandbox against a captured `docker` command line. Component tests use jsdom; they do not replace visual testing in a browser.

## Next integration steps

In proposal order, the remaining work is:

1. **RAG evidence retrieval (FR5).** This turns the B0 baseline into the B1 configuration.
2. **Mutation testing.** The only route to a `Verified` status, and the proposal's mutation-score metric.
3. **Requirement documents beyond plain text (FR1).**

Next, validate the background workflow against a representative local Python repository and a real sandbox before expanding retrieval. Source quotes are checked as nonblank, verbatim excerpts of the submitted text; this proves quote provenance, not the semantic correctness or completeness of the analysis.

The current foundation has no repository upload or cloning, automatic job resumption, distributed queue, or production deployment. A separate production backend needs an API URL, explicit CORS origins, HTTPS with secure session cookies, and an isolated execution environment. The development proxy is not a production API gateway.

Specification analysis includes a server-computed source audit. The workspace,
evidence page, and exported reports show unlinked source fragments, ambiguous
repeated quotes, and extraction-limit warnings. Validated requirement links apply
only to extracted testable requirements; 100% does not mean the entire specification
has been verified. Quote provenance alone cannot establish semantic completeness.

Each newly inspected repository is copied before interface analysis. Tests and
repairs execute against that saved copy rather than the mutable original directory.
The UI and HTML/JSON exports record its file manifest and content fingerprint, and
each execution attempt records the fingerprint it used. Missing or changed copies
block execution; outcomes are discarded if integrity fails after execution. Older
runs without a saved snapshot cannot establish the executed file contents.

Snapshots are retained under `backend/data/repository-snapshots` by default, or
`REQTEST_REPOSITORY_SNAPSHOT_ROOT` when configured. Each copy is limited to 2,000
files/directories and 20 MB by default (`REQTEST_MAX_SNAPSHOT_FILES`,
`REQTEST_MAX_SNAPSHOT_BYTES`). VCS metadata, virtual environments, build output,
caches, symlinks and special files are excluded and recorded. Ordinary data and
configuration files are retained. Copies exceeding a limit are refused, never
silently truncated. Storage currently has no automatic retention cleanup. Copying
is checked with a second source scan, not an atomic filesystem transaction; keep
source files stable during capture. The content fingerprint does not pin the
sandbox image or installed dependencies.

Each verification run resolves the sandbox tag once to a full local image ID.
Initial execution and repair reuse that ID with `--pull never`, so retagging the
image cannot change the environment within a run. A constrained container without
project mounts first records Python, platform and installed distribution versions.
Execution history and HTML/JSON exports include this environment fingerprint and
inventory. Preparation failures record no test outcomes and remain environment
issues, not product defects. Historical attempts without metadata show unknown
runtime versions. The default image pins pytest and its dependencies in
`backend/sandbox/requirements.lock`; rebuild it after changes to that file.

Run the optional real-container workflow checks after building the sandbox:

```bash
cd backend
REQTEST_RUN_DOCKER_TESTS=1 .venv/bin/pytest -q tests/test_docker_integration.py
```

These checks exercise the authenticated API, background worker, saved code copy,
actual Docker execution, defect preservation, safe fixture repair, and exported
provenance. Model responses are deterministic fixtures; these checks do not call
or validate a live model provider. The image must remain available locally for
replay; an environment record does not archive Docker layers or prove that the
image contains every dependency needed by a particular project.
