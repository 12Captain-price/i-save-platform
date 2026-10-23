# Withdrawal requests and verified manual payouts

Current status, 23 October 2026: normal migration 0014 is activated. Existing-record preservation and independent backup restoration passed. Withdrawal processing remains disabled because the required operational policies are unset. The checkpoints below retain their historical results; the normal activation section records the deployed state.

This extension supersedes earlier documentation that describes withdrawals as
entirely unimplemented. It preserves all accepted plan snapshots, original
credits/reversals, payments and subscription obligations. There is no payment
provider integration or automated transfer.

## Working controls

- A member can request only against their own recorded enrolment, after its
  eight-calendar-month completion date in Africa/Harare. The accepted eight-month
  terms and recorded dates must agree. Current plan settings cannot substitute
  for those records. Inconsistent historical records require explicit review.
- Complete, effective published withdrawal policy is required. Unticked request
  acknowledgement, amount, currency, original terms, policy version, completion,
  request time and the exact 14-day notice deadline are retained. Retries reuse
  their original key; conflicting reuse is refused.
- Requests lock the enrolment, reserve only its confirmed reconciled funds, and
  keep confirmed, reserved and available amounts separate. No cross-enrolment or
  cross-currency funding, pending funds, fees or subscriptions are included.
  Funding credits cannot be reversed while reserved or already spent.
- Dedicated permissions are `withdrawals:own`, `withdrawals:read`,
  `withdrawals:approve`, `withdrawals:process` and `withdrawals:verify`. Members
  receive ownership access; Admin receives the office capabilities. Staff and
  Finance need explicit grants. Every actor comes from a locked authenticated
  session, never a supplied actor identifier. Member-owned detail/receipt access
  remains enforced even if inappropriate office permissions are granted.
- Requested -> Approved requires the configured number of different reviewers.
  Approval creates no payout or debit. Approved -> Processing is refused before
  the complete notice interval ends and starts no external transfer.
- The processing employee explicitly records actual manual payout evidence:
  approved method, original amount/currency, actual timezone-aware time, Harare
  payment date and globally unique receipt/reference. Recording retains the
  reservation and is not a paid receipt. A separately permissioned verification
  follows the request's snapshotted separation rules.
- Verification atomically marks Paid, releases the reservation, adds its event
  and audit, and inserts exactly one linked negative withdrawal ledger entry.
  PostgreSQL guards retain snapshots/events/payout evidence/debits and require
  matching verified payout evidence before a debit can be inserted. Existing
  savings credits and linked reversals are not overwritten.
- Rejection/cancellation releases only unprocessed requests. Processing or
  recorded payouts can be flagged Uncertain and stay reserved. Explicit reviewed
  evidence that payment did not occur is required for Failed/release, with
  independent review where configured. Paid history cannot be cancelled to
  restore money. Post-payment corrections/refunds are deliberately unavailable.

Member and office screens provide eligibility, search/pagination, policy and
review history, safe retries and manual receipts. Member Overview and contribution
summaries subtract posted withdrawal debits and display reservations separately.
Reports and protected CSV include distinct withdrawal debit and reservation source
categories. Net ledger movement includes credits, linked reversals and payout
debits. Reservations are current state filtered by original request date, **not**
historical balances as of a reporting date. USD and ZiG stay separate.

## Policy decisions still required in the normal environment

Admin Organisation settings supports versioned drafts, publication, effective
dates and future-request-only snapshots for:

- Full-only or full/partial requests.
- No limits or bounded limits, with an explicitly approved maximum for each
  supported currency and optional minimum.
- Manual office cash, manual bank-payment evidence, or both.
- One or two distinct approval reviewers.
- Three distinct approver/processor/verifier roles, separate processor/verifier,
  or explicitly approved same-actor processing.
- Explicit unprocessed-only cancellation and evidence-review-before-release
  failure handling.

All these decisions remain unset in normal settings. Missing policy blocks
requests and processing; the registration-fee same-person exception is not reused.
Incomplete withdrawal policy does not block publishing unrelated contacts or fee
settings. Existing requests retain their own policy if later settings change.
There are no charges, penalties, interest, deductions, conversion, discretionary
balance changes or provider switches. Operational payout evidence procedures,
staff permission grants and policy sign-off remain necessary before real use.

## Validation and isolated rehearsal

Normal migration activation and final test evidence are recorded below once their
gates finish. Earlier intermediate test failures are not reported as passes.

The manual rehearsal uses only `isave-withdrawal-rehearsal`, frontend port 13050,
its own tmpfs PostgreSQL, and the reusable synthetic Admin/Member credentials
privately read from a retained disposable archive. No operational credentials or
configuration are copied. Setup is transactional and refuses existing accounts;
it never resets them. Two fixture preparation failures were rolled back completely
and corrected by using Decimal for the in-memory weekly target. Sequence gaps
are expected; the prepared programmes are enrolments 3, 4, 5.

The guarded `app.withdrawal_rehearsal serve` entrypoint installs a private scenario
clock **only in that explicitly selected disposable server**. It refuses normal
database/environment settings. Normal uvicorn does not import it; no API or
business setting changes time. Authentication and database audit timestamps use
real time. The scenario begins 14 days behind real time so notice enforcement can
be demonstrated without waiting. Consequently local request dates show 9 October
while original audit events show 23 October. This difference is deliberate TEST ONLY
evidence, never an alteration to operational history. Moving the scenario clock
later does not rewrite request timestamps, notice deadlines, accepted terms or
events. Synthetic same-actor policy is explicitly labelled and is not normal approval.

User browser confirmation: mature USD enrolment 3 had USD10 available; premature
USD enrolment 4 could not submit; separate ZiG enrolment 5 had no funds. The user
submitted withdrawal 1 and observed Requested, USD10, policy version 4.

Independent server evidence: blocked enrolments 4/5 both rejected attempted
submissions with 409 and created no request. Withdrawal 1 retained USD10 confirmed,
USD10 reserved, USD0 available; zero payouts and zero debits. Its accepted terms
matched the original plan byte-for-byte; SHA256
`8b38a08def753edd9cefea13196d0a6530a999047086b5778fca8b0d0806ff1d`.
The notice interval was exactly 14 days and the unchanged scenario clock remained
before its deadline. At that first checkpoint, Admin review and the remaining manual payout checks were pending.


## Final automated validation and normal restore gate - 23 October 2026

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full backend regression, isolated PostgreSQL (507 collected) | 503 | 0 | 4 |
| Full frontend suite, bounded to two workers | 129 | 0 | 0 |
| Withdrawal browser-to-API-to-PostgreSQL cases | 3 | 0 | 0 |

All final commands exited 0. Four SQLite parametrisations intentionally skip true concurrency (enrolment, recurring generation, savings posting and withdrawal posting); all four PostgreSQL variants passed. The added withdrawal focused run passed 18 and skipped 1 before the complete final rerun. TypeScript and backend/frontend production Docker builds passed. See [non-sensitive counts](withdrawals/validation.json).

Initial failures were diagnosed and resolved: an existing savings concurrency fixture used a UTC payment date that could precede its local enrolment start; it now uses the recorded start date. A new UI assertion accidentally matched the Paid filter option; it now checks absence of a paid receipt. Browser setup used installed Chrome after its bundled executable was unavailable, added the missing same-origin header to test writes, corrected an exact select-label locator and used Harare timezone for payout entry. An unchanged assisted-registration test timed out under host contention; the full suite passed with two workers and unchanged assertions/timeouts. No application safety checks were relaxed.

Unrun: the full unrelated historical browser suite, human screen-reader testing, external provider transfers and real-money operation. Existing Starlette/httpx and frontend build-tool deprecation notices remain. No outstanding automated functional failure is known.

A private custom-format normal backup was saved outside Git, restricted to the current Windows user and SYSTEM: `C:\Users\HP\isave-backups\withdrawal-20261022t230607\pre-0014.dump`, 177135 bytes, SHA256 `70d369b025ec6292b88c37f27b353def7670f06be6f76a0a77a94e04a888ee22`. An independent networkless PostgreSQL server restored it and migrated successfully to 0014. Original row, schema and sequence fingerprints matched; original permission grants were preserved, with only the five expected canonical capability additions. All four new workflow tables remained empty. The restored normal withdrawal policy remained unset.

The normal database remains 0013, with identical original records, structure and sequences. Normal services/settings were not stopped, restarted or changed during this restore-only gate, following the later manual-rehearsal instruction. The activation JSON contains a clarification for an old prewritten check label that mentioned quiescing; no normal writers were quiesced. Normal migration 0014 and backend/frontend activation remain outstanding. Prepared images do not activate themselves. A new fresh backup/preservation gate will run before eventual activation. No synthetic normal data, approved normal withdrawal policy, provider configuration, push or merge was introduced. Protected untracked UI evidence folders were untouched.


### Manual approval and notice checkpoint

Browser confirmation: the user approved withdrawal1 with the rehearsal Admin. Server evidence independently confirmed Approved, USD10 confirmed/reserved, USD0 available, zero payouts and zero debits. Accepted-terms SHA256 still matched the initial checkpoint. A direct guarded server-service processing attempt using the unchanged scenario clock was refused409 for the two-week notice, leaving event history unchanged. This service check is distinguished from the authenticated end-to-end notice denial in the passing browser suite.

Only after that denial, the trusted disposable helper advanced its private clock past the original deadline. Stored request, accepted terms and original notice/history were not updated. The minute-aligned synthetic payout time is23October2026 01:06 Africa/Harare. The user is being guided through explicit manual processing/recording, followed by separate verification; those remaining browser confirmations are pending. No real transfer is claimed.


### Harare-time payout correction - 23 October 2026

The user reported rejection of payout recording. No rejected payload was retained or logged, and the original browser fields/timezone were unavailable. This original input is not claimed as recovered. Automated browsers reproduced the old timezone dependency with synthetic 2026-10-23T01:06 input: a UTC browser parsed it as 2026-10-23T01:06Z (03:06 Harare), two hours after the frozen clock. The reproduced failing condition was not-future; the notice and Harare-date conditions passed. A New York browser also produced a future instant. A Harare browser parsed that same synthetic input correctly.

The form now explicitly requests Harare (UTC+02:00) time, converts with that offset independently of the browser timezone, rejects invalid calendar values and displays notice/history times in Harare. Timestamp construction is inside error handling; failures preserve fields and uncertain retries retain their key. Server validation was unchanged: recorded instants must be at or after notice, no later than the service clock, and agree with the Harare payment date. Only the disposable frontend was rebuilt/recreated. Its backend/database and all normal services were unchanged.

Affected validation:22 backend tests passed on isolated PostgreSQL, including one microsecond before notice, one microsecond after the service clock, date mismatch, and exact valid notice/clock boundaries;14 frontend tests passed;3 browser cases passed in UTC, Harare and New York against the rebuilt rehearsal frontend, with all APIs intercepted to avoid live writes. TypeScript and the production frontend build passed. Initial browser-mock cases timed out because a direct protected-document request correctly required server authentication; the harness now enters through the public login shell and mocked client identity. No authentication guard was weakened. Full milestone suites were not rerun for this narrow frontend fix; their earlier counts above remain historical results.

Read-only final evidence:clock stayed2026-10-22T23:06:00Z (23October01:06 Harare); notice stayed2026-10-22T22:47:43.976125Z (23October00:47:43.976125 Harare). Request1 stayed Processing with request/approve/process history only, zero payouts and zero debits. Confirmed/reserved/available remained USD10/USD10/USD0. Original immutable-request and accepted-terms fingerprints matched private checkpoints. See [timezone check evidence](withdrawals/timezone-check.json). No clock, deadline or financial row was changed to manufacture a pass.

One retry uses explicitly labelled Harare time2026-10-23 01:06 and payment date2026-10-23, mapping to2026-10-22T23:06:00Z. The failed payment reference is still unused and may be retried. Recording and separate verification are still pending; no transfer or paid receipt is claimed. Nothing pushed or merged.


### Authorised single browser recording - 23 October 2026

The user explicitly authorised completing one actual browser recording and stopping at Recorded. Preflight on only isave-withdrawal-rehearsal confirmed Processing, zero payouts/debits, the unchanged frozen clock2026-10-22T23:06:00Z and original notice deadline2026-10-22T22:47:43.976125Z. The existing synthetic Admin was the recorded processor and held the required backend permissions. No accounts, passwords or permissions were reset. A short-lived private session for that existing synthetic actor was created solely for automation and revoked afterwards; tokens stayed in pipe/browser memory and were not logged or saved.

Two automation runs stopped while filling a date/time control, with a browser-driver Malformed value error and zero payout POSTs. They created no payout, debit or record event; their temporary sessions were revoked. The successful run used minute-precision Harare input and exact date-field targeting. It clicked Record once and sent exactly one real POST to the protected application API; no API response was mocked. The browser timezone was UTC, entered Harare time2026-10-23T01:06, submitted payment_at2026-10-22T23:06:00.000Z and payment_date2026-10-23. Method manual_cash and reference TEST-ONLY-WITHDRAWAL-PAYOUT-001 were explicitly TEST ONLY synthetic evidence. The actual response was HTTP200, Recorded. There was no fresh backend validation failure on this request.

Independent read-only verification: exactly one unverified USD10 payout, zero withdrawal debits, no verified paid receipt, and history request/approve/process/record only. The recorded actor matched the authenticated existing processing employee. Confirmed/reserved/available remain USD10/USD10/USD0. The clock, all immutable request fields and accepted-terms fingerprints match the original checkpoints. Nothing was verified, no external transfer was initiated and no clock/deadline was changed.

Stopped at Recorded as requested. The user may refresh Withdrawals to replace the stale Processing/error display; no resubmission is needed. The rehearsal remains running. Normal application/data were not accessed or changed by this recording workflow. No push or merge. [Sanitised actual-request and server evidence](withdrawals/single-browser-recording.json) and the guarded one-shot helper record the result; its completed-state guard prevents accidental rerun.


## Consolidated rehearsal closure - 23 October 2026

Browser confirmations from the user: Paid with verified receipt and linked USD10 debit, followed by explicit logout. No completed financial checks were repeated manually.

Independent server evidence: exactly one USD10 payout, one linked USD-10 debit and one verify event; source credit USD10 remains intact. The debit references its payout/request and verify event, retaining member, enrolment and currency. Reservation is zero. Enrolment available/confirmed balances are USD0; the owned Member summary agrees. The October report contains USD10 savings credit and USD-10 withdrawal debit, net USD0, with no active reservation source. The verified receipt remains available. Immutable request fields and accepted terms match the original private fingerprints.

The displayed verification time is deliberately 01:06:00 on 23 October 2026 Harare, matching the unchanged TEST ONLY service clock and payout instant. Recording audit time is01:36:43.178370 and verification audit/ledger posting time is01:43:38.100139 Harare. These real database audit times remain chronological. The earlier domain verification time is explained by the documented frozen rehearsal clock, not a rewritten audit or an early notice breach. Normal uvicorn uses real time and does not install this test-clock entrypoint.

Policy summaries now use shared human-readable labels for mode, limits, supported manual methods, approval levels, separation, cancellation and failure handling. Missing or unsupported decisions remain explicit. Currency limits are formatted independently; no conversion, guessed limits or policy changes were added. The exact saved acknowledgement/version is retained in readable form. Raw JSON/machine enum displays were removed from member/office summaries, and Admin effective values/publication previews/history use the same wording. Manual payout methods are readable. Payout verification time and audit-recorded time are labelled separately.

Final affected tests: 28 frontend tests passed, 0 failed/skipped; 2 browser cases passed, 0 failed/skipped (desktop Admin and 390px Member, intercepted APIs without live financial mutations). TypeScript and production frontend build passed. An initial browser assertion matched both the receipt method and policy method; its locator was made specific and the rerun passed. No final functional failure remains. Backend financial code was unchanged for this closure, so the full backend suite was not repeated. Earlier full milestone results remain 503 passed / 4 SQLite concurrency skips,129 frontend passes,3 end-to-end browser passes; later timezone checks passed 22 affected backend,14 frontend and 3 browser cases. These are distinct runs, not additive totals or claims of a fresh full-suite run. The full unrelated historical browser suite and human screen-reader review remain unrun.

Logout verification:the latest user session was explicitly revoked and its logout audit matched. All 7 rehearsal sessions were rejected with 401 by the backend validator; 0 active sessions remain. Six are explicitly revoked; one older session expired without a revocation marker. That older historical row was preserved and is not claimed as explicitly revoked. Tokens/hashes were never printed or reconstructed. The earlier all-checkpoint-revoked assertion correctly flagged this distinction; the final check verifies current logout and every session rejection without altering old history.

Final evidence was saved privately outside Git with ACL access limited to the current Windows user and SYSTEM:

- Archive: `C:\Users\HP\isave-backups\withdrawal-rehearsal-final-20261022t235438\rehearsal.dump`
- Size: 207434 bytes; SHA256 `c28e5f71e9f9ba4764db73d04eec5babebe58b3f897545ddc86499b12c61d2e2`.
- The archive includes all accounts as stored, audit/history, original contribution credit, payout/debit links and session state; the separate scenario-clock file preserves timestamp interpretation. Private source and restored fingerprints are retained alongside it.
- An independent networkless PostgreSQL restore matched all table rows, schemas, financial triggers and sequences. No synthetic records were added to the normal database.

Stopped only isave-withdrawal-rehearsal frontend/backend/database (all exit 0) after the successful private restore. The temporary archive-restore server was also stopped; no volume or container was deleted. The frontend-only browser-test container was stopped after its tests. Normal frontend 3000, backend 8000, PostgreSQL 5432 and Mailpit 8025/1025 retained their container IDs, start times and health. Normal settings/data were unchanged. The rehearsal uses tmpfs; its retained history is in the verified private archive, not promised on a plain restart.

Remaining decisions:normal migration 0014 and backend/frontend activation are intentionally outstanding because the user kept normal services unchanged. The normal backup/independent restore gate previously passed; a fresh gate will precede any eventual activation. Normal withdrawal mode/limits/methods/approval/separation/cancellation/failure policy remains unset; operational permission grants and evidence procedures need approval. No real provider transfer, paid-history reversal/refund, currency conversion, interest, penalties or deductions are enabled. Protected untracked UI evidence folders were untouched. No push or merge. [Final checks and private-archive metadata](withdrawals/closure.json).

## Normal activation completed — 23 October 2026

Migration `0014_withdrawals` is deployed. A fresh private PostgreSQL backup was independently restored and migrated before normal activation. The backup is `C:\Users\HP\isave-backups\withdrawal-20261023t000747\pre-0014.dump` (177135 bytes; SHA256 `c6ec5919f72bd2ed42bbbcd50e3e929f6f9df8e96909e160c73080a69b2eba5e`). Private fingerprints confirmed original rows, schema and sequences were preserved, allowing only the documented migration revision and permission additions. The four new workflow tables remain empty. No synthetic accounts, policies, clock or financial records were introduced.

Only the required normal backend and frontend were rebuilt/recreated. The deployed readable policy, acknowledgement and audit summaries match the browser-tested production image. Withdrawal policy decisions remain unset, with seven mandatory blockers; normal services use the real clock. Existing payments, accepted terms and balances were preserved. Rollback images and the private backup remain available.

Validation: 508 backend tests passed, four SQLite concurrency variants skipped (PostgreSQL counterparts passed), zero failed; 140 frontend tests passed; five targeted production-image browser tests passed. TypeScript and production builds passed. Post-deployment homepage, anonymous protected routes/API denial, backend connection, schema, preservation and all four normal service health checks passed. Full unrelated browser regression and human screen-reader checks were not rerun. No further manual financial rehearsal was performed.

During final checks Docker restarted: normal app/database recovered while Mailpit and disposable containers stopped. The existing Mailpit container was started without recreation; frontend, backend, PostgreSQL and Mailpit are now healthy. Disposable rehearsal/regression/restore containers remain stopped with retained records/volumes. Evidence: `withdrawals/activation-normal-0014.json`, `withdrawals/activation-regression.json` and `withdrawals/activation-post-check.json`. Earlier checkpoints were preserved. No push or merge.
