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
For real email verification and recovery, configure SMTP. Configured mail requires
verification by default; signed links expire after one hour and can be resent from
sign-in. Local development supports Mailpit. See
[Gmail STARTTLS setup and testing](docs/local-production.md#real-email-verification-with-gmail).

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
   states have separate interactive charts. The evidence chain shows each original
   requirement, mapped behaviors, admitted tests, executed outcomes and final state.
   Follow findings through original
   requirements, saved tests, execution output and phase-specific assessments.
   Applied improvements include a before/after table with inspectable assertions;
   new tests and unexecuted revisions are separate from previously failing files
   that now pass. Each finding includes a cause-specific next step.
5. Export approved tests/evidence, clarify requirements or replay a saved suite.
   Saved-suite replay makes no model calls and does not refresh old diagnoses.

Switching between Project verification and Evaluation retains the current draft
in memory. Reloading, leaving the dashboard or signing out resets unsaved inputs.

PDF/Word/text extraction retains source references and explicit OCR warnings.
Python page checks use sandbox Chromium with the project's own ASGI/WSGI app;
failed page checks retain screenshots. Node.js uses `node:test`. Jest, Vitest and
nested Node suites are outside the current supported scope.

## Policy and evidence boundaries

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

For unused-code analysis and dynamic entry points, see
[code maintenance](docs/maintenance.md).

```sh
npm run quality:check
```

`quality:check` runs type checking, linting, the English-only source check, unit
and integration regressions, and a production build. With local production and
Gmail SMTP configured, run `npm run acceptance:local` to validate deployment
configuration and authenticate with the mail server without sending a message.
Before freezing a demonstrated revision, run `npm run acceptance:full`; it adds
the Docker-only sandbox regressions and local production checks. This command
requires the configured database, sandbox image and SMTP credentials.

Engineering checks and mocked UI checks are separate from model-quality evidence.
Current observations and reviewer status have one index: [experiments/README.md](experiments/README.md).
The [real-project setup](examples/real-projects/README.md) imports pinned Click,
Packaging and Werkzeug sources and prepares their test dependencies. Full-suite
execution is separate from bounded model context. Retired studies and their
dedicated inputs/scripts have been removed; their results are not current evidence.

```sh
# After the real-project setup above; reference validation makes no model calls.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-baselines.json --validate-only

# Small paid acceptance check: Click, four independent configurations, one repeat.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run evaluate -- examples/experiments-smoke.json

# New paid observations, with every planned outcome retained.
REQTEST_SANDBOX_IMAGE=reqtest-real-projects:2 npm run experiment:run
```

The frozen v22 benchmark at `bd12d23` completed the four-workflow smoke,
36-workflow real-project matrix and eight-workflow synthetic fault supplement.
See [the benchmark summary](experiments/results/v22-summary/README.md).
All 36 real-project final generated suites pass; all configurations detect both
supplementary faults. B3 adds grounded decision traces without extra detected
faults. Full arms use more resources and retain incomplete mutation assessments;
no independent semantic accuracy or runtime-error repair rate is established.
Both full arms share a four-request/60-second review budget inside the 32-request
workflow cap. All failed/missing/limited outcomes remain explicit.

The studies are separate: three upstream projects with three repeats, two
synthetic cases with one repeat, and a smoke gate. They are not five independent
real-world projects or a held-out product benchmark. Rerunning commands above
creates new paid observations. Old v20/v21 result studies and dedicated manifests
were retired at the owner's request; [cleanup history](experiments/cleanup-v22.json)
records whole-study removal and recovery from Git. Reusable fixtures remain.
See [evaluation protocol](docs/evaluation-protocol.md) and
[review-budget semantics](docs/mutation-review-budget.md).

The AI-assisted reference and original trace inputs are retained only as regression
fixtures under `tests/fixtures/decision-reference*`. Earlier component experiment
results and review packs were removed. No human review is planned; independent
semantic accuracy remains unmeasured. The [team contribution template](docs/team-contributions.template.md)
is pending completion by the team. No academic report is included.
