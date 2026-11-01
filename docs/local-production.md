# Local production and recovery

This guide covers a single local machine using the Compose PostgreSQL 17 service.
It does not publish the website or replace a hosted deployment plan.

## Configure and start

1. Install Node.js 22.22.2 or newer and start Docker. Run npm ci in the repository.
2. On a new checkout, create .env.local using the [README configuration](../README.md#run-locally).
   On an existing checkout, preserve the existing file. Configure DATABASE_URL, OPENAI_API_KEY and
   BETTER_AUTH_URL. The default application URL is http://127.0.0.1:3001.
3. Run npm run db:up and npm run sandbox:build. Run npm run db:migrate:production once on
   a new installation to initialize tables and a persistent local signing secret.
   Alternatively, set a strong BETTER_AUTH_SECRET before the first initialization.
   Do not replace an existing signing secret: sessions and encrypted GitHub tokens
   depend on it. Real recipients need SMTP. Local testing may use
   REQTEST_LOCAL_MAIL=true and npm run mail:up.
4. Stop existing development/production websites and workers. Run
   npm run production:check, npm run build and npm run production:start.
5. Open the configured URL. Sign in, check model connectivity and run a small
   verification. Confirm a saved report and generated-test download. A present
   API key and successful build do not prove a real model request succeeds.

Production environment precedence is .env.production.local, .env.local,
.env.production, then .env. Existing process variables take precedence. Web,
worker and operational commands load production configuration consistently. Do
not place secrets in NEXT_PUBLIC_ variables. Keep .data and the full repository
available to both services. Press Ctrl+C to stop both services together. If one
service exits, the launcher stops the other; it does not automatically restart it.
Shutdown is bounded to 20 seconds; remaining processes are then terminated. Saved
worker checkpoints remain available for retry after restart.

## Real email verification with Gmail

ReqTest uses its existing Better Auth and Nodemailer integration. No separate
authentication server is required. In your private .env.local, configure:

```dotenv
REQTEST_LOCAL_MAIL=false
AUTH_REQUIRE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASSWORD=your-google-app-password
SMTP_FROM="ReqTest <your-account@gmail.com>"
```

Enable Google 2-Step Verification, then create an App Password for this application.
Use that App Password rather than your ordinary Google password. Some organization
or Advanced Protection accounts do not permit App Passwords; consult the account
administrator or use another SMTP provider. Gmail setup follows
[Google's SMTP settings](https://support.google.com/mail/answer/7104828?hl=en) and
[App Password instructions](https://support.google.com/accounts/answer/185833?hl=en).
Keep credentials out of source control and browser-visible variables.

Port 587 starts with SMTP and upgrades using STARTTLS; SMTP_SECURE=false does not
permit plaintext authentication. Nodemailer requires the TLS upgrade and validates
the server certificate. A server without STARTTLS is rejected before credentials
are sent. Gmail configuration checks reject port 465 and SMTP_SECURE=true because
this setup specifically uses STARTTLS on 587. Other providers can use implicit TLS
with SMTP_SECURE=true on their designated port.

Run npm run mail:check to check the SMTP connection, encryption and authentication
without sending a message. For production-specific environment files, run
NODE_ENV=production npm run mail:check. Restart the website and worker after changing
configuration. BETTER_AUTH_URL must match the application address that the recipient
can open; localhost links work only on the machine running ReqTest. Public hosting
needs an HTTPS application URL and its own deployment configuration.

Register with an inbox you control. The account remains unverified and cannot sign
in until the recipient opens the signed link and selects Verify email. Links expire
after one hour. Merely opening the confirmation page does not change the account,
which avoids verification by simple email link previews. Tokens are read from the
URL fragment, removed from the address bar, then submitted in a POST body. Better
Auth validates the signature and expiry; the application does not implement its own
signing algorithm. Confirmation does not automatically sign in. Reopening an already
confirmed valid link is harmless.

Use Resend verification email on the sign-in page when a link is missing or expired.
Responses do not disclose whether an address has an account. Better Auth applies
its built-in resend rate limit. Existing unverified sessions lose access to protected
project APIs when verification is required and see a verification prompt. Existing
verified accounts, passwords, reports and GitHub connections remain in PostgreSQL.
Preserve the signing secret across restarts so issued links remain valid.

Verification is required by default whenever mail is configured. For an explicitly
optional development flow only, set AUTH_REQUIRE_EMAIL_VERIFICATION=false. Without
mail configuration, verification/recovery actions are disabled; explicitly requiring
verification without a mail service prevents authentication startup.

The automated mail test uses an isolated PostgreSQL schema and local Mailpit:

```sh
npm run mail:up
REQTEST_MAIL_TEST=1 npm test
```

Mailpit validates the application's SMTP and confirmation flow, but does not deliver
to real inboxes. Set REQTEST_LOCAL_MAIL=false for Gmail. A successful SMTP check does
not prove inbox delivery: perform one registration with your own real inbox, check
spam, confirm the link and sign in. Provider rejection, sending limits or spam
filtering can still prevent delivery. Gmail credentials and this final inbox check
must be supplied/performed by the deployment owner.

## Runtime troubleshooting

The verification page includes a Runtime status panel. If it shows no recent
worker heartbeat, start both services using the checked launcher. A normal queue
can have pending work while workers are online and busy; a missing worker is shown
separately. Use Refresh status after correcting a service problem. Offline workers
do not delete queued work or turn saved test results into failures. A worker crash
can take three missed five-second heartbeats plus the page polling delay to appear.
If account storage is unavailable, the page shows a generic PostgreSQL/service
message rather than exposing driver errors or credentials.

## Create and inspect a backup

1. Finish or cancel queued/running verifications.
2. Stop the website, worker and other ReqTest commands. The database stays running.
3. Run npm run backup:create. The output names a new directory under .backups.
4. Run npm run backup:verify -- DIRECTORY. Check the successful completion message.
5. Copy the complete backup directory to protected storage. Backups contain private
   requirements, source snapshots, reports, account data and the signing secret.
   File permissions restrict local access; the archive itself is not encrypted.
   Configure encryption and retention before using external storage.

The tool backs up the whole local database and .data, not a selected user.
Restore only backups you created or trust: hashes detect corruption, not malicious rewrites.
It excludes stale runtime leases. It does not copy .env files, installed npm
packages, OpenAI/SMTP secrets, Mailpit messages, or Docker images. Keep external
configuration in a separate secret store. Database dumps and expanded data archives
are each limited to 200 MB and data archives to 50,000 files. Never run the helper
against a database shared by multiple checkouts or machines.

## Perform a restore drill

Use a separate checkout and a newly created PostgreSQL database. These commands
must not point at the live database or live .data. The original installation can
remain stopped until the drill is complete.

1. Create an empty target database on the local Compose server, for example:

   ```sh
   docker compose exec db createdb -U reqtest reqtest_recovery
   ```

2. In the separate checkout, install dependencies and configure production
   environment files with DATABASE_URL pointing to reqtest_recovery on port 5433.
   Use the same REQTEST_DATA_NAMESPACE. Preserve the original BETTER_AUTH_SECRET
   when explicitly configured; a different secret causes restore to refuse.
   Without an explicit secret, restore writes the backed-up effective secret into
   the corresponding .data/auth-secret file. Restore external service settings
   separately. Do not start the app or migrate this empty database before restore.
3. Run npm run backup:restore -- /absolute/path/to/BACKUP_DIRECTORY. Existing target
   database objects or .data files cause a refusal, with no overwrite option.
4. Build the sandbox if needed, then run npm run production:check, npm run build
   and npm run production:start. Only start one app on the configured port.
5. Verify password sign-in, report history, original-document downloads, source
   references and generated-test exports. Check GitHub reconnection if credentials
   were revoked at the provider. Run a new verification with a real model.

Saved reports retain image IDs. A new run can use a rebuilt base image, but reusing
an older prepared environment or pinned snapshot may require its exact image.
Back up required images separately with docker image save and restore them with
docker image load if those old executions must be repeated. Restored evidence is
still readable without the image; a different image is not the same environment.

If database restore fails, its single transaction prevents a partial SQL restore
under normal PostgreSQL errors. Extracted files are retained for diagnosis. With a
lost connection, inspect the target database before assuming whether commit took
place. Recreate only the disposable recovery database/data directory before retrying.
Never clear a live target to bypass the empty-destination checks.

## Operational boundaries

Runtime PID leases and the database advisory lock protect offline operations in one
workspace. Stop old processes started before these safeguards existed before the
first backup. PID reuse can conservatively block maintenance; inspect the named
local process before removing a stale lease. Do not remove a live process's lease.

The checked launcher binds to loopback and leaves PostgreSQL/Mailpit on loopback.
Public hosting still needs TLS, a reverse proxy, supervised restart, independent
secret management, monitoring and encrypted off-machine backups. GitHub OAuth and
real email delivery still need administrator-provided credentials. Restore tests
exercise infrastructure recovery, not AI decision accuracy or human evaluation.
