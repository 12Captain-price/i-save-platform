# Local invitation-email testing with Mailpit

This is development capture, not external email delivery. No production sending
adapter, production credentials, SMTP relay or forwarding is configured. The
backend refuses this adapter outside `APP_ENV=development`, even if SMTP settings
are supplied. The regular compose stack keeps invitation delivery disabled.

## Start the local inbox

From the repository root in PowerShell:

```powershell
docker compose -f compose.yaml -f compose.mailpit.yaml up -d --build
```

Open **http://localhost:8025** for the Mailpit inbox; SMTP is published only at
**127.0.0.1:1025**. Both published ports bind explicitly to `127.0.0.1`.
The backend uses `mailpit:1025` within Docker, not the host's localhost. Mailpit
uses ephemeral container storage; no existing PostgreSQL volume is changed.
Do not enable Mailpit forwarding/relay or use a production SMTP server here.

Optional settings (the local overlay reads them; see `.env.example`):

| Setting | Local default / boundary |
| --- | --- |
| `SMTP_HOST` | `mailpit`; only `mailpit`, `localhost`, `127.0.0.1` allowed |
| `SMTP_PORT` | `1025` |
| `SMTP_FROM` | `isave-local@example.test`; only synthetic `@example.test` sender |
| `SMTP_TIMEOUT_SECONDS` | `5`, bounded 1–15 |
| `PASSWORD_SETUP_FRONTEND_URL` | `http://localhost:3000`; HTTP localhost/127.0.0.1 origin only, no userinfo/path/query/fragment |
| `PASSWORD_SETUP_EXPIRE_MINUTES` | `60`, unchanged expiring-token policy |

`INVITATION_DELIVERY=mailpit` is set only by the opt-in overlay. The existing
approved public contact email is not an SMTP credential or sender configuration.
The message subject/body and protected review UI explicitly identify local
testing. SMTP DATA acceptance is reported as **Mailpit accepted**, never as
external/inbox delivery. Its message correlation ID is not a private link.

## Use the existing protected workflow

Approve and activate through the existing fee-gated workflow. The dedicated
`invitations:issue` permission remains required. On the activated application,
choose **Capture password setup email locally**. Read the message in Mailpit and
open its private link to the local frontend. Successful setup does not log the
applicant in automatically; use normal login afterwards. The existing single-use,
expiry, revocation and member-isolation checks remain enforced.

Tokens/full links occur only in the intentional local email capture and the
recipient's private setup flow. They are absent from ordinary application API
responses, audit details, application logs and browser storage. The setup page
removes the URL fragment immediately. Treat the local inbox as private because
its messages contain valid development setup links.

## Retry semantics

The request UUID and hashed-token invitation are committed **before** SMTP is
called. Concurrent/repeated requests with that UUID cannot create another
invitation or call SMTP again. A successful replay returns only the existing
non-secret acceptance state/correlation ID. Approval/payment/activation are never
repeated by invitation retries.

SMTP cannot guarantee exactly-once delivery across an uncertain connection or a
process crash. This implementation fails closed: failed attempts are retained,
revoked and marked **Unconfirmed - not retried**; an interrupted **Sending**
attempt is never automatically resent. Refresh the review before requesting an
explicit replacement. Tick the separate, initially unticked replacement checkbox
to confirm that earlier unused links will stop working, then capture a new
invitation with a new UUID. A replacement may produce another inbox message;
older links remain invalid. No background email retries are enabled.

To return the backend to disabled delivery and stop the inbox without touching
PostgreSQL or its volume:

```powershell
docker compose -f compose.yaml -f compose.mailpit.yaml stop mailpit
docker compose -f compose.yaml up -d --no-deps --force-recreate backend
```

This recreates only the backend container, preserving the database. Do not run
`down -v` or remove the office volume.

## Isolated validation

```powershell
docker compose -p isave-browser-auth -f compose.auth-test.yaml -f compose.mailpit-test.yaml up -d --build
$env:ISAVE_MAILPIT_TEST='1'
$env:PLAYWRIGHT_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npx.cmd playwright test e2e/mailpit.spec.ts
docker compose -p isave-browser-auth -f compose.auth-test.yaml -f compose.mailpit-test.yaml down
```

This stack uses tmpfs PostgreSQL `isave_test_browser`, frontend port 13000,
Mailpit inbox 18025 and SMTP 11025, all published on localhost only. The test
refuses the operational database, generates synthetic credentials privately and
reads test links only in memory. Use a fresh disposable stack for each run.
No schema migration is needed for this change.

References: [Mailpit SMTP capture](https://mailpit.axllent.org/docs/usage/sending-messages/),
[Docker image](https://mailpit.axllent.org/docs/install/docker/),
[relay configuration](https://mailpit.axllent.org/docs/configuration/smtp-relay/).

## Validation and local activation — 19 October 2026

- **141 affected backend tests passed** against isolated synthetic PostgreSQL:
  authentication/permissions, fee workflow, durable invitation retries, SMTP
  configuration and production/external-target rejection.
- **58 frontend tests**, TypeScript and production Docker builds passed.
- **3 Chrome/Mailpit integration tests passed** with real local SMTP capture:
  activation, lost-response replay producing one message/invitation, password
  setup, same-tab used-link refusal, expired-link refusal, SMTP outage with a
  retained/revoked attempt, no automatic resend and concurrent replacement-key
  deduplication. Application responses/logs were checked for private-link leakage.
- Opening another link in the same setup tab now resets its previous success
  state, processes the new fragment and immediately removes it from the URL.
- Enabled the opt-in local overlay and verified healthy backend/frontend/Mailpit,
  an empty operational Mailpit inbox, the localhost setup origin and Docker's
  actual `127.0.0.1` bindings for ports 8025/1025. No email was sent for any
  existing office record.
- Compared hashes/counts of every existing database table's rows, including
  migration history, before and after restart: unchanged. No schema migration,
  production sending, push or merge was performed. The previous verified database
  backup remains retained; no new migration required a backup/restore drill.

The automated-validation disposable stack was stopped after that run. A separate
guided run is now retained as described below. The operational volume is separate.

## Guided replacement-invitation verification — 19 October 2026

The user completed private password setup from the replacement capture and logged
in as the synthetic `guided-member@example.test` at the disposable frontend.
The earlier shared invitation had already been explicitly revoked. No private
link, raw token, password or password hash is recorded in this document.

Server-side checks on PostgreSQL `isave_test_browser` passed:

- Exactly two invitation records for this test member: the earlier invitation
  remains revoked and unconsumed; the replacement is consumed and not revoked.
  The replacement has a consumption timestamp and there is exactly **one**
  successful `password_setup_completed` audit event for this application/member.
- Both actual captured links were read privately in memory and tested against
  `POST /api/v1/auth/setup-password`. Both returned **HTTP 400** with error code
  `invalid_invitation`: the shared link because it is revoked, the replacement
  because it has already been consumed. Probe passwords were generated privately;
  the member's chosen password was neither requested nor revealed.
- Compared records before and after both rejection probes: the password hash,
  invitation state, sessions, setup audit and financial/business records were
  unchanged. Only disposable request-throttle counters may advance on rejected
  requests. No second successful password setup was recorded.
- A successful member login audit and an active, unrevoked, unexpired session
  corroborate the user's login. The user reported the browser Fees display;
  server records confirm the existing verified **USD20** registration payment is
  linked once to the activated member, with **zero contributions/confirmed
  savings**. The **2026-11 USD5** subscription is **Pending**, with no due date.
- Neither captured token nor a full private setup URL appeared in the disposable
  backend/frontend application logs; only a pass/fail privacy result was printed.
- Recomputed the read-only row fingerprint for every table in the existing office
  database, including migration history: it still matches the saved **pre-Mailpit**
  baseline. All guided mutations/probes were restricted to the separately guarded
  disposable database. No operational records were created or changed.

At the end of the guided verification, both stacks remained running at the user's
request. The subsequent full-regression rehearsal and authorised disposable-only
cleanup are recorded below. No push or merge was performed.

### Backend suite-count clarification

The Mailpit milestone used a **targeted regression run**, not a new full-suite run:

| File executed | Passed |
| --- | ---: |
| `backend/tests/test_auth.py` | 94 |
| `backend/tests/test_membership_workflow.py` | 35 |
| `backend/tests/test_invitation_smtp.py` | 12 |
| **Targeted total** | **141** |

The command selected these three files with `INVITATION_DELIVERY=disabled` against
a separate synthetic PostgreSQL test database; SMTP configuration/payload tests
use controlled fakes. The separate **three Chrome/Mailpit integration tests** used
real local SMTP and disposable PostgreSQL. Their count is not included in 141.

The **240 passed** result in [membership validation](membership-validation.md)
belongs to the earlier full backend run for fee-gated activation. It predates the
later role-boundary and SMTP test additions. Its **37-test** final affected rerun
overlaps that suite and must not be added to it as unique tests. Likewise, 141 is
neither a replacement full-suite total nor 141 additional unique tests.

A **collection-only** check during this guided verification confirmed the file
counts above and **256 tests currently collected across the full backend suite**.
Collection executed no fixtures or tests. At that point, the current full suite
had not been rerun; the subsequent **256-pass full run** is recorded below.
The milestone's 58 frontend tests, TypeScript/build
checks and three integration passes remain the previously recorded automated
evidence, not additional runs performed during this guided verification.

No remaining failure was observed in these server-side checks. External/production
email delivery remains deliberately disabled and untested. The guided verification
did not obtain the user's password or perform another login/password reset, and
did not rerun the entire browser or backend suite. Automated invitation-expiry,
SMTP-outage and concurrent retry coverage remains from the three integration
tests; those scenarios were not repeated on the user's consumed guided link.

## Full backend regression follow-up — 20 October 2026

The current backend image was rebuilt from the working tree, then the **entire
`backend/tests` suite** was executed with primary fixtures on a new PostgreSQL
database, `isave_test_regression_20261019t213446z`, inside the disposable
`isave-browser-auth` project. PostgreSQL storage was verified as tmpfs. Both
`DATABASE_URL` and `ISAVE_TEST_DATABASE_URL` pointed to that new test database,
and `TEST_POSTGRES_URL` pointed to the disposable server's administrative database
so PostgreSQL migration-lifecycle cases ran rather than skipped. The lifecycle
matrix additionally exercised SQLite by design. SMTP sending was disabled in
this backend regression process; earlier real SMTP/browser checks remain separate.

**Result: 256 passed, 0 failed, 0 errors, 0 skipped; original exit status 0.**
Pytest reported **118.82 seconds**. The JUnit test cases independently matched
those counts. This supersedes the collection-only limitation above and is a full
current regression pass; it is not a sum of the historical 240 and targeted 141.

The execution command was run directly, without an output pipeline or shell
wrapper that could replace pytest's status. PowerShell captured `$LASTEXITCODE`
immediately, saved it and explicitly exited with that original value:

```powershell
$regressionUrl='postgresql+psycopg://postgres@db:5432/isave_test_regression_20261019t213446z'
docker compose -p isave-browser-auth -f compose.auth-test.yaml -f compose.mailpit-test.yaml run --rm -T --no-deps `
  -e "DATABASE_URL=$regressionUrl" -e "ISAVE_TEST_DATABASE_URL=$regressionUrl" `
  -e TEST_POSTGRES_URL=postgresql+psycopg://postgres@db:5432/postgres `
  -e INVITATION_DELIVERY=disabled -v "${PWD}/test-results:/test-results" `
  backend python -m pytest -q -p no:cacheprovider --tb=short `
  --junitxml=/test-results/backend-full-20261019T213446Z.xml tests
$pytestExit=$LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $PWD 'test-results/backend-full-20261019T213446Z.exit'),[string]$pytestExit)
Write-Output "PYTEST_EXIT_CODE=$pytestExit"
exit $pytestExit
```

The database was newly created on the disposable server before this command.
Do not reuse these destructive test fixtures against an existing database.
The ignored local artifacts are `test-results/backend-full-20261019T213446Z.xml`
and its `.exit` companion; the command process itself also returned exit code 0.

There were **no failures to diagnose**. One existing `StarletteDeprecationWarning`
reports that `httpx` use with `starlette.testclient` is deprecated in favour of
`httpx2`. This is a future test-dependency compatibility item, not a failing test;
no dependency changes were made for this rehearsal.

After the passing result and documentation update, only the disposable project
is stopped/removed with the exact project-scoped `down` command, without `-v`:

```powershell
docker compose -p isave-browser-auth -f compose.auth-test.yaml -f compose.mailpit-test.yaml down
```

The guided synthetic data is disposable tmpfs state. The normal application,
PostgreSQL volume and local Mailpit inbox on port 8025 remain running. No query,
migration or test fixture targeted the existing office database in this full
regression run. No production/external email or new browser suite was exercised;
no push or merge was performed.
