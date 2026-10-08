# ReqTest — Requirement-Aware Verification Agent

ReqTest is the University of Sydney ELEC5623 Group 04 project. It aims to connect natural-language requirements, Python source code, pytest tests, and execution evidence in an agent-driven verification workflow.

This repository contains a working **frontend, backend, B0/B2 agent, repository inspection, and execution sandbox**. A run reads the public interface of the project under test, splits requirements into testable items, builds a structured test plan, generates traceable pytest tests from its scenarios, executes them in an isolated container, and records every outcome as evidence. With both model access and the sandbox available, identifiable construction errors may trigger one guarded refinement and re-execution attempt. RAG retrieval and mutation testing remain planned integrations. **No behavior is ever reported as `Verified`**: passing tests show the stated behavior held for the cases that were written, not that those cases were enough.

## Technology

| Area | Current implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, and an English responsive interface |
| Backend | FastAPI, Pydantic, and versioned REST endpoints with OpenAPI documentation |
| Agent | OpenAI Responses API with structured output for requirement analysis, scenario planning, and independent oracle review; deterministic pytest templates; Anthropic remains optional |
| Inspection | Read-only AST reading of the project under test, downloaded from a GitHub URL at a pinned commit or confined to a configured local root |
| Execution | pytest inside a Docker sandbox with no network, a read-only filesystem, and resource limits |
| Persistence | SQLite for projects, requirements, goals, runs, events, and reports |
| Checks | pytest, Ruff, TypeScript, ESLint, Vitest, and a production build |

## Requirements and setup

Install Python 3.11+ (linked SQLite 3.35+) and Node.js 22.13+. The recommended Node version is recorded in `.nvmrc`.

The agent stages use OpenAI by default. Copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY`, or export it in your shell. `REQTEST_LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` and an Anthropic `REQTEST_LLM_MODEL` keeps the previous provider available. **Without a key the app still starts**, in scaffold mode: projects and runs are recorded, but no requirement is analysed and no test is generated. `GET /api/v1/system` reports which mode is active.

The default OpenAI model is `gpt-5.6-luna`; override it with `REQTEST_LLM_MODEL`. Restart the backend after changing `.env`. The OpenAI adapter sends `store=false` and does not automatically retry failed API requests. Model access, credentials and available quota are checked when a model request runs.

Reading the project under test works from a GitHub URL with no further setting: each run resolves the URL's branch to a commit, downloads that commit through the GitHub API, and records which commit it read. Private repositories need `REQTEST_GITHUB_TOKEN`. To read local directories instead, set `REQTEST_REPOSITORY_ROOT` to the directory that project repositories live under; a run may only read paths inside it. Either way, the server saves a bounded code copy locally and sends only public interfaces to the model. Leaving the root unset means a local path is stored but never read, which is the safe default.

Executing generated tests additionally needs Docker. Build the sandbox image once:

```bash
bash scripts/build-sandbox.sh
```

Without Docker or the image, runs still analyse requirements, plan scenarios, and generate tests; they report that execution is not connected rather than skipping it silently. **Tests are rendered from independently reviewed scenario contracts and only ever run inside that container** — there is no host-execution fallback.

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
| Requirement analysis, test planning, and generation | Set `OPENAI_API_KEY` in `backend/.env` or your shell | `analysis`, `planning`, `generation` ready; mode `baseline_b0` |
| Reading the project under test from GitHub | Nothing for public repositories; set `REQTEST_GITHUB_TOKEN` for private ones | `inspection` ready |
| Reading the project under test from a local path | Set `REQTEST_REPOSITORY_ROOT` to the directory your repositories live under | `inspection` ready |
| Running the generated tests | Start Docker, then `bash scripts/build-sandbox.sh` | `execution` ready |
| Watching GitHub repositories for new commits | Model credentials and GitHub downloads (both above); on by default | `watch` ready |

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

### Requirement document import

PDF imports use native text where available and local Tesseract OCR for pages without
text, including sparse native headings over scanned images. Word `.docx` and legacy
binary `.doc` imports are supported; `.doc` conversion happens automatically on the
server using macOS `textutil` or Linux LibreOffice. Install tools with:

```bash
bash scripts/setup.sh
bash scripts/setup-document-tools.sh
bash scripts/dev.sh
```

The form shows OCR/conversion readiness, then previews text by source location. Saved
metadata includes the original filename/hash, PDF physical page or Word paragraph,
extraction method, and OCR mean word confidence score when available. OCR may misread
numbers and operators; its score does not prove transcription accuracy. Converted
Word paragraph numbers refer to the converted body and may differ from the original.
These labels and warnings persist in analysis, test plans, and JSON/HTML reports.
Editing imported text clears its file link; previous runs keep their original source.

Unreadable pages are listed explicitly; empty extraction is rejected. Missing tools or
language data produce actionable errors. Native-text PDF and `.docx` imports continue
to work without OCR/conversion tools. Default OCR language is English (`eng`); install
additional language data and configure `REQTEST_DOCUMENT_OCR_LANGUAGES` when needed.
Files are limited to 5 MB, PDFs to 100 pages, OCR to 20 pages per import, and text to
50,000 characters. The default import deadline is 120 seconds. Parsing does not prove
requirement completeness or preserve all complex layout and embedded content.

See [Document import and acceptance checks](docs/document-import.md) for source
numbering, installation, settings, limitations, and step-by-step verification.

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

The repository inspection root and `REQTEST_GITHUB_TOKEN` are shared server configuration, not a
per-user repository permission system: every account can read what the token can read. Run this as a trusted local/team tool; public multi-tenant repository hosting
requires separate repository permissions and deployment controls. Behind a reverse proxy,
configure trusted proxy addresses before relying on per-client throttling.

### Verification workspace

1. Open **Overview** to browse or search projects, open recent runs, and see integration status.
2. Open **New verification task** to enter a project name, requirement text, verification goal, and an optional repository reference: a GitHub URL such as `https://github.com/owner/repository`, optionally ending in `/tree/<branch>/<folder>` or `/commit/<sha>`, or a local path inside the configured root. You can import a `.txt`, `.md`, `.pdf` (including scanned pages), or Word `.docx`/`.doc` requirement file, or use the English shipping example.
3. Submit the form to save the project, queue a run, and open **Agent workspace**. If run creation fails, the project remains saved and a run can be created from its workspace.
4. In **Agent workspace**, search and select test cases to inspect inputs, steps, expected results, saved execution evidence, and requirement sources. Expand the technical details for recorded events, metrics, unresolved issues, and the full test plan. Active runs refresh every two seconds; progress shows the recorded stage without an estimated percentage.
5. Open **Requirements & evidence** to read the saved requirements and filter the extracted behaviors by verification status.
6. Open **Runs & reports** for the saved test plan, requirement-to-test mapping table, run metrics, and portable HTML or JSON report downloads. Page links retain the selected project and run. Downloads are available after the run stops. Expand **Execution history** to compare original and repaired test code, outcomes, and sandbox diagnostics.

### Verify the test-plan workflow

1. Configure model credentials in `backend/.env` and restart the backend. Confirm `/api/v1/system` shows `baseline_b0` or `baseline_b2` and **Structured test planning** is ready.
2. Create a task using **Use shipping example**, then submit once. The agent performs analysis, planning, and generation automatically; no manual approval is required between stages.
3. In **Agent workspace**, select a test case and compare its expected result and source quote with the submitted requirements. The technical details retain the **Test plan created** event and complete scenario records. Category counts and scenario content depend on the model and the stated requirements; missing business rules should remain gaps or assumptions.
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

- `requirement_coverage` — for new runs using the current validation rules, share of extracted testable requirements linked to at least one artifact whose code passes server-side code-to-plan validation. It is labeled **Validated requirement links** in the UI. Unchecked or unsupported claims do not count; a requirement-level link does not mean every planned scenario is implemented. Old reports retain their historical metrics and are explicitly marked as not revalidated.
- `execution_success_rate` — share of **executed** tests that passed. `null` means nothing ran.

Reports expose the calculated requirement-link coverage and execution success rate. Semantic coverage and mutation score are not implemented and are omitted from new reports; old report JSON remains readable.

Verification statuses follow the evidence, and only ever downward from what was proven:

| Status | Meaning |
| --- | --- |
| `Uncertain` | The requirement is ambiguous or not testable as written |
| `Unverified` | No test ran against the real project, or one of its tests failed or errored |
| `Partially Verified` | The project was inspected, every scenario for this requirement has a validated implementation, every linked artifact passes code-to-plan validation, and every function implementing this requirement has a final passing outcome |
| `Verified` | Not reachable yet; it needs test-adequacy analysis (mutation testing) |

### Code-to-plan validation

Validation version 3 adds a separate AI oracle review after planning and before generation. The reviewer receives the original requirement text, linked source quotes, exact scenario contracts, and inspected interfaces, without any prior grounding approval. It assesses expected values, units, boundaries, exception types, and missing assumptions. The server verifies that every linked requirement has a verbatim original-source citation and binds the assessment to a hash of the saved scenario; model-authored approvals are discarded. A contradicted or insufficient assessment, missing/duplicate decision, invalid citation, review API failure, or changed scenario excludes its generated artifacts from coverage and automatic execution. Proposed scenarios and review reasons remain visible in the test plan and HTML export.

Before generation, the server selects only scenarios with current source support. If none qualify, it skips test rendering and sandbox execution, preserving the full plan, review reasons, and coverage gaps. Mixed plans render only supported scenarios. Runs with zero artifacts show `No tests generated` or `Review needed · no tests generated`; a completed workflow does not imply tests exist.

This adds one structured model request per nonempty plan. Citations are checked deterministically, but the semantic judgment remains an AI assessment using the configured model, not proof or test adequacy. No additional human approval step is required. A mixed artifact containing an unsupported scenario is excluded as a whole. Old results keep their stored evidence and must be rerun for these checks.

The planner saves a structured `check` before generation: an inspected target such as `shipping.fee`, JSON scalar or flat-list inputs (named keyword arguments are stored as `{name, value}` entries), and either an equality oracle or a precise built-in exception type. The server parses generated Python as AST without executing it on the host. Only direct function calls and straight-line test functions with supported checks are eligible. Local literal variables, imported aliases, and assertions on saved call results are supported. Wrong inputs, wrong or weakened oracles, fabricated APIs, shadowed bindings, constant checks, skip decorators, early returns, swallowed errors, and dynamic execution cannot establish a validated link.

The structural checks introduced in validation version 2 check both directions: every linked scenario needs a matching check, and every observed equality or exception check must match a linked scenario contract. Extra assertions, unused project-call results (including setup calls), and dynamic assertion messages make the entire artifact **Needs review**. Literal assertion messages remain supported. Rejected artifacts cannot produce suspected product defects because they are never executed. Runs saved under earlier rules keep their original evidence and display a notice to start a new run; they are not silently revalidated.

Each artifact records `validation_status`, `validation_issues`, and `validated_checks` with scenario IDs, test function names, targets, and call/assertion line numbers. These fields are computed by the server; model-provided values are overwritten. **Needs review** artifacts remain visible, including their code and declared links, but are excluded from coverage and automatic sandbox execution. Repairs are checked again against the saved contract.

New reports save `outcome_mapping_version = 1`. Requirement conclusions, evidence references, and requirement mapping tables follow **requirement → scenario → validated function → final outcome**, matching the artifact ID, module, and function name. If one file contains an independent passing function for R1 and a failing function for R2, R1 can remain `Partially Verified` while R2 is `Unverified`. Missing outcomes for R2 do not invalidate R1's recorded passing function. If the same function checks both requirements, its failure applies to both: pytest does not record individual assertion outcomes. Collection errors and unmatched outcomes remain in global execution evidence but cannot substitute for a missing function result. Historical reports are flagged without rewriting saved conclusions; start a new run to apply the current mapping.

Nested input objects, missing repository interfaces or contracts, classes, helpers, parameterization, fixture-dependent behavior, unresolved assumptions, and setup preconditions currently require review. No manual approval step is inserted: supported checks continue automatically. Matching a contract is not proof that the planner interpreted the requirement correctly, that extraction was complete, or that the tests are adequate. The original document-to-plan semantics still need separate assessment.

Automatic repair is deliberately narrow: it can remove an unused fixture parameter explicitly named by a recorded missing-fixture error. The server compares the complete module AST and preserves test bodies, assertions, inputs, project calls, imports, helper functions, decorators, and control flow. Constant-only checks, modules without identifiable project calls, dynamic namespace access, and unparseable baselines are rejected. Syntax errors and other unsupported edits remain recorded errors rather than being rewritten without a protected baseline. Rejected replacements are not executed; their reasons appear in activity and unresolved issues, and original code and execution evidence remain available. This protects repair integrity; it does not prove the original tests implement every planned scenario or establish test adequacy. The candidate is computed deterministically. Current validation rejects fixture arguments, so normal new tests do not reach this repair case.

### GitHub repositories

A repository reference may be a GitHub URL. Each run downloads it at a pinned commit; nothing on the server's own filesystem is exposed, so this needs no repository root and is on by default (`REQTEST_GITHUB_ENABLED=false` turns it off).

| URL form | What is read |
| --- | --- |
| `https://github.com/owner/repository` (also `.git`, `git@github.com:owner/repository.git`) | Default branch |
| `https://github.com/owner/repository/tree/<branch-or-tag>` | That branch or tag; names containing `/` work |
| `https://github.com/owner/repository/tree/<branch>/<folder>` | Only that folder, as the repository root. Use it when the Python package lives in a subdirectory |
| `https://github.com/owner/repository/commit/<sha>` | That exact commit |

The branch is resolved to a commit first and the archive of exactly that commit is downloaded, so the report names the commit that was tested even if the branch moves later. The workspace, HTML and JSON reports show the repository, ref, commit SHA and folder alongside the saved snapshot. Each new run resolves the branch again.

Only the owner, repository, ref and folder are taken from the URL; requests go to `api.github.com`, and redirects are followed only to GitHub's API and archive hosts. Other hosts, file links, and URLs containing credentials are refused. A project whose URL embeds a token is rejected at creation without echoing it. The archive is streamed with a size limit (`REQTEST_GITHUB_MAX_ARCHIVE_BYTES`, 50 MB) and an overall time limit (`REQTEST_GITHUB_TIMEOUT_SECONDS`, 60 s). Only ordinary files and directories are unpacked; an absolute or `..` path refuses the whole archive, and links are skipped and recorded. The unpacked download is temporary: the same snapshot limits then apply as for local directories, and the copy is what interfaces are read from and tests execute against. Nothing from the download runs on the host.

Unauthenticated GitHub API access is limited to 60 requests per hour per IP address, and each run uses about three. Set `REQTEST_GITHUB_TOKEN` to a fine-grained token with read-only *Contents* access for private repositories and a higher limit. A download failure (repository not found, unknown branch or folder, rate limit, network error, limit exceeded) does not fail the run: it is recorded as **Repository not read** with the reason, and generation continues without interfaces. GitHub Enterprise and other hosts are not supported.

### Watching a repository

A project with a GitHub branch URL can be watched: open **Agent workspace** and select **Watch for new commits**. The server then checks the branch every 10 minutes (`REQTEST_WATCH_INTERVAL_SECONDS`, at least 60) and starts an incremental run for each new commit. A run started this way is labelled **Started by repository watch**, and its workspace and reports show **Changes since the baseline run**.

An incremental run builds on the *baseline*: the latest completed run of the same project under the current validation rules. It works as follows:

1. **Compare.** The new commit is downloaded and its public functions, classes and methods are compared with the baseline's by signature. Docstring-only edits are not changes.
2. **Reuse.** Requirements come from the baseline, which was made from the same project inputs, so the model is not asked to analyse them again. After the project is edited, for example with a revised SRS, the baseline no longer matches and the next run is a full one.
3. **Add tests for new functionality.** For new or changed *module-level functions* only, the planner is asked for additional scenarios, and only where a requirement states the expected behaviour. Scenarios that check anything else are discarded. New scenarios go through the same oracle review, generation and code-to-plan validation as in a full run. Their ids continue the baseline's numbering (`S2`, `T2`, …), and their module files never collide with carried ones.
4. **Report new code without a requirement.** A new or changed function that no requirement describes gets no test. It is listed under **New code without a requirement**, because the agent never invents an expected result from a name, signature or docstring. Describe it in the requirements to get it tested.
5. **Re-run everything.** Every carried test is re-validated against the new interfaces and re-executed with the new tests. This also happens when only function bodies changed, and that path makes no model call. A test that passed at the baseline and now fails or errors is listed as a **regression**. A carried test whose target was removed or changed so it no longer validates is listed and not executed. Carried tests are never repaired automatically; only new tests may receive the bounded repair.

The new run then becomes the next baseline, so the suite grows commit by commit. Without a usable baseline (no completed run yet, edited project inputs, an earlier validation version, or a run saved before signatures were recorded), the watched run performs the full workflow and creates one. If the repository cannot be read at a check, the run stops as **blocked** without calling the model or the sandbox. A commit counts as handled only once its run is queued: while another run for the project is active, or when the queue is full, the next check retries it. Check errors such as rate limits are shown on the watch panel.

Each check makes about two GitHub API calls. Watching several projects without `REQTEST_GITHUB_TOKEN` can exhaust the anonymous limit of 60 requests per hour. A commit URL, or a `/tree/` URL naming a full SHA, never changes and cannot be watched. A folder URL is checked by the repository's commit, so commits outside the folder start a run that finds identical files. Watching needs the agent (model credentials) and GitHub downloads; set `REQTEST_WATCH_ENABLED=false` to turn it off. Watches persist across restarts, and checks resume when the server starts. Editing a watched project's reference into a local path or a commit URL stops its watch; editing it to another GitHub branch keeps watching, and the next run is a full one because the inputs changed.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/projects/{id}/watch` | Watch state: `enabled`, `active`, `interval_seconds`, last check, commit, run and error |
| POST | `/api/v1/projects/{id}/watch` | `{"enabled": true}` or `{"enabled": false}`; 422 for a non-GitHub or commit URL, 409 when watching is unavailable |

`mode` records the active workflow. `baseline_b0` performs analysis, planning, independent oracle review and template rendering. `baseline_b2` adds isolated execution feedback and one bounded, guarded repair attempt. Neither mode includes RAG retrieval.

## Repository layout

```text
backend/
  app/
    main.py                   FastAPI app factory and startup
    schemas.py                Project, behavior, run, and report contracts
    api/routes.py             Versioned API routes
    core/config.py            Environment settings
    core/database.py          SQLite storage
    services/llm.py           OpenAI/Anthropic clients and structured-output wrapper
    services/analyzer.py      Requirement structuring and ambiguity detection
    services/planner.py       Structured scenarios, source links, and planning gaps
    services/generator.py     Deterministic pytest templates from reviewed scenario contracts
    services/inspector.py     Read-only interface extraction from the project under test
    services/github_source.py GitHub URL parsing and pinned-commit archive download
    services/incremental.py   Interface diffs, baselines, and id continuation for watch runs
    services/watcher.py       Background polling of watched repositories
    services/runner.py        Docker sandbox execution and result parsing
    services/orchestrator.py  Agent interface, scaffold and B0 implementations
  sandbox/Dockerfile          Image generated tests execute in
  tests/test_api.py           API and persistence tests
  tests/test_agent.py         Agent stage tests against a fake model
  tests/test_runner.py        Sandbox command and result-parsing tests
  tests/test_inspector.py     Inspection and path-confinement tests
  tests/test_github_source.py GitHub URL parsing and download tests against a fake GitHub
  tests/test_incremental.py   Incremental runs against real repositories that change
  tests/test_watcher.py       Watch API, polling and queueing with a fake GitHub
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

An evaluation harness now covers requirement analysis and original-source oracle review
with 24 labeled starter cases. `bash scripts/evaluate.sh` validates the corpus without
network calls. Explicit `--mode live` runs the configured provider; `--mode replay`
scores saved responses. Reports separate unsafe acceptance, omitted rules, ambiguity
mistakes, model errors, and unavailable scores. The supplied synthetic demonstration
contains intentional failures and is not a live model result. See
[Evaluation commands and scoring](docs/evaluation.md) for a small live smoke run,
repeated measurements, and replay instructions.

In proposal order, the remaining work is:

1. **RAG evidence retrieval (FR5).** This turns the B0 baseline into the B1 configuration.
2. **Mutation testing.** The only route to a `Verified` status, and the proposal's mutation-score metric.
3. **Requirement documents beyond plain text (FR1).**

Next, validate the background workflow against a representative Python repository and a real sandbox before expanding retrieval. Source quotes are checked as nonblank, verbatim excerpts of the submitted text; this proves quote provenance, not the semantic correctness or completeness of the analysis.

The current foundation has no repository upload, no hosts other than GitHub, no automatic job resumption, distributed queue, or production deployment. A separate production backend needs an API URL, explicit CORS origins, HTTPS with secure session cookies, and an isolated execution environment. The development proxy is not a production API gateway.

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

Before test planning and generation, a pinned sandbox checks the saved project's
runtime dependency declarations, Python requirement and unconditional import roots.
Supported metadata is static `[project].dependencies` / `requires-python` in
`pyproject.toml`, plus simple `requirements.txt` declarations and relative `-r`
includes. Package markers are evaluated inside the actual runtime; installed versions,
transitive dependencies and requested distribution extras are checked. Optional project
extras are not selected automatically. Missing/incompatible dependencies, unresolved
metadata or conflicting import paths stop planning and generation while preserving
the requirement analysis and source audit. The UI and exported reports list the setup
checks and actions. Rebuild a compatible custom image or correct the project reference,
then start a new run; no runtime installation or setup script execution is performed.

A conventional `src` directory is added to the sandbox import path automatically,
and `src/shipping.py` is inspected as `shipping`, preserving the original source path.
A Python package actually named `src` (with `src/__init__.py`) retains its package name.
These checks inspect data without importing project code. Passing them does not prove
startup readiness: conditional imports, external services and native system libraries
remain outside this check. Without a sandbox, readiness stays unknown and generated
tests remain proposals.
