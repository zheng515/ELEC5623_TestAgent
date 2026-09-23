# ReqTest — Requirement-Aware Verification Agent

ReqTest is the University of Sydney ELEC5623 Group 04 project. It aims to connect natural-language requirements, Python source code, pytest tests, and execution evidence in an agent-driven verification workflow.

This repository contains a working **frontend, backend, B0/B2 agent, repository inspection, and execution sandbox**. A run reads the public interface of the project under test, splits requirements into testable items, generates traceable pytest tests, executes them in an isolated container, and records every outcome as evidence. With both model access and the sandbox available, execution errors trigger one evidence-grounded refinement and re-execution attempt. RAG retrieval and mutation testing remain planned integrations. **No behavior is ever reported as `Verified`**: passing tests show the stated behavior held for the cases that were written, not that those cases were enough.

## Technology

| Area | Current implementation |
| --- | --- |
| Frontend | React 19, TypeScript, vinext/Vite, and an English responsive interface |
| Backend | FastAPI, Pydantic, and versioned REST endpoints with OpenAPI documentation |
| Agent | Anthropic Messages API with structured output for requirement analysis and test generation |
| Inspection | Read-only AST reading of the project under test, confined to a configured root |
| Execution | pytest inside a Docker sandbox with no network, a read-only filesystem, and resource limits |
| Persistence | SQLite for projects, requirements, goals, runs, events, and reports |
| Checks | pytest, Ruff, TypeScript, ESLint, Vitest, and a production build |

## Requirements and setup

Install Python 3.11+ and Node.js 22.13+. The recommended Node version is recorded in `.nvmrc`.

The agent stages need an Anthropic API key. Copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY`, or export it in your shell. **Without a key the app still starts**, in scaffold mode: projects and runs are recorded, but no requirement is analysed and no test is generated. `GET /api/v1/system` reports which mode is active.

Reading the project under test needs one more setting. `REQTEST_REPOSITORY_ROOT` is the directory that project repositories live under; a run may only read paths inside it, and only their public interface. Leaving it unset means the saved repository reference is stored but never read, which is the safe default.

Executing generated tests additionally needs Docker. Build the sandbox image once:

```bash
bash scripts/build-sandbox.sh
```

Without Docker or the image, runs still analyse requirements and generate tests; they report that execution is not connected rather than skipping it silently. **Generated test code is model output and only ever runs inside that container** — there is no host-execution fallback.

From the repository root:

```bash
# If you use nvm, run: nvm install && nvm use
bash scripts/setup.sh
bash scripts/dev.sh
```

Open the frontend at http://localhost:3000. The API is available at http://127.0.0.1:8000/api/v1, and its interactive documentation is at http://127.0.0.1:8000/docs. Press `Ctrl+C` to stop both services. The development script checks whether ports 3000 and 8000 are available before starting. On Windows, run the shell scripts in WSL.

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
3. Submit the form to save the project, create a run, and open **Agent workspace**. If run creation fails, the project remains saved and a run can be created from its workspace.
4. Inspect the workflow stages, recorded events, current metrics, and unresolved issues in **Agent workspace**, and read each generated test with the requirements it is linked to.
5. Open **Requirements & evidence** to read the saved requirements and filter the extracted behaviors by verification status.
6. Open **Runs & reports** for the requirement-to-test mapping table, run metrics, and portable HTML or JSON report downloads. Page links retain the selected project and run.

### Run modes

| Mode | When | What a run does |
| --- | --- | --- |
| `baseline_b0` | API credentials resolve without a sandbox | Reads available project interfaces, extracts structured requirements, flags ambiguous and untestable ones, generates pytest tests linked to requirement ids, and reports coverage gaps |
| `baseline_b2` | API credentials and sandbox resolve | Runs the B0 stages, diagnoses execution errors, refines invalid tests once, and re-executes only those tests; assertion failures remain suspected product defects |
| `scaffold` | No credentials, or `REQTEST_LLM_ENABLED=false` | Records the project inputs and their fingerprint only |

A completed agent run reports two rates, and they measure different things:

- `requirement_coverage` — share of testable requirements linked to at least one **generated** test. It measures generation, not execution, and a requirement id the model invents is filtered out before it counts.
- `execution_success_rate` — share of **executed** tests that passed. `null` means nothing ran.

`semantic_coverage` and `mutation_score` stay `null`; `null` means *not evaluated*.

Verification statuses follow the evidence, and only ever downward from what was proven:

| Status | Meaning |
| --- | --- |
| `Uncertain` | The requirement is ambiguous or not testable as written |
| `Unverified` | No test ran against the real project, or one of its tests failed or errored |
| `Partially Verified` | The project was inspected and every test linked to this requirement passed against it |
| `Verified` | Not reachable yet; it needs test-adequacy analysis (mutation testing) |

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
    services/generator.py     Test generation, traceability, and coverage gaps
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

When runs become long-lived, replace the synchronous run endpoint with background execution and status updates; a B0 run is already slow enough to feel it.

The current foundation has no repository upload or cloning, background job queue, or production deployment. A separate production backend needs an API URL, explicit CORS origins, HTTPS with secure session cookies, and an isolated execution environment. The development proxy is not a production API gateway.
