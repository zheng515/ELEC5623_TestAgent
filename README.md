# ReqTest — Requirement-Aware Verification Agent

ReqTest is the University of Sydney ELEC5623 Group 04 project. It aims to connect natural-language requirements, Python source code, pytest tests, and execution evidence in an agent-driven verification workflow.

This repository currently contains a working **frontend and backend foundation**. Users can save project requirements and a verification goal, create a setup run, inspect its activity record, and download a JSON report. Requirement analysis, repository inspection, test generation, sandboxed execution, failure diagnosis, and mutation testing are planned integrations. The application does not claim that a setup run has verified any behavior.

## Technology

| Area | Current implementation |
| --- | --- |
| Frontend | React 19, TypeScript, vinext/Vite, and an English responsive interface |
| Backend | FastAPI, Pydantic, and versioned REST endpoints with OpenAPI documentation |
| Persistence | SQLite for projects, requirements, goals, runs, events, and reports |
| Checks | pytest, Ruff, TypeScript, ESLint, Vitest, and a production build |

## Requirements and setup

Install Python 3.11+ and Node.js 22.13+. The recommended Node version is recorded in `.nvmrc`. No LLM API key is needed for the current foundation.

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

1. Open **Overview** to browse or search projects, open recent runs, and see integration status.
2. Open **New verification task** to enter a project name, requirement text, verification goal, and an optional repository reference. You can import a `.txt` or `.md` requirement file, or use the English shipping example.
3. Submit the form to save the project, create a setup run, and open **Agent workspace**. If run creation fails, the project remains saved and a run can be created from its workspace.
4. Inspect the workflow stages, recorded events, current metrics, and integration blockers in **Agent workspace**.
5. Open **Requirements & evidence** to read the saved requirements. Once a future analyzer supplies structured behaviors, this page can filter them by status and show their evidence links.
6. Open **Runs & reports** to switch between runs and download a JSON report. Page links retain the selected project and run.

A current run has status `blocked` and mode `scaffold`. It records zero executed tests, no analyzed behaviors, and `null` for semantic coverage and mutation score; `null` means *not evaluated*. A repository path or URL is saved as text only. The application does not clone, inspect, or execute repository code yet.

## Repository layout

```text
backend/
  app/
    main.py                   FastAPI app factory and startup
    schemas.py                Project, behavior, run, and report contracts
    api/routes.py             Versioned API routes
    core/config.py            Environment settings
    core/database.py          SQLite storage
    services/orchestrator.py  Agent interface and scaffold implementation
  tests/test_api.py           API and persistence tests
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
  dev.sh                      Start both services
  check.sh                    Run project checks
docs/architecture.md          API and future agent integration points
.github/workflows/ci.yml      Continuous integration checks
```

## Checks

```bash
bash scripts/check.sh
```

This runs backend lint and API tests, frontend type checking and linting, Vitest component tests, and the frontend build. Component tests use jsdom; they do not replace visual testing in a browser.

## Next integration steps

Use the contracts in `docs/architecture.md` and replace `ScaffoldOrchestrator` with the real verification workflow. Add requirement decomposition and evidence references first, followed by code and test mapping. Build an isolated runner before executing generated tests or mutations. When runs become long-lived, replace the synchronous setup-run endpoint with background execution and status updates.

The current foundation has no user accounts, repository upload or cloning, background job queue, automatic test execution, or production deployment. A separate production backend would need an API URL, CORS configuration, authentication, and an isolated execution environment. The development proxy is not a production API gateway.
