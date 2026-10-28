# ReqTest

ReqTest is a Track A verification workspace for developers and QA engineers. It
turns original requirements and focused Python or Node.js projects into reviewed
executable checks, grounded failure assessments and traceable evidence.

## Run locally

Requires Node.js 22.22.2+, Docker and PostgreSQL. On a new checkout:

```sh
npm ci
```

Create `.env.local` with placeholders replaced by your local configuration:

```dotenv
DATABASE_URL=postgresql://reqtest:reqtest@127.0.0.1:5433/reqtest
OPENAI_API_KEY=your-openai-api-key
BETTER_AUTH_URL=http://127.0.0.1:3001
```

Preserve existing configuration and the signing secret. Never commit credentials.

```sh
npm run db:up
npm run db:migrate
npm run sandbox:build
npm run dev:all
```

Open http://127.0.0.1:3001, register/sign in, and check model access in Settings.
For email verification or recovery, configure SMTP; local development supports
Mailpit. See [local deployment](docs/local-production.md).

For a production build on this machine:

```sh
npm run build
npm run production:start
```

## Main workflow

1. Connect a GitHub repository or upload a ZIP; add original requirements.
2. Expand advanced setup when dependencies, a Python server directory or temporary
   PostgreSQL/Redis services are needed. Optionally check project setup.
3. Run verification. The Agent analyzes requirements, proposes and reviews tests,
   executes them in Docker, diagnoses failures and allows one reviewed improvement.
4. Open Evaluation. Requirement-check progress, test outcomes and verification
   states have separate interactive charts. Follow findings through original
   requirements, saved tests, execution output and phase-specific assessments.
5. Export approved tests/evidence, clarify requirements or replay a saved suite.
   Saved-suite replay makes no model calls and does not refresh old diagnoses.

PDF/Word/text extraction retains source references and explicit OCR warnings.
Python page checks use sandbox Chromium with the project's own ASGI/WSGI app;
failed page checks retain screenshots. Node.js uses `node:test`. Jest, Vitest and
nested Node suites are outside the current supported scope.

## Policy v16 and evidence boundaries

- Requirement checks are the default; mutation checks are optional. Without
  mutation adequacy assessment, passing cases remain Partially Verified.
- Checked means every mapped behavior has a passing or failing recorded check.
  It does not mean passed, complete specification coverage or independent accuracy.
- Request limits are optional. Failed/interrupted requests consume reserved slots;
  unknown token usage remains unknown. A request cap is not a monetary cap.
- Each model response has a 300-second default timeout; 0 disables this deadline.
- Large specifications are analyzed/generated in batches. Large projects retrieve
  whole files using requirement terms, mapped paths and transitive local imports, with a recorded source
  budget. Omitted files retain hashes and remain uninspected. Requirements and
  cross-requirement context are preserved; source lines are never silently cut.
- An incomplete contract can admit a focused case only with an explicit scope review
  citing the original contract. The behavior stays Uncertain; ambiguous or
  untestable behaviors remain blocked.
- Reports/checkpoints are private in PostgreSQL. Source, runtime and Agent identity
  checks protect recovery. Approved suites run against read-only source snapshots.
- Python collection saves an exact structured catalog and executes the full
  imported suite by file. Model context selects up to 200 nodes separately;
  complete execution evidence is retained. Fixture bytes are preserved with
  hashes, and large outcome lists use pagination.

See [architecture](docs/architecture.md), [technical usage](docs/usage-reference.md)
and [related work and contribution](docs/product-positioning.md).

## Verification and experiments

```sh
npm run typecheck
npm run lint
npm run check:english
REQTEST_DOCKER_TEST=1 npm test
npm run build
```

Engineering checks and mocked UI checks are separate from model-quality evidence.
Current observations and reviewer status have one index: [experiments/README.md](experiments/README.md).
The [v16 real-project workflow](examples/real-projects-v16/README.md) imports the
complete Python runtime sources of pinned Click, Packaging and Werkzeug;
exact full-suite execution is separate from bounded model context. Repeated
observations and controlled follow-ups retain their own source revisions.
Superseded experimental results and matching private runs were removed. Only the
v16 results are retained; reusable regression inputs retain truthful AI provenance.

```sh
# After the real-project setup above; reference validation makes no model calls.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-real-projects-v16.json --validate-only

# New paid observations, with every planned outcome retained.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run experiment:run
```

The recovery protocol shares B1 candidates and one frozen preparation between B2
and B3. It measures controlled recovery and valid-failure retention, with the same
follow-up ceiling and prefix-inclusive costs. It does not estimate natural-error
frequency or external-product superiority. See [evaluation protocol](docs/evaluation-protocol.md).

The AI-assisted reference and original trace inputs are retained only as regression
fixtures under `tests/fixtures/decision-reference*`. Earlier component experiment
results and review packs were removed. No human review is planned; independent
semantic accuracy remains unmeasured. The [team contribution template](docs/team-contributions.template.md)
is pending completion by the team. No academic report is included.
