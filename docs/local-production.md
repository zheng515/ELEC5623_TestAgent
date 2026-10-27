# Local production and recovery

This guide covers a single local machine using the Compose PostgreSQL 17 service.
It does not publish the website or replace a hosted deployment plan.

## Configure and start

1. Install Node.js 22.22.2 or newer and start Docker. Run npm ci in the repository.
2. On a new checkout, create .env.local using the [README configuration](../README.md#start).
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
