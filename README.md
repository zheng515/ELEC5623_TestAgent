# ReqTest

ReqTest is a local verification workspace that turns natural-language requirements
and focused Python or JavaScript/TypeScript projects into traceable executable checks. It compares requirements,
implementation code and existing tests, records execution evidence, diagnoses
failures and attempts one bounded test improvement.

## Features

ReqTest emphasizes original requirement contracts, traceable behavior checks and
diagnosis before test replacement. See [product positioning and primary related
work](docs/product-positioning.md) for overlap, differences and evidence limits.

- Import a Python or Node.js project from a GitHub repository or ZIP archive; choose a branch, tag or commit and use a connected GitHub account or temporary read-only token for private repositories.
- Upload PDF, DOC, DOCX, TXT or Markdown requirements with retained source locations; use English OCR for image-only PDF pages.
- Check project dependencies before model calls and reuse the checked code snapshot.
- Analyze requirement quality, behavior-level test gaps and code/test conflicts.
- Generate reviewed pytest or node:test artifacts and execute them in a disposable Docker sandbox.
- Install compatible Python wheels or locked npm packages in a reusable, pinned image; inspect actual installed versions.
- Run checks against disposable PostgreSQL and Redis services on a private network.
- Diagnose collection, existing-test and generated-test failures with recorded evidence.
- Measure selected mutations and re-run supported test improvements.
- Inspect verification states, source quotes, logs and retrieved documentation.
- Save private verification reports, download evidence and export executable tests.
- Inspect project requirement states, recorded test outcomes and evidence in Evaluation. Run benchmarks separately with the CLI.
- Clarify requirements, re-run a frozen code snapshot and compare reports.
- Reconnect after a browser refresh and recover interrupted worker jobs from PostgreSQL checkpoints.

The application uses Next.js, React, TypeScript, Tailwind and shadcn/ui. Better Auth
and PostgreSQL provide accounts and report storage; the Vercel AI SDK connects to
OpenAI. Python/pytest/mutmut and Node.js/node:test/Stryker run inside Docker.

## Verification depth and request budget

The website defaults to **Requirement checks** with a limit of 12 model requests.
Both depths retain original-contract admission, suite coverage review, execution,
failure diagnosis and at most one eligible improvement. Choose **Requirement and
mutation checks** to investigate additional test strength. Without mutation
assessment, passing cases remain Partially Verified; strict CI still requires
Verified. No check depth establishes exhaustive correctness.

The request limit accepts 1–24 requests and covers all stages and worker retries.
Failed/interrupted attempts consume slots; cached responses do not. Each
reservation is saved before provider dispatch. Exhaustion retains an incomplete
run and partial evidence. Run details and Agent decisions show consumed/remaining
requests and reported tokens. Missing usage stays unavailable. This is a request
count cap, not a token or monetary ceiling. Existing call/output/time limits apply.
Saved-test replay makes no model calls. CLI verification and experiments accept
`"policy": { "mutationChecks": true, "modelRequestLimit": 12 }`; their default
keeps mutation checks enabled. Historical reports keep their original evidence.

See [architecture](docs/architecture.md), [evaluation protocol](docs/evaluation-protocol.md)
and [contribution positioning](docs/product-positioning.md). The v12 policy is not
covered by the old model-quality results; no new advantage is claimed.

## Start

Requires Node.js 22.22.2+ and Docker.

```sh
npm ci
```

On a new checkout, create `.env.local` with the configuration below and replace
the API key placeholder. Preserve an existing configuration and signing secret.

```dotenv
DATABASE_URL=postgresql://reqtest:reqtest@127.0.0.1:5433/reqtest
OPENAI_API_KEY=your-openai-api-key
BETTER_AUTH_URL=http://127.0.0.1:3001
```

Then start the local services:

```sh
npm run db:up
npm run db:migrate
npm run sandbox:build
npm run dev:all
```

Open **http://127.0.0.1:3001**, create an account, and sign in. Open **Settings → Check model connection** to verify a real request; a present key alone does not establish validity. Use the same hostname
as BETTER_AUTH_URL. Better Auth provides email/password registration, password
hashing, persistent cookie sessions and rate limiting. PostgreSQL stores accounts,
sessions and verification reports; project snapshots and the local signing secret remain in
`.data/`. A random local signing secret is created automatically;
set BETTER_AUTH_SECRET for a deployment. Keep `.data/` private and persistent.
Email verification and password recovery use Better Auth with SMTP delivery.
For local testing, set REQTEST_LOCAL_MAIL=true in .env.local and run
`npm run mail:up`. Open http://127.0.0.1:8025 to read development emails; they
are captured locally and never delivered to real recipients. Disable local mail
for deployment and configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
SMTP_PASSWORD and SMTP_FROM. AUTH_REQUIRE_EMAIL_VERIFICATION=true optionally
requires verification before sign-in. A reset invalidates existing sessions. Keep the local
mailbox bound to loopback and use it only for development.
Click your name in the workspace header to open **Account**, view your profile, verify your email or
open the local development mailbox. Verification and mailbox actions are kept
off the workspace header. The registration and password-recovery screens also
provide the local mailbox link when local mail is enabled.
New passwords must contain 8–128 characters, including at least one uppercase
letter, one lowercase letter and one number. Registration shows unmet rules in red
and restores the normal text color as each rule is met. The server enforces the
same policy. Existing accounts can still sign in with their current passwords.

### Model settings

Open **Settings** in the workspace header to select the OpenAI model or check its
connection. Save settings to apply the model to future project verification in
this browser. Cancel discards model edits. Model changes and connection
checks are disabled while a run is active on the page. The API key stays on the server;
this dialog does not accept or display credentials. Connection checks make a real
model request and may incur API usage charges. Existing reports retain their model.

### GitHub connection

Open **Account → GitHub connection** to connect, reconnect or disconnect GitHub.
The verification form can then use the connected account without asking for a token
on each import. Public repositories also work without a connection. A temporary
fine-grained token remains available for access to selected repositories.

Administrator setup:

1. Register a GitHub **OAuth App** at https://github.com/settings/developers.
2. Set its homepage to BETTER_AUTH_URL and callback to
   `http://127.0.0.1:3001/api/auth/callback/github` for the default local configuration.
   Account shows the callback for the configured URL. Use the same hostname throughout.
3. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in `.env.local`, then restart the
   website and worker. Never prefix these secrets with NEXT_PUBLIC_. Keep the signing
   secret and `.data/` persistent; changing the secret makes encrypted tokens unreadable.
4. Sign in to ReqTest, open Account and select **Connect GitHub**. Linking requires
   a matching email; it does not create another ReqTest account. In the verification
   form, select **Use connected GitHub account**, then check the repository setup.

The OAuth consent requests `read:user`, `user:email` and `repo`. GitHub's `repo`
scope includes write permissions even though ReqTest only reads snapshots. For
restricted read-only access, supply a fine-grained token with repository contents
read permission instead. Organization policies may require additional approval.
OAuth credentials are encrypted in PostgreSQL using Better Auth. Server code
selects only the signed-in user's linked account; credentials are excluded from
client responses, verification reports, model inputs and sandbox environments.
Temporary tokens are not retained. Disconnect removes the locally stored GitHub
account but keeps existing snapshots and reports. To revoke the provider grant,
also remove the app at https://github.com/settings/applications. Connection status
indicates a stored link; importing a repository detects rejected/revoked credentials.

`tests/github.test.ts` exercises real Better Auth routes and PostgreSQL with mocked
GitHub responses, including callback state, email matching, encrypted token storage,
cross-user isolation and disconnection. Real OAuth consent still requires your own
registered OAuth App credentials; mocked tests do not establish provider availability.

### Website and verification worker

`npm run dev:all` starts the website and background worker together. Both use the
same root `.env.local`, PostgreSQL database and `.data/` directory. Alternatively,
run `npm run dev` and `npm run worker` in separate terminals. Starting only the
website leaves new verification tasks queued until a worker is available.

To run a checked local production build, stop the development website and worker,
then run:

```sh
# A production-only first install needs npm run db:migrate:production once.
npm run production:check
npm run build
npm run production:start
```

After a successful build, subsequent starts only need `npm run production:start`.
Run `npm run production:check` to diagnose configuration without starting services
or calling a model. Rebuild after changing application code.

The production worker reads production-mode environment files, including
`.env.local`. Keep the full repository, installed dependencies and persistent
`.data/` directory available to both processes. The checked launcher validates local
configuration, PostgreSQL, Docker, signing-secret persistence and the sandbox image,
initializes database tables and starts both services. If either service exits, the
other is stopped. Ctrl+C stops both. It binds only to 127.0.0.1; use the hostname and
port configured in BETTER_AUTH_URL. Optional GitHub/SMTP settings produce clear
warnings when disabled; incomplete settings block startup. Key presence is not an
API-access check. `npm run start:all` uses the same checked launcher and configured
port. Startup also checks that the application port is free before initializing
tables or launching the worker; stop an existing instance before starting another.
Failures identify the startup stage or the service that stopped, with sensitive
configuration values redacted from the launcher's error message.

This is a single-machine deployment. Hosted TLS/reverse proxies, automatic restart
after machine reboot and external backup storage are not configured. See
[Local production and recovery](docs/local-production.md) for setup and a restore drill.

### Runtime status

The project verification page refreshes authenticated runtime status every ten
seconds. It shows database/queue availability, verification-worker liveness, the
default Docker sandbox and your own queued, active and retrying task counts.
Worker status uses pg-boss instance registration; a web-only queue client does
not count as a worker. Worker registry heartbeats run every five seconds and
expire after three missed beats. Polling and network delay add detection latency.

If the worker is offline, the form offers **Queue verification** and explains that
the saved task waits for a worker. Queue/sandbox/status failures pause new UI
submissions without clearing inputs or changing saved evidence. Existing tasks
can reconnect or recover when services return. The status endpoint does not start
a queue or worker, expose another user's task data, or treat a missing heartbeat
as a test failure. Check model access and project dependencies separately with
**Settings → Check model connection** and **Check project setup**. Heartbeats and image
availability alone do not establish that a verification can succeed.

### Offline backups

Stop the website, worker and other ReqTest commands, then run:

```sh
npm run backup:create
npm run backup:verify -- .backups/BACKUP_DIRECTORY
```

The backup contains a PostgreSQL custom-format dump, .data files and the effective
signing secret, with SHA-256 hashes and private file permissions. It is sensitive
and is not encrypted as an archive. Store it securely. Environment files, OpenAI/
SMTP credentials and Docker images are not copied. Each database dump and the
expanded file archive must fit 200 MB; larger installations need a streaming or
provider-managed backup. Helpers target the local Compose PostgreSQL service on
127.0.0.1:5433 and require all queued/running runs to be finished or cancelled.

Restore only into a separate checkout with an empty database and empty .data:

```sh
npm run backup:restore -- /absolute/path/to/BACKUP_DIRECTORY
npm run production:check
npm run production:start
```

Restore verifies hashes, ZIP paths, namespace and signing-secret compatibility
before touching the target. PostgreSQL restore uses one transaction. Existing
database objects or data files cause a refusal; there is no overwrite option.
Runtime leases and a PostgreSQL maintenance lock prevent service startup during
maintenance and reject backup/restore while local ReqTest processes are alive.
These safeguards assume one local workspace per database; shared/multi-host storage
is unsupported. A checksum pass is not a restore drill. The automated Docker test
actually restores into a disposable database and compares saved rows and bytes.
If PostgreSQL restoration fails, extracted recovery files remain for inspection;
recreate the disposable target database before retrying.

Tasks are inserted transactionally with their initial report. One account can
have one queued or active task; the worker runs at most two tasks concurrently.
Closing a browser tab detaches progress without cancelling the task. A worker
interruption permits up to two retries after heartbeat expiry. Saved analysis,
model responses and completed tool results are reused; a model request interrupted
before its checkpoint was saved may be sent again. Each attempt has a ten-minute
time limit. Recovery requires the same database, source files, runtime settings,
agent code and sandbox image. Changed inputs fail explicitly instead of mixing
old execution evidence with new code. Stopping a task cancels its queue job and
retains partial evidence; a cancelled task is not automatically resumed.


## PostgreSQL

`npm run db:up` starts PostgreSQL 17 at `127.0.0.1:5433`, using a dedicated Docker
volume. The DATABASE_URL shown in the start instructions matches this local service.
Port 5432 is left available for other projects. To use an existing PostgreSQL server,
set DATABASE_URL and skip the Compose command. `npm run db:migrate` creates the
Better Auth tables and the indexed JSONB verification-report table. Startup also
checks these migrations. Keep the database volume and `.data/` across restarts.

For an existing SQLite installation, stop the application and import its accounts,
password hashes, sessions and reports before restarting:

```sh
npm run db:up
npm run db:migrate
npm run db:import-sqlite -- .data/reqtest.sqlite
npm run dev:all
```

The importer uses Node's built-in SQLite reader only for this one-time operation;
normal application operation uses PostgreSQL exclusively. Import is transactional,
retains existing IDs and leaves the legacy database unchanged. Running the import
again does not duplicate existing IDs. Conflicting unique data causes a rollback
instead of replacing PostgreSQL records. Transient rate-limit buckets keep existing
destination entries. Preserve `.data/auth-secret` so imported
session cookies remain valid. Tests use isolated PostgreSQL schemas and clean up
only their own schema. PostgreSQL must be available before running account tests.
The test commands load `.env` and then `.env.local`; explicit process variables
take precedence over both files.

## Project verification

1. Upload a focused Python or Node.js project ZIP or supply a GitHub repository URL. Optionally select
   a branch/tag/commit. For private repositories, select a connected GitHub account
   or provide a temporary read-only access token. Credentials are used for download
   only and are not sent to the model; temporary tokens are not retained.
   Downloads are pinned to the resolved commit. Select **Check project setup** to
   check runtime and dependency declarations without importing the project. Select
   **Advanced settings** for runtime overrides, automatic dependency installation
   and disposable PostgreSQL/Redis test services; Node.js requires package-lock.json.
   For a monorepo, set **Project directory** to a relative path such as `backend`.
   It becomes the project root for runtime detection, dependencies, imports and
   tests. Sibling directories are outside the analyzed scope; keep required shared
   code inside the selected project or select a broader root.
   Advanced settings are collapsed by default. Defaults detect the runtime and use
   the server sandbox without installing dependencies or starting test services.
   Collapsing the panel retains selections; changing project or environment inputs
   clears a previous setup result. Project inputs are locked during a setup check. Test
   services are separate from the PostgreSQL database that stores ReqTest accounts.
2. Paste requirements, or upload PDF, DOC, DOCX, UTF-8 TXT or Markdown.
   All extracted text automatically fills the editable **Requirements** field;
   no line or paragraph selection is required. The limit is 12,000 characters,
   independent of line count. Oversized text remains visible and must be shortened
   before running; it is never silently truncated. Original document hashes,
   page/paragraph locations and extraction warnings remain available under source
   details. Exact unchanged excerpts retain citations; edits are treated as
   user-provided text. Explicit IDs such as R1 and FR-CAL-02 are grouped
   automatically; repeated IDs share an input item. Other text is retained as
   supporting context and is not independently verified. Unnumbered text remains
   available for behavior decomposition. A run supports at most 24 input items
   and 24 analyzed behaviors; larger specifications need separate runs. All input
   remains visible and no excess content is silently dropped.
3. Select **Run verification**. Inspect behavior states, source quotes, mapped tests,
   recorded test outcomes, diagnoses, mutation results and improvements.
4. Download the evidence JSON and generated-test ZIP. Extract the ZIP in the original
   project and install its dependencies. Run `python -m pytest reqtest_generated`
   for Python, or `npx --yes tsx@4.23.0 --test reqtest_generated/*.test.ts` for Node.js.
   Local service tests also need disposable DATABASE_URL/REDIS_URL endpoints.
   The ZIP includes a README with the source version, runtime, run command and
   recorded outcomes. Only approved generated test files are included.

Try the included small project:

```sh
npm run example:zip
```

Upload `.evidence/shipping.zip` and paste the four lines in
`examples/shipping/SRS.md`. Existing tests intentionally cover only one nominal case.
Changing `>= 10000` to `> 10000` in the example implementation creates a boundary
fault that a supported threshold test should expose.

For a Node.js defect demo, zip `examples/node-shipping/` and paste its SRS.md line.
Its existing test passes above the threshold, while a generated exact-threshold
check should expose the intentional defect. This is a development fixture.

A local production acceptance run used the public `qajua/reqtest-shipping-demo`
repository at commit `e5e22a108ede7d1ca0288de0139d27b996c6291b` and its original
`docs/SRS.md`. Four numbered requirements were selected from 35 extracted blocks.
Real model requests generated nine approved tests: eight passed and one exposed
the intentional `10000`-cent boundary defect. The exported tests reproduced that
result against a separate copy of the saved source in Docker. This demonstrates
the connected workflow on synthetic data, not independent accuracy or complete
document coverage.

### Workflow

- **Understand:** Python or TypeScript AST inspection and test discovery; atomic behavior
  extraction; requirement-quality findings; potential requirement/code/test conflicts.
  MiniSearch retrieves relevant project Markdown/text documentation.
  The report retains retrieved text, file hashes and affected behavior IDs for
  cross-artifact inconsistencies. Unrelated behaviors are not automatically marked
  uncertain just because another behavior in the same requirement has a conflict.
  Structured analysis limits implementation links to retained source files and
  existing-test links to discovered test IDs; documentation remains evidence.
  Analysis and diagnosis select a file and a one-based, nonblank source line; the
  server restores its unchanged quotation and records the line number. Unknown
  files, blank or invalid lines are rejected. Legacy quote-only records remain
  readable. Source location does not prove semantic support. A rejected analysis is sent
  back once with the exact failure and invalid evidence; a second rejection fails the
  run. The report retains the original analysis and its error.
- **Measure:** execute existing tests, generate targeted runtime-specific artifacts, independently
  review their original requirement evidence, execute supported artifacts and map
  exact files/functions back to behaviors. Unmapped outcomes never earn verification.
- **Diagnose:** distinguish generated-test errors, requirement ambiguity, potential
  implementation defects, environment failures and uncertain cases. Unsupported
  diagnoses cannot authorize test changes. Implementation files are never repaired.
  In the default workflow, collection and existing-test baseline failures are
  diagnosed before generation, including runs that produce no executable new tests.
  Every diagnosis records its phase; collection, baseline and latest execution
  logs remain separately available in the report.
  Diagnosis output IDs are restricted to the supplied failed-test IDs. A legacy full
  execution node maps to a generated artifact only through a unique recorded failed
  node and matching file. Original model IDs remain in the audit trail. Duplicate
  aliases, unknown nodes and unsupported evidence cannot authorize repair.
- **Improve:** at most one improvement action. Diagnosed generated-test errors can
  be replaced. Otherwise an unambiguous artifact with a unique, explicitly negative,
  verbatim-cited review can be corrected under the same ID and behavior link. Every
  replacement must pass the original review gates again, including promised value
  and semantic type checks. Approved tests and justified failing assertions remain
  unchanged. A clear behavior with no proposal can also use the single budget to
  add a new reviewed check. Review-rejected replacements remain blocked and their proposals/reasons
  are retained in the evidence export and Evaluation technical details.
  When mutation checks are requested, passing tests can trigger selected-file mutmut measurement, relevance review
  and targeted additions for supported surviving mutants.
  Python mutation checks explicitly run approved generated tests. Static imports and
  calls select top-level functions in one mapped source file; unresolved calls fall
  back to the selected full file. This selection is not dynamic coverage. File,
  functions and line scope are retained, and re-measurement keeps that scope.
  Timeouts stop the command process group and retain available cached outcomes as
  incomplete evidence. Counts from older implicit-suite runs are not comparable.
  Each retained survivor with a usable diff is reviewed separately for every behavior
  mapped to its file, in batches of at most 16 mutant-behavior pairs, including newly
  surviving mutations after re-measurement. Decisions bind the exact mutant ID, file,
  diff and cited behavior; an exclusion cannot clear other behaviors in the same file,
  so only missing pairs are reviewed again. Missing, duplicate, unsupported and older
  unbound decisions stay unresolved. The current-survivor summary separates test gaps, requirement
  clarification, changes outside the cited behavior and unreviewed evidence.
  These model judgments do not establish an independently reviewed mutation score.
  Each test directory's conftest (or a representative module when absent) retains
  pytest collection and import setup. Its original test functions are deselected. Collection
  hooks and module import effects still execute and can influence raw outcomes;
  other modules' side effects and module-local fixtures are not reproduced.
  The report records these setup files; exported instructions retain the same setup.
- **Re-measure:** execute the changed suite and, where applicable, selected mutations
  again. With mutation checks requested, a repaired suite that now passes receives its first selected mutation
  measurement and survivor review before it can earn Verified. Preserve original
  tests, measurements, diagnoses and before/after artifacts.

Behavior states are **Verified**, **Partially Verified**, **Unverified**, **Uncertain**.
They describe the mapped, reviewed cases; they do not prove exhaustive correctness.
Gaps, unsupported tests, missing outcomes and unresolved mutants prevent an unsupported
Verified state. Failed assertions remain visible; passing tests do not automatically
establish that the requirement or its implementation is correct.

Verification also requires a current suite review against the full original
requirement, including every explicit example and equality boundary. The existing
admission-review request records this assessment separately from individual test
validity. A valid focused test can remain approved while coverage is incomplete.
Missing verbatim examples can trigger the existing single improvement action;
passing planned witnesses alone cannot establish verification. The assessment is
still a model judgment, not independent proof. Older runs without this record
display Partially Verified; regenerate to obtain a new review. Re-running saved
tests preserves their recorded reviews and makes no model requests.

Mutation review shares each diff once per request and retains one decision for
every mutant/behavior pair. All original rules remain available for cross-cutting
constraints. Unchanged unanswered pairs are attempted once per run and remain
unreviewed; they cannot earn verification. Valid reviews are reused only for the
same file, diff and full original requirement. Rule IDs in model responses are
resolved to the unchanged original text before validation.

A completed run has finished processing. Its report can still contain environment
failures, failing tests and unresolved behaviors. Review the behavior states and
failure diagnoses to determine which checks actually succeeded.

### Execution and scope

Source inspection, test discovery, generated tests and mutation operations run in
Docker without public network access, read-only input mounts, a disposable work copy, memory/CPU/
process/time limits, dropped capabilities and no host credentials. The original
snapshot is retained with a SHA-256 fingerprint. Test outcomes and runtime versions
are recorded; source changes during execution invalidate its evidence.

Default tools include Python 3.11, pytest 8.4.2, mutmut 2.5.1, Node.js 22,
TypeScript 5.9.3 and Stryker 10.0.0. Automatic setup installs compatible PyPI wheels
from static pyproject.toml/root requirements declarations, or npm packages from
an integrity-checked package-lock.json (version 2+). Installation runs in a separate
network-enabled build container; project/build hooks, source builds, direct URL,
Git/file dependencies and private registries are unsupported. Failed installations
retain a specific error and do not create a successful cached environment. Actual
installed versions are recorded in setup/report metadata and the immutable image.
Unpinned Python requirements resolve once when an environment is first built.
Reusing its image preserves that resolution. Use a custom prepared image for
unsupported native libraries, system dependencies or installation hooks.

Node.js supports uniquely named top-level node:test cases in JS/TS test files.
Discovery executes existing test bodies in a disposable copy; it is not static
collection. Assertion failures are retained for baseline diagnosis, while import,
unsupported-suite, duplicate-name and integrity errors prevent unsupported
verification. Selected existing test IDs are executed individually by file/name.
Jest/Vitest, nested suites, browser automation and arbitrary project layouts are
not supported. Generated artifacts are stored under reqtest_generated; file-load
errors are associated with their artifact for evidence-based diagnosis/repair,
while positive verification still requires the exact registered test name.

Optional PostgreSQL 17 and Redis 7 services start fresh for each tool invocation,
on an internal Docker network with no published ports. Only their generated
DATABASE_URL/REDIS_URL are passed to the test container, never the host account
DB or API key. Services/volumes/networks are removed on completion or cancellation.
Services expire after five minutes if a worker is forcibly killed; subsequent
service starts reclaim expired empty networks. Schema/migration setup must be
provided by the project tests. General external services are not provisioned.
Docker is required; there is no host execution fallback.

Sandbox and dependency images are retained under reqtest-pinned tags so rebuilding
a development tag does not remove an in-use execution image. Keep images referenced
by saved reports when cleaning Docker storage.

Limits: 500 archive entries, 10 MB compressed, 3 MB expanded, 200 KB per retained
source/configuration file, 1 MB for uv.lock/package-lock.json, 200 KB model context,
24 extracted behaviors and 16 initially generated tests. These lockfiles remain
in the fingerprinted snapshot but are excluded from model reasoning. Automatic
Python setup uses declared compatible wheels, not uv.lock resolution; exact
installed versions and the resulting sandbox image are retained.
Archives retain supported source and project text/configuration files and reject traversal paths;
hidden files are excluded. Large files/projects are rejected, not silently treated as
fully inspected. The default worker processes at most two tasks concurrently, with one queued or
active task per account. Each attempt is bounded to ten minutes, with one
improvement action in the recovered workflow. Mutation
measurement targets one mapped file for up to 75 seconds. Tool counts are **raw
mutation outcomes**, not a relevant non-equivalent Mutation Score. Model reasoning,
semantic mappings, diagnoses and relevance/equivalence reviews remain fallible.

Project reports belong to the signed-in account and are saved server-side.
Reports and linked original requirement documents are accessible only to their owner.
Only the owner can stop a run or re-run its source snapshot. Team workspaces,
invitations, roles and report sharing are not supported. Existing accounts and
reports are retained; legacy collaboration tables are unused. Source
snapshots stay on this local machine. The most recent 20 reports are listed. Stop
cancels remaining work and preserves partial evidence. Browser disconnection
detaches the progress stream while the local server continues working. Refresh
to reconnect through history. New tasks use the persistent verification queue and
recover through the background worker. Reports created before queue support cannot
be resumed and are marked interrupted with uncertain states after a server restart.
The website and worker must share the same local snapshot storage. Multi-host and
serverless deployment are not configured.

Use **Regenerate / clarify** to make a fresh model analysis and optionally add
explicit requirement statements against the same source snapshot. The original report stays unchanged and is linked from the new
report. Changed requirements mean this comparison is not a controlled quality score.

Surviving mutations are reviewed per `(mutantId, behaviorId)` pair for every
behavior mapped to the mutated file. Batches contain at most 16 pairs. Complete
exact-diff pair judgments are cached individually; missing/duplicate pairs remain
unresolved. An exclusion for one behavior never clears another. The Evaluation
panel shows reviewed/required pair counts. Strict CI uses the same conservative
requirement aggregation as the dashboard.

Use **Re-run saved tests** to execute approved saved artifacts on the same checked
source snapshot and pinned image, without model requests or an API key. Blocked
proposals remain blocked. The original report stays unchanged. Source and suite
hashes are checked; changed evidence is refused. Original analysis/reviews are
reused, and diagnoses/mutation results are not refreshed. Previously unresolved
adequacy cannot become Verified solely because the same checks pass again.
Time-dependent target code can still produce different execution outcomes.

For multiline document requirements, model outputs reference stable requirement
IDs; the SDK resolves these to unchanged original quotes before evidence validation.
Source evidence uses a separate file/line encoding. Only model-facing file views
receive line-number prefixes; saved code, requirement text and exported quotes are
not rewritten. Provider usage includes promptBytes and promptHash for the actual
encoded user prompt; experiment contextBytes describes the caller's pre-encoding
context. Neither byte count includes system instructions or the output schema.
Generated gap indexes are constrained to their referenced behavior's own gap list.
New SQLite databases created during Python tests are recorded separately by path
and SHA-256. Original files, generated test code and unexpected new files remain
subject to integrity checks; runtime database contents are not exported.

Live-clock tests prefer specification-defined calendar invariants. Date-specific
checks need explicit date inputs, an existing public clock parameter, or independent
clock readings before/after the call with bounded rollover handling. The agent
must not replace the target's clock helper or turn an example date into today's
date. Unreachable frozen-date boundaries remain unresolved; fixed inputs to date
conversion functions remain supported.

PDF citations retain page and text-block numbers. Pages without extracted text use
English Tesseract OCR, retaining the page, OCR label and mean word confidence.
Pages containing both native text and images also receive OCR; supplementary
image text is kept alongside native text with its original page reference.
The upload and report views show per-page extraction outcomes, with detailed
warnings collapsed by default. Low-confidence OCR blocks (below 70, or with no
confidence available) are retained in the editable text and flagged for review. This threshold
is a transcription warning, not a calibrated accuracy or verification score.
At most 20 pages are attempted within a bounded processing budget; unreadable,
failed or unprocessed pages are listed in extraction warnings. OCR is not exact
transcription. PDF reading order and complex tables need visual review.
DOCX citations retain body-block and table-row locations. Each table row stays
together so requirement IDs, conditions and expected results are not separated.
Legacy DOC is converted
with LibreOffice; its block locations refer to the converted document, not original
rendered page numbers. The original file and SHA-256 are retained in both cases.
Word headers, footers, drawings, tracked changes and nested tables are not fully
extracted. Limits: 10 MB upload, 100 PDF pages, 1000 blocks and 100 KB extracted
text. Supporting context and unmapped items are never claimed verified. Use **View original page** to
open the authenticated PDF viewer at the cited page, or download the original
Word document and locate its body block/table row. Downloads and saved-document
re-runs validate the original file hash. Changed originals are rejected; failed
uploads are cleaned up. Protected, damaged and unsupported files include an action
to export an unlocked copy or paste the text. Runtime compatibility is limited
to the explicitly supported toolchains and tested dependency/service cases above.

## Checks and evaluation

Project source, comments, documentation and interface labels must be in English.
`check:english` checks tracked and non-ignored new text files for Chinese characters
and CJK/fullwidth punctuation, including file names. CI runs the same check. It
does not rewrite user requirements, imported repository snapshots, private runtime
data or third-party dependencies; verbatim evidence must retain its original text.

```sh
npm run check:english
npm run typecheck
npm run lint
npm test
npm run build
REQTEST_DOCKER_TEST=1 npm test
npm run test:queue
npm run test:runtime
# With the local mailbox running:
REQTEST_MAIL_TEST=1 npm test
```

Default tests exercise real Better Auth/PostgreSQL registration, login, logout and report
ownership, source/evidence validation and verification-state safeguards. Docker tests
exercise real pytest/mutmut with deterministic model outputs: one preserves a genuine
implementation defect, another detects surviving mutants and re-measures a targeted
improvement. These are control-flow tests, **not measurements of model quality**.
The focused safety check covers unsupported exception-message assertions, an invented
generated import, a genuine boundary defect and an ambiguous threshold. It uses
scripted model decisions with real Docker execution, makes no model requests and
prints before/after serialized input sizes for its controlled context fixture:

```sh
REQTEST_DOCKER_TEST=1 node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx --test tests/agent-safety.test.ts
```

Initial analysis and generation retain project context. Follow-up review and
diagnosis use mapped files, citations and traceback files; all original requirements
and supporting requirement context remain. Unmapped cases retain full file context.
File contents are not truncated. Retrieval records keep original text, but model
requests reference the text in files instead of duplicating it. Generated failure
code is sent once under its artifact path. Smaller serialized inputs are not a
measured token, latency or accuracy improvement. The [current development study](experiments/results/2026-10-28-v12/README.md)
records component decisions and paired workflow resources. It does not isolate
retrieval/context compression. Scripted Docker checks establish control flow
rather than model accuracy.

The queue integration test uses isolated PostgreSQL schemas and real Docker
execution. It forcibly kills a worker during a task, starts a replacement, checks
that saved analysis is reused, preserves a genuine failing assertion and verifies
owner-only cancellation of queued and active work. No model API calls are made.

The explicit real-model project integration requires a running app and creates a temporary
local test account:

```sh
REQTEST_PYTHON_LIVE_TEST=1 npm test
```

Run controlled Python baselines with real model calls (paid; no automatic retries):

```sh
npm run evaluate -- examples/evaluation.json
```

- **B0:** direct generation from requirements/Python context; no independent review or refinement.
- **B1:** adds retrieved project documentation; no generated-test feedback refinement.
- **B2:** full loop that selects failed generated tests for repair without evidence-based diagnosis; all original-contract admission gates still apply.
- **B3:** evidence-based diagnosis before eligible refinement; the UI uses this policy with selectable mutation depth and a request limit.

B0/B1 rule IDs are scaffolding, not semantic behavior decomposition or verification
claims. B2 intentionally omits evidence-based diagnosis and is available only through the explicit
benchmark command. Each variant starts from the same frozen project snapshot.
The default manifest runs three synthetic pilot projects against all four variants.
Results are saved in a new directory under `.evidence/evaluation/` on every invocation.
Reference labels and correction patches stay outside the model-visible project.
The benchmark independently probes whether generated failures detect seeded defects
before and after refinement, using separate corrected disposable copies.

For shared initial generation, use `examples/experiments-shared-initial.json`.
B1 generates once per pair; B3 audits the unchanged candidates and continues with
bounded feedback. This CLI mode does not change normal website verification.
`paired-comparison.json` checks executable identity and includes the common prefix
in B3 end-to-end costs. See [the experiment guide](examples/experiments/README.md)
for the fixed small protocol and its limits; this is not a diagnosis-only ablation.

Run `npm run score -- <run-directory>/index.json` to generate `summary.md` and
`metrics.json`. Independent reviewers must first check the copied reference labels
and each run's `review.json` to enable semantic and accuracy metrics. Pending review
or missing denominators produce null. Metrics include detection Precision/Recall/F1,
semantic coverage and change, diagnosis Macro-F1, incorrect repair, reviewed mutation
scores, seeded-fault detection, evidence support and completion/valid-outcome rates.
See [the benchmark review guide](examples/benchmark/README.md) for definitions and
commands. The initial reference labels are drafts requiring teammate review; this
pilot is not a completed independent evaluation or a real-world effectiveness claim.


### Controlled project experiments

Current experiment status: 16 development decision cases have actual Docker
execution evidence, but zero independently completed reference labels and no
model calls for policy v12. The three-project budgeted workflow manifest passed
reference preflight only. No current defect-detection, diagnosis F1 or resource
improvement result is available. See [current experiment status](experiments/README.md).

Old-version model experiments, acceptance exports, figures and private raw copies
were removed at the user's request on 2026-10-28. Their scores are not carried
forward. Reusable requirements, projects, witnesses, provenance and runnable
manifests remain under examples/. Future model runs create new frozen evidence;
setup or regression success must not be reported as model-quality success.

### Repeated decision consistency

Run `npm run evaluate:decisions -- 3` for sixteen focused test-review and diagnosis
cases repeated three times (48 paid model requests). Production tasks and the same
reasoning function are reused. Frozen inputs, raw decisions, errors and fingerprints
are saved under `.evidence/decision-evaluation/`. This checks raw classification
consistency; it does not replace whole-agent evaluation or independent review.
The small synthetic development set is not held out.

Prepare an independent reviewer pack with actual Docker executions and no model
calls using `npm run evaluate:decisions -- prepare /tmp/reqtest-independent-review`.
It contains a blank reference template and no predictions or draft labels. Use a
completed independent reference with `--reference /absolute/path/reference.json`.
The accepted AI-assisted reference is also usable via
`--reference experiments/annotations/2026-10-28-contract-decisions/reference.ai-assisted.json`.
It enables explicitly labelled referenceComparison agreement and reference-relative
metrics while independent-human accuracy fields remain unavailable. Source and
exact annotation evidence are preserved in frozen references.
The completed v12 run has 48/48 valid outputs and 47/48 agreement with this
reference. Its false-support case, scoped F1, raw responses and token usage are
retained in the linked development results. New runs hash the frozen reference
and task text; offline scoring rejects inconsistent artifacts. Later label review
uses `score ROOT --reference PATH --reason TEXT` to create a separate revision.
Reviewed complete results also expose admission Precision/Recall/F1 and diagnosis
confusion/Macro-F1. Pending references and missing decisions keep accuracy metrics
unavailable. See the evaluation protocol for denominators and review instructions.

Test generation and review distinguish value checks from explicitly claimed return
types. Every extra assertion needs its own requirement support; a timestamp offset
does not require a named timezone object. Missing implementation dependencies are
classified as execution blockers without asserting why the dependency is absent.
Invalid analysis evidence receives at most one model correction request. The rejected
analysis and validation error remain in the report; exact source checks are repeated
and a second invalid response stops the run.

Re-score saved outputs without model calls using
`npm run evaluate:decisions -- score <output-directory>`. Missing/invalid repeats
remain visible. Agreement can be consistently wrong; accuracy and false-support
metrics stay unavailable until every copied reference label has been independently
reviewed and all repetitions are valid. See the benchmark README for review steps.

## Project evaluation dashboard

Requirement progress counts items whose mapped behaviors all have passing or
failing recorded checks, separately from the stricter verification states. The
summary distinguishes passed recorded checks, items needing investigation and
incomplete/unexecuted checks. A failed assertion can complete a check while still
requiring investigation. Skips, errors, missing mappings, interrupted runs and
untrusted execution do not earn completed-check progress. Mutation assessment is
shown separately; original verification states and CI gates are unchanged.

Open **Evaluation** after signing in and choose one of your latest 20 project
verification runs. Refresh reloads saved results without making a model request;
a selected running job updates every four seconds.

Project verification contains inputs, progress, a short summary and next actions.
Use **View results in Evaluation** to open that run's results and evidence.
The requirement traceability list and technical report are not repeated on the
task page. Original text and excerpts are collapsed with bounded scroll areas.

- Four result cards show passed, failed, errors and skipped separately. Select a
  card to filter the test list; failures and errors appear first in All results.
  Expand a result for its test ID, behavior link, execution node and message.
- A native SVG ring shows the recorded pass rate, passing count and total, with
  separate counts for failures, errors and skips. Empty execution shows no rate.
  Requirement progress is separate. Blocked proposals are not executed outcomes.
- A requirement is Verified only when all its mapped behavior assessments are
  Verified with passing recorded nodes and intact execution evidence. Running
  reports are Pending; failed, cancelled or conflicting evidence is Uncertain.
  Unmapped requirements stay visible. These states concern recorded cases and do
  not establish exhaustive specification coverage or independent agent accuracy.
- Collapsed evidence checks show saved code fingerprints, document citations, selected
  extraction scope and execution integrity. Pasted requirements do not require
  document citations. Fingerprints are not rechecked by viewing the dashboard.
- Expand requirements to inspect original quotes, PDF page links, OCR confidence
  and mapped test nodes. Filter by state to find unresolved requirements.
- Summary shortcuts open the matching failures or blocked-test panel. Unresolved
  requirement counts remain visible even when every executed test passes.
- Quick start explains supported projects/documents and how to interpret results.
  Expanded evidence wraps long text on narrow screens; code and logs remain scrollable.
- Agent decisions shows each recorded generation/improvement round, proposed code,
  model review responses, admission results and the saved stopping reason. Applied
  means admitted into the active suite, not passed. Earlier reports without this
  metadata are identified explicitly. Evidence JSON and test exports retain it.
- Failure diagnoses, blocked tests, execution logs and limitations remain available
  in expandable sections. Retrieval and mutation records are under Technical
  details. Download run evidence or the approved generated tests from this page.

Original numbered IDs, supporting context and complete submitted text remain
available in the scope panel. Missing behavior extraction is visible as unresolved.
Potential-defect failures retained without changing their assertions are identified
as investigation evidence, not confirmed defects or an independent accuracy score.

Benchmarks, reference labels, human annotations and aggregate scoring stay outside
the website. Edit the reference and per-run review JSON files independently, then
use the commands in [the benchmark guide](examples/benchmark/README.md).
Use examples/evaluation-heldout.example.json as a manifest template for projects
not used in development. Keep reference labels outside model-visible project
folders. Use repeated runs, preserve frozen inputs and review every variant.
A dataset label alone does not establish independence or representative sampling.

## Target-project CI

Run a model-backed check locally or in an approved CI runner:

```sh
npm run verify -- examples/verification.json
```

The configuration specifies a supported Python or Node.js project directory, a one-requirement-per-line
text file and an output directory. The command requires Docker and OPENAI_API_KEY;
no account or PostgreSQL is required. It writes report.json, summary.md and tests.zip
in a new output subdirectory. The default gate requires a completed run, real
passing execution and all behavior states Verified. With requireVerified=false,
Partially Verified states are accepted, while failures, empty execution and
uncertainty still fail. This remains a model-assisted gate, not a correctness proof.

Copy examples/reqtest-workflow.yml into the target repository. Replace
REQTEST_REPOSITORY and REQTEST_COMMIT with your accessible ReqTest repository and
a reviewed immutable commit SHA, adjust the source/SRS paths, and configure the
OPENAI_API_KEY secret. The template is manually triggered; enable pull-request
triggers only for trusted, approved project data and an appropriate secret policy.
Private ReqTest tool checkouts need their own checkout credential. Custom project
dependencies still require a prepared sandbox image. The template has not been
installed in any external repository automatically.
