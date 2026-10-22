# Recurring subscriptions and financial reporting

Implemented and activated locally at `0013_recurring_reports`. Automated release
checks and the short isolated manual report rehearsal passed. The disposable
rehearsal is now stopped; this is not production rollout or policy approval.

## Working behaviour

Activated workflow memberships with a recorded, consistent following-calendar-month
start are eligible. Preview reports missing member/month obligations without writing.
Run catches up through the current Africa/Harare month, or an earlier chosen month.
Existing first obligations, historical fees, payments and accepted terms are retained.
Memberships with missing/inconsistent activation start months require explicit review;
legacy accounts are not silently activated or billed. Disabled login accounts are not
treated as an approved cancellation/billing-stop rule.

Each new obligation freezes settings effective **when it is created**, including
catch-up: amount, currency, optional due date, settings version and fee quote/rate.
Catch-up does not pretend a current rate was published in a historical month.
The first activation obligation continues to freeze at activation. Existing rows
are never repriced. The unique member/month constraint and a PostgreSQL transaction
lock protect competing runs, retries and crashes; obligation, quote and audit commit
together. Runs are capped at 5000 missing obligations; choose an earlier through-month
for larger backlogs. No future-month generation, reminder, overdue label, penalty,
suspension, cancellation or stop rule is inferred.

`subscriptions:generate` is Admin-only, separately from payment permissions. Admin
Finance oversight contains preview/run. The repeatable trusted scheduler command is:

```powershell
docker compose -p i-saveprototype-main -f compose.yaml -f compose.mailpit.yaml exec -T backend python -m app.subscription_schedule --preview
# Explicit scheduled execution, only after reviewing preview and operational ownership:
docker compose -p i-saveprototype-main -f compose.yaml -f compose.mailpit.yaml exec -T backend python -m app.subscription_schedule
```

Optional `--through YYYY-MM` limits catch-up. A scheduler actor is null and audit
source explicitly says scheduled command; no staff identity is invented. Configure
the command with an organisation-owned task runner, failure monitoring and private
execution permissions. No host schedule is installed automatically by this milestone.
Do not run generation on the normal database solely to create test records.

## Payments and separation

Existing full-payment recording and separate verification are reused, including
frozen USD/ZiG quote, decimal multiplication, half-up two-decimal rounding and unique
receipt protection across fee/savings types. Repeat identical recording/verification
does not create another payment or audit. Generic subscription paid/create endpoints
remain unavailable. Partial/mixed, advance-month, waiver and refund flows are disabled.
Fees never create savings ledger entries.

`subscription-fees:record` and `subscription-fees:verify` remain distinct permissions.
Unset subscription separation requires a **different verifier**. Admin Settings can
explicitly publish `recorder_separate` or `same_actor_allowed`; no normal approval of
same-employee subscription handling is inferred from registration fees. New payment
audit snapshots the rule/version. Later publication does not change a recorded
payment's rule. Older payments without that field use the restrictive default; no
historical audit is rewritten. Existing verified payments are preserved.

Staff Office payments, Finance Subscription fees and Admin Finance oversight provide
search by member/month/reference, status filters, pagination, due date when approved,
actual payment details and explicit verification. Member Fees/Overview show owned
unpaid/pending-verification/paid status. Legacy Paid labels without authoritative
verified payment evidence are marked for review rather than fabricated receipts.

## Reports and CSV

Dedicated `reports:read` permits Admin/Staff/Finance reports; members are denied
even with misplaced grants. `reports:export` is additionally required for CSV.
One UNION query supplies source rows and all totals from the same database snapshot.
Every total is separated by source, currency and status:

- Application registration payments: actual recorded/verified settlement currency.
- Legacy registration fees: reported historical status, no invented verification.
- Subscription obligations: billed amount/currency, **not money received**.
- Subscription payments: actual settlement, pending and verified separated.
- Savings ledger: immutable Credits and negative linked Reversals.
- Pending/Verified-but-unreconciled/Discrepancy savings: excluded from credits.

Inclusive date filters use obligation month (first day), fee payment date, pending
savings payment date and Harare ledger posting day respectively. Date ranges are at
most 367 inclusive days. Net ledger movement is the sum of credits/reversals **in
that window**, not an opening/closing or lifetime balance. A reversal can appear
without its earlier-window credit, retaining the original ledger link. Undated
legacy fee rows cannot be attributed to a dated report and remain in source records;
this milestone does not invent dates or reconcile legacy savings.

Filters include source and currency; totals cover the entire filtered result,
independently of pagination. Reports cap at 10000 source rows, CSV at 5000; narrow
filters instead of silently truncating. CSV escapes spreadsheet formulas including
leading whitespace/control characters in user-controlled cells. Trusted Decimal
amounts remain numeric. Exports record actor, filters and row count, never file
contents, in audit; responses are no-store attachments. No combined USD/ZiG total,
conversion of savings, discretionary adjustments or withdrawals are added.

## Migration and preservation

`0013_recurring_reports` adds only three permission catalog entries and canonical
Admin grants. It creates no obligations/payments, changes no financial tables and
does not publish settings/rates. Downgrade refuses used recurring/export history,
individual permission overrides and delegated grants; use reviewed recovery.
Before normal activation: private dump, independent networkless PostgreSQL restore,
all original row/schema/sequence fingerprints, additive-grant checks, rehearsal
migration, then normal upgrade and post-restart comparisons.

## Final validation and local activation

| Check | Result |
| --- | --- |
| Full backend regression on isolated PostgreSQL | **479 passed, 0 failed, 3 skipped**, 482 collected, pytest exit **0**, 312.22 seconds. [Release XML](recurring-subscriptions/backend-release.xml). |
| Skips | SQLite variants of enrolment, savings-posting and scheduler concurrency. All PostgreSQL variants passed, including repeated/concurrent subscription recording and verification. |
| Full final frontend suite | **121 passed**, 16 files, 0 failed/skipped, exit 0. Includes real directory-refresh wiring, preview isolation, retry/error/empty states and permission denial. |
| Browser-to-API-to-PostgreSQL | **2 new Chromium cases passed**, 0 failed/skipped: catch-up, separate payment/verification under explicitly synthetic policy, report/CSV agreement, mobile width and member ownership/report denial. |
| TypeScript and production | Passed; final Docker frontend client/server build and backend build passed. |
| Normal preservation | Private backup, independent restore and rehearsal migration passed. All 45 original tables preserved, allowing only 3 additive permission/Admin grants. Row/schema/sequence fingerprints matched again after restart. [Activation evidence](recurring-subscriptions/activation.json), [restart comparison](recurring-subscriptions/post-restart-preservation.json). |
| Normal smoke | Homepage200, new anonymous Admin report route redirected to login, financial API401, backend readiness200, Mailpit200. No credentialed normal login or financial actions repeated. |

The first full development run reported 467 pass/12 fail/3 skip: ten failures
identified the new downgrade guard blocking older retention checks; two older
settlement fixtures assumed advance/same-person subscription payment. The next
run reported 477 pass/2 fail/3 skip; those two were a detached-object test clock
in concurrent workers. Fixed the guard with downstream retention preflight before
changing SQLite history, explicitly configured synthetic subscription policy in
the race fixture, and captured a plain timestamp for its workers. The final full
release run above passed. No failed release check remains hidden or unresolved.

The late manual feedback exposed a stale subscription directory after generation.
Fixed successful Run to reload that directory automatically, including a successful
zero-create retry after a lost response. A focused integration regression proves
October appears without clicking Refresh; the final 121-test suite includes it.
The report now explicitly states when no ledger movement exists. Both normal and
manual frontends received the final build. The two browser financial cases were
not repeated after these frontend-only fixes; component integration tests, final
full frontend tests and production builds validate them. Historical unrelated
browser suites, Mailpit invitation cases, human screen-reader/cross-engine testing,
production load/operational review and live external sending were not run here.
Existing Starlette/httpx and Vite tooling warnings remain non-failing.

The 177087-byte private archive is outside Git at
`C:\Users\HP\isave-backups\recurring-20261022t215524\pre-0013.dump`, SHA256
`5035741879dac119e78ae25d2e5d630455e034babe0dc9e0cbfd85ac60a20fa1`.
Its directory ACL permits the current user and SYSTEM. The saved bytes were
restored on a separate networkless/portless PostgreSQL server, compared before
migration, migrated and compared afterwards, before normal upgrade. The normal
writers were quiesced for dump/activation; PostgreSQL and Mailpit stayed running.
The normal database still has zero subscriptions/payments/savings postings;
its one existing fee obligation and every other original row remain preserved.
No generation command was run on normal data. No host billing schedule was installed.

The first ad-hoc post-restart comparison incorrectly extracted a JavaScript
template without decoding its row-separator escaping. Counts, schema and sequences
matched; corrected identical canonical hashing then matched all rows as well.
This was a comparison-harness defect, not a database mutation; no records were
modified to make it pass.

Rollback images are retained as `isave-backend-rollback:pre-recurring-20261022`
and `isave-frontend-rollback:pre-recurring-20261022`. Docker Desktop no longer
resolved the old frontend manifest, so its unchanged committed Git source was
rebuilt as the rollback image, recorded with source commit in activation evidence.
Never blindly start an older backend after new activity or force-stamp history;
use reviewed recovery. The independent recovery container/volume and private dump
remain retained, with the recovery server stopped. Completed browser/regression
test services are stopped; no containers or volumes were deleted.

## Short isolated manual rehearsal

`isave-recurring-rehearsal` used **http://127.0.0.1:13040** and is now stopped
(API18040, private tmpfs PostgreSQL). This fresh synthetic scenario privately
reuses only the two known disposable login hashes from the saved savings rehearsal:
`savings-admin@example.test` and `savings-member@example.test`. No password reset,
plaintext password/token output, normal-account copy or saved-history rewrite
occurred. The guarded helper refuses normal databases and non-empty account sets.
It creates a clearly audited synthetic activation scenario and one first unpaid
September obligation; it does not claim real registration/fee approval. Original
saved rehearsal records remain in their private backup.

User browser confirmations:

1. Preview showed one missing October USD5 obligation and zero start-month issues.
2. Run reported one created; another Preview reported zero missing and Run disabled.
3. The September/October financial report matched the expected USD10 pending obligations, with no payment receipts or savings-ledger movement.
4. User confirmed final logout.

Independent server checks:

- Exactly one September and one October USD5 obligation; no duplicate member/month.
- First obligation/quote match the initial synthetic business values, original
  reference and August quote date; no due date, rate, payment or repricing was added.
  This is a comparison to the fixture definition, not a claim that a pre-run
  full-row manual fingerprint was captured.
- One authenticated Admin repeat Run created zero; subscription, quote, binding
  and audit fingerprints were identical before/after that retry.
- Zero subscription payments and zero savings ledger entries.

The report step for **2026-09-01 through 2026-10-31** is complete. Browser confirmation is distinguished from the independent server checks and the later UI-copy regression tests below. No manual payment or repeated financial checks were required.

Unresolved policies remain explicit: normal subscription separation is unset
(different verifier required), due day is unset, and partial/advance payments,
waivers/refunds, grace/overdue consequences and cancellation/billing-stop rules
are unavailable. Scheduling ownership/failure monitoring still need operational
configuration. Scanner/retention limits from the earlier documents milestone
are unchanged. No withdrawals, returns, penalties, discretionary adjustments or
savings conversion were added. Intentionally untracked evidence folders were
untouched. Nothing pushed, merged or publicly deployed.


## Rehearsal closure - 23 October 2026

Added the exact empty state "No savings-ledger movement in this period" and a separate accessible **Source records** heading/list. A plain-language note states that obligations are amounts due, not ledger movements or payment receipts. The new populated-obligation regression confirms the source list remains separate even when the ledger is empty. Six affected financial UI tests passed, zero failed/skipped; TypeScript and the production Docker frontend build passed. These frontend-only changes were activated in normal and rehearsal frontends. No backend financial changes or full financial-suite/manual repetitions were needed; earlier full-suite counts remain historical evidence, not additional test counts for this closure.

Read-only server verification found exactly one September and one October USD5 obligation; generation preview remained zero missing. Both report source rows and the filtered Pending USD10 total agree with subscriptions. There were zero subscription payments, savings contributions and ledger entries. Obligation, frozen-quote and settings-binding hashes still matched the checkpoint after logout; exactly one monthly-generation event remained.

The sole rehearsal session is revoked, zero active sessions remain, its logout audit exists, and the backend validator rejected it with401 without exposing or reconstructing a token. User browser report/logout confirmations are recorded above separately from these database/validator checks.

Before stopping tmpfs PostgreSQL, quiesced only rehearsal writers and saved a private custom-format dump outside Git: `C:\Users\HP\isave-backups\recurring-rehearsal-final-20261023\rehearsal.dump`, 178070 bytes, SHA256 `cb3b29fe1c936355012200f2d4f13153bcf2eec80b4859103e448a6ff78dac05`. Its directory ACL is restricted to the current user and SYSTEM; archive listing succeeded (470 lines). This final synthetic archive was not independently restore-tested; the normal migration backup had already passed its independent restore rehearsal. The private dump preserves the synthetic history when tmpfs is stopped; restarting that database does not promise reuse of its live data.

Stopped only `isave-recurring-rehearsal` frontend/backend/database, all exit0. No volumes or containers deleted. Normal frontend3000, backend8000, PostgreSQL5432 and Mailpit8025/1025 remain healthy; only the normal frontend was recreated for the copy fix. Normal backend, database and Mailpit were not restarted, and no normal database commands were used during closure. No unresolved functional failure remains; policy, scheduler-operation and broader unrun-check limits above still apply. Nothing pushed or merged.
