# Fee currency and isolated settings rehearsal

## Final validation and normal activation — 21 October 2026

This section supersedes the earlier normal-deployment deferral below. Following
the user's explicit activation request, the normal database was backed up,
restore-tested separately, upgraded from `0009_business_settings` to
`0010_fee_currency`, and the normal backend/frontend rebuilt and restarted.
No migration history was force-stamped or rewritten; no volumes were deleted.

The normal writers were stopped before baseline fingerprints and `pg_dump -Fc`.
The access-restricted, Git-ignored archive is
`backend/data/fee-activation-20261021/before-0010.dump` (111602 bytes), SHA-256
`8fea6a6654ca246fa6d9f73c4b4fd01b68f6a1f6200b7e5611c7e90a536e2b82`.
The container archive and copied archive hashes matched. The accompanying private
baseline contains fingerprints, not printed business records or credentials.

`pg_restore --exit-on-error --no-owner` restored it into the separately named
`isave_recovery_fee_20261021` database. All 30 original tables' rows and schema
matched before migration. Migration 0010 passed there, preserving those records,
allowing only the two intended subscription permission/Admin grants. The recovery
API passed startup/readiness, public contacts and anonymous denial of rate
settings. Only then was the normal database upgraded. The same original-table
comparison passed immediately after migration and again after application
restart. Existing fee obligations were backfilled without fabricated rates or
creators; their count matched the existing subscription and registration payment
records. All original payments, subscriptions, accepted evidence and audits were
preserved. No synthetic records were inserted into the normal database.

Normal startup/readiness, frontend, public contacts and anonymous rate-access
denial passed. The normal rate 34 remains an **unpublished migration draft**,
with zero publications; rehearsal rate 35 was not copied or published there.
The original archive and separate recovery database remain retained.

Source/status presentation now labels stored provenance **Original source
(unchanged)**, explains historical draft wording, and distinguishes Unpublished
draft, Scheduled, Effective and Superseded. No saved source, migration seed or
publication evidence was rewritten. Frozen fee quotes explicitly distinguish
historical source wording from their captured effective publication date. Both
the normal and rehearsal frontends received this presentation fix; the rehearsal
database/backend were not restarted, and its historical fingerprint check passed.

Final automated checks:

- **368 backend tests passed**, zero failed/skipped, original exit status **0**,
  on a dedicated isolated PostgreSQL stack (298.83 seconds). This includes all
  previous tests and a new activation boundary test: a USD5 subscription created
  one second before a future rate captures 34/ZiG170; one created at the exact
  effective timestamp captures 35/ZiG175. Every column of the earlier
  subscription, frozen obligation and registration payment remains unchanged.
- **84 frontend tests passed**, zero failed; the focused rate suite passed 6
  tests, including unchanged source evidence and scheduled/effective/superseded
  status. TypeScript and frontend client/server production builds passed.
- No new full Playwright run was performed for this follow-up. The earlier
  28-pass/3-Mailpit-skipped browser run and guided rate checks remain recorded
  below; no claim is made that they exercised the new status labels.

The new automated regression stack alone was stopped after validation. Normal
application, database and the manual rehearsal remain running. Existing local
Mailpit had stopped during the earlier host restart; it was started without
recreation. External email delivery was not enabled or tested. The existing
Starlette/httpx deprecation and frontend tooling warnings remain. Human
screen-reader review and a new full browser regression remain unperformed in
this follow-up. Nothing was pushed or merged.

## Completed guided rate rehearsal — 21 October 2026, replacement run

The user privately created the replacement disposable Admin. Server-side checks
were guarded to `isave_test_settings_rehearsal`; no normal database was accessed.
Before publication, version 1 rate 34 had no publication/effective rate and both
historical obligations offered USD only. After the user's explicit publication,
rate 34 was effective with an authenticated publisher. The user froze
`REHEARSAL-REVIEW` at USD20 / ZiG680, version 1.

The user saved version 2 rate 35, labelled “Disposable rehearsal only — synthetic
test rate 35 ZiG/USD; not approved for normal use.” While unpublished, the
server confirmed effective rate 34 and the original ZiG680 quote. Following
explicit publication, effective rate became 35. The user submitted a separate
synthetic pending application and froze its quote through Admin review; the
browser and server both confirmed USD20 / ZiG700, version 2. The original
review application still retained USD20 / ZiG680, version 1. Both applications
remained Pending, with no recorded payment or membership approval.

The read-only fixture comparison passed after each publication and the final
quote: original synthetic payment, subscription and both historical obligations
were unchanged. The new USD5 equivalent was calculated server-side as ZiG175
(previously ZiG170 at rate 34); this guided run did not create a new subscription
or activate membership. Subscription settlement remains covered by automated
tests, not a new manual subscription transaction. Public-contact editing and
publication were not exercised in this guided rate run.

Cleanup flag: the immutable version 1 source still says “Draft awaiting explicit
publication” after publication. Preserve that historical evidence. Future source
wording should describe provenance without embedding mutable publication status;
UI status should be displayed separately. No historical source was rewritten.
The disposable stack remains running. No push or merge was performed.

## Rehearsal interruption — 21 October 2026

Login diagnosis inspected only `isave-settings-rehearsal`. All three services
were running; PostgreSQL and backend were healthy and the frontend responded.
The database contained zero users, applications, payments, subscriptions and
obligations, with only the migration-seeded unpublished rate 34 remaining.
The recent database restart and tmpfs storage are consistent with loss of the
previous disposable database contents. Previous draft-isolation results above
describe the earlier run; those manual drafts are no longer in the database.
No recovery of those drafts is claimed. The surviving fingerprint file contains
hashes only, not records or a backup. No normal database was accessed during
this diagnosis.

The private setup command now retains a stale fingerprint file under a unique
previous-run name when the database has no users, applications or obligations,
then allows fresh private setup. It refuses ambiguous unowned records rather
than overwriting them. Replacement setup creates new synthetic fixtures; it
does not restore prior drafts. Credentials must be entered only in the user's
interactive terminal. This tmpfs rehearsal cannot preserve records across a
database restart; export a disposable backup before stopping it if future
retention is required.

## Working behaviour

Admin → Organisation settings includes separate, versioned USD-to-ZiG fee
rates. Migration 0010 supplies **34 ZiG per USD as an unpublished management
draft**, with its source recorded. It has no conversion effect until an
authorised administrator explicitly publishes it. Saving and publishing require
`settings:write` and `settings:publish` respectively; reading requires
`settings:read`. The backend records authenticated actors, publication time and
effective time, rejects stale edits/backdating, and makes exact retries
idempotent. Future publications become applicable only when effective.

Each new USD fee obligation freezes its nominal amount and the then-effective
published rate/version. Decimal multiplication is rounded once to two decimal
places using ROUND_HALF_UP (for example 1.005 becomes 1.01). Converted amounts
must remain positive and fit the supported 12-digit, two-decimal payment field.
The API supplies the exact payable options; the browser does not calculate
exchange amounts. ZiG uses internal currency code `ZWG`.

Registration review can explicitly freeze an obligation and display its payment
options before recording payment. Existing native-currency recording remains
compatible by freezing the obligation atomically; converted recording requires
an already-persisted quote. Missing effective rates leave only the native
currency available, including after a rate is subsequently published. Rate
changes never retrofit or revalue existing obligations.

Registration recording and verification retain their distinct permissions and
audits. Subscription payment recording and verification are separate actions
with dedicated `subscription-fees:record` and `subscription-fees:verify`
permissions; the protected list also requires `subscriptions:read`. Admin's
Finance oversight and Finance's Fees screen display these obligations. Settlement
accepts one exact, full amount in one offered currency, with date/reference.
Duplicate references, changed retry payloads and concurrent duplicate posting
are rejected or resolved idempotently. Verification is never implied by a
checkbox or recording a payment.

Member Fees and Overview retain the original nominal USD fee and display actual
settlement currency/amount separately. Subscriptions retain their original USD
amount even when paid in ZiG. Rate source, effective date and frozen version
remain available with the obligation. Fees do not increase savings. Savings
conversion is unavailable; the member savings summary remains unavailable. The
legacy USD aggregate refuses non-USD verified contributions rather than combining
or relabelling currencies. This does not introduce a reconciled savings ledger.

Partial/split settlement, refunds, savings conversion, penalties, recurring bill
generation, publication cancellation and external email delivery remain outside
this change. Existing due-day and review policies are unchanged.

## Isolation and migration preservation

The normal application/database remain on 0009. Migration 0010 was applied only
to disposable PostgreSQL. Do not restart the normal backend with this new image
until a separately authorised deployment includes a fresh normal backup and
restore test. This rehearsal does not authorise changes to normal settings.

Before migration, a synthetic PostgreSQL database at 0009 was archived using
`pg_dump -Fc`, restored separately with `pg_restore --exit-on-error --no-owner`,
and compared by schema and row fingerprints. All 30 original tables matched.
After upgrading that restored copy to 0010, they still matched, allowing only
the two intended subscription permission/Admin grants. Legacy obligations were
backfilled without fabricated rates; the 34 draft remained unpublished. The
ignored synthetic archive is `backend/data/currency-drill/before-0010.dump`;
SHA-256: `332311a92ee541096e60f2016bcb045ea1347c49b9524899eaeba56d79382af5`.
No real database archive or synthetic records were written into the normal DB.
Read-only normal database checks before and after validation matched exactly:
30 original tables, revision `0009_business_settings`, row fingerprint
`4acb2aa0d79ce7df106fafdc967e11ad85c118b3d229ac70708ab981c85c8abc`,
schema fingerprint
`03ead5b35d059999257f6f11611102f8e88aa60f305e5e5fd23930851c507657`.

## Private, one-step-at-a-time manual rehearsal

The dedicated project is `isave-settings-rehearsal`, combining
`compose.auth-test.yaml` and `compose.settings-rehearsal.yaml`. Its PostgreSQL
storage is disposable tmpfs, database `isave_test_settings_rehearsal`, and browser
address `http://127.0.0.1:13000`. It has no normal database volume or external
email. Never substitute the normal compose project in these commands.

1. In your own interactive PowerShell at the repository root run:

   ```powershell
   docker compose -p isave-settings-rehearsal -f compose.auth-test.yaml -f compose.settings-rehearsal.yaml exec backend python -m app.settings_rehearsal
   ```

   Choose a unique disposable Admin email/password only at the hidden prompts.
   Do not paste them into chat. This creates synthetic historical USD20 paid
   registration/USD5 pending subscription fixtures and a separate review
   application. It does not send email or issue invitation links. The CLI
   refuses a normal database before connecting and never resets existing users.
2. Sign into the isolated browser and open Admin → Organisation settings.
   Confirm rate 34 is unpublished. Inspect the synthetic historical records.
3. Edit only a public contact description/address using clearly synthetic text,
   save a draft, and check the isolated public Contact page in another tab: it
   must still show the previous published value. Inspect the publication preview.
4. Explicitly publish the saved contact revision, then reload the isolated
   Contact page. It should show that revision. Do not enter real secrets in
   business settings.
5. Inspect the 34 rate source and preview, then explicitly publish it if desired.
   Freeze an obligation on the separate review application: USD20 has the exact
   alternative ZiG680. Historical pre-publication obligations must still offer
   only USD and retain their original amounts/statuses.
6. Run the read-only historical comparison:

   ```powershell
   docker compose -p isave-settings-rehearsal -f compose.auth-test.yaml -f compose.settings-rehearsal.yaml exec backend python -m app.settings_rehearsal --verify-history
   ```

   PASS compares the original payment, subscription and both frozen obligations.
   Do not deliberately pay the historical pending subscription during this
   preservation test. Report only status/results, never credentials or links.

The human rehearsal is pending private Admin creation and user confirmation;
automated validation is not a substitute for this sign-off. Keep the dedicated
stack running until the user finishes.

## Automated validation

- Full isolated PostgreSQL backend regression: **364 passed**, zero failed or
  skipped, original command exit status **0**. This includes rate publication,
  effective dates, rounding, fee gates, actor/permission enforcement, actual
  currency verification, duplicate/retry protection, concurrent publication and
  subscription settlement, historical preservation and schema drift refusal.
- Frontend: **83 passed**; TypeScript passed.
- Additional rehearsal CLI checks after the full run: **3 passed**, exit **0**
  (normal-database refusal plus SQLite/PostgreSQL private fixture setup,
  publication, historical comparison and safe rerun). These are separate from
  the 364-test regression count. An initial focused command used an incorrect
  container mount path and collected no tests (exit 4); the corrected command
  produced these three passes.
- Full browser suite: **28 passed**, **3 opt-in Mailpit cases skipped**. Includes
  browser-to-API-to-PostgreSQL rate publication, lost-response retries, frozen
  ZiG registration/subscription settlement, member display, historical records,
  settings draft isolation/publication and denied access.
- Docker frontend production client/server builds passed.

The existing Starlette/httpx deprecation warning remains. Human screen-reader
review and the guided manual rehearsal remain outstanding. Mailpit delivery was
not exercised by this rate/settings milestone. Nothing was pushed or merged.
