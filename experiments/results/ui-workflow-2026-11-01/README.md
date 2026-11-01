# Local production workflow acceptance

Automated engineering acceptance on 2026-11-01 using the production Next.js
build and a native headless Chrome browser, locale zh-CN. This is a technical
validation record, not the academic report or independent human usability study.

## User-flow fixes

- Sign-out resets registration/recovery mode, clears password and stale messages,
  disables duplicate submissions and exposes sign-out failures in English.
  Successful authentication also clears the password field state. Previously,
  signing out immediately after registration returned to the registration form
  with the password state and stale inbox message retained.
- The verification workspace stays mounted while Evaluation is selected. Uploaded
  requirement text, source document, repository fields, file selection and checked
  setup survive tab navigation. Dashboard identity remains keyed by account;
  sign-out/account changes unmount that state. Reload persistence is not promised.
- The Project verification tab remains available so users can return to active
  work. Leaving an active run for Evaluation remains disabled.
- The production guide now links to the actual README setup heading. The existing
  large-result browser check also covers draft retention across workspace tabs.

## Actual services checked

1. Register an isolated account, reject a weak password with live rule colors,
   sign out, reject a wrong password and sign in successfully.
2. Open Account through the username; email controls remain there. Email delivery
   was deliberately disabled, and verification was not represented as delivered.
3. Upload Markdown through the real authenticated extraction endpoint, confirm
   editable text and download identical original bytes.
4. Download qajua/reqtest-shipping-demo at commit
   e5e22a108ede7d1ca0288de0139d27b996c6291b through real project preflight.
   Root repository URL and separate commit field are used as the UI requests.
   Invalid tree-path input produces the existing English correction message.
5. Switch between Project verification and Evaluation and confirm the requirement
   draft, repository and checked setup remain available.
6. Select an unchanged authentic prior model report seeded only into the isolated
   account, then submit Re-run saved tests through the real HTTP/SSE endpoint,
   PostgreSQL queue and Docker worker. The original boundary failure remains.
7. Inspect the requirement/test/execution/assessment trail. Replay makes no model
   calls and does not refresh the original diagnosis.
8. Download evidence and pytest ZIP; compare the complete report and executable
   bytes with the owned saved run.
9. Expand all result tabs at 320/390/768px; no horizontal overflow or page errors.
   Cancel Settings without saving its draft model selection.
10. Register another isolated account; confirm empty inputs/history and a 404
    when fetching the first account's report.

The worker rejects any reasoning request; its guard was never invoked. No paid
model call, real-recipient email or OAuth action occurred. Existing user accounts,
runs and configuration were not changed. Temporary test accounts and source copies
are removed with their isolated namespace after acceptance.

## Separate large-result regression

The existing scripts/check-large-evaluation.py check uses intercepted APIs and a
26,927-outcome UI fixture. It checks 100-row pagination, filter reset, raw-record
pagination, draft retention, downloads and expanded responsive layouts. It is not
26,927 new executed tests, real authentication or model-quality evidence.

The final full regression has 214 passing tests, two optional skips and no failures.
Build, typecheck and lint pass. checks.json distinguishes actual-service checks
from intercepted-API checks and records the assessed source hashes/build ID.
Before/after screenshots document the two observed UI regressions; screenshots
contain only isolated test-account data. Browser cookies, credentials and storage
state are excluded from this retained evidence.

## Manual reproduction

Start PostgreSQL, the production website and worker using README instructions.
Use a disposable account and repeat steps 1-5, then use your own finished run for
steps 6-10. Saved-suite replay requires no new model calls. A fresh model-backed
verification is a different check and is not claimed by this record.
