# Staff administration, recovery and essential notifications

This milestone reuses the existing `users:read`, `users:write` and `roles:write`
security permissions. It introduces no new permission grants or financial rules.
The current normal activation and validation results are recorded below.

## Working behaviour

- Admin Staff and Roles & permissions screens provide paginated email search,
  invited/active/suspended status, supported Staff/Finance invitations, individual
  allow/deny/default controls and effective access after role restrictions.
  Security writes require an active security administrator holding both existing
  security write permissions. The actor cannot edit their own access, override
  administrator access, grant a capability they do not hold or restore such a
  capability by deleting a denial. Existing role templates/grants are retained.
- Administrator-set changes serialize on the existing administrator role row;
  last-active-administrator protections still apply concurrently. Suspension and
  permission changes revoke affected sessions; each subsequent request also reads
  current permissions. No accounts or historical attribution are deleted.
- Staff set their own passwords from one-hour, single-use private links. Only
  SHA256 hashes are stored. Duplicate request keys return the existing outcome;
  replacements retain history and revoke earlier links. Existing accounts are not
  silently recreated or granted another role. Administrator provisioning remains
  the controlled existing administrative workflow, not a public invitation option.
- Public recovery acknowledges all valid email requests identically, including
  missing and suspended accounts. Persistent per-IP and per-address limits use
  the existing ten-attempt/fifteen-minute throttle. An address hash and request key
  are queued before lookup; SMTP latency therefore does not disclose existence.
  A separate worker processes requests. Reset locks the account and token, checks
  expiry/revocation/activity, validates the password and revokes every session and
  outstanding setup link. It does not sign in, reactivate, relink membership,
  change permissions or touch financial records. Public recovery issuance has
  an unauthenticated audit actor; staff changes use the authenticated session.
- Recipient-owned in-app notifications have unread counts and read/unread
  controls. Links are generated against current permissions and land on supported
  owned-record screens, whose APIs still enforce ownership. Event+recipient keys
  prevent duplicates. Notices are inserted in the same transaction as completed
  membership/plan application, savings and withdrawal events. Failed/rolled-back
  transactions cannot leave a notice claiming completion. Pending/verified-only
  savings never trigger a confirmed notice; approvals are not payouts.
- The outbox is the persistent notification record, independent of email delivery.
  Protected delivery views can request generic local email capture or retry a
  previously unavailable adapter or a proven connection failure before SMTP
  submission. They never replay business/financial actions.
  Sending is claimed before SMTP; accepted, sending and uncertain attempts are
  not resent automatically. An uncertain SMTP result cannot establish whether
  an inbox received a message. Token-delivery failure requires an explicit new
  invitation/recovery request; superseded tokens are revoked. Raw exceptions,
  tokens, private URLs and private documents are never in ordinary responses.
- Emails use effective published office contacts. Provider credentials remain
  infrastructure configuration. The existing adapter accepts only development
  Mailpit and localhost frontend origins; production/external sending is disabled.
  Mailpit SMTP acceptance is labelled capture, not external/inbox delivery.

## Worker and local operation

The normal opt-in `compose.mailpit.yaml` adds an `account-worker` process using
the same database and approved local adapter settings as its backend. It has no
published ports. A repeatable batch is `python -m app.account_worker --once`;
continuous processing uses `python -m app.account_worker`. Recovery emails need
this worker; an acknowledgement alone never promises delivery. A claimed job
interrupted by failure is not replayed blindly: request a replacement link.

Migration `0015_account_workflows` adds `account_links`, `recovery_requests` and
`notifications`. It changes no existing rows, roles, grants, terms or balances.
Downgrade refuses retained account/notification or earlier workflow history before
any SQLite DDL. Normal activation requires a private backup, independent restore,
restored migration and exact original row/schema/sequence/grant comparisons.

## Isolated manual rehearsal

Use only `isave-accounts-rehearsal`, frontend `http://127.0.0.1:13060` and its
separate Mailpit `http://127.0.0.1:18025`. It uses disposable PostgreSQL storage,
never the normal volume. Three synthetic accounts cover the distinct roles:
`accounts-admin@example.test`, `accounts-member@example.test` and the staff
invitation recipient `accounts-staff@example.test`. Automated test passwords are
never printed; no extra account is needed for manual review.

1. Open Recovery on port 13060 and request a link for the synthetic Admin. Read
   only the new matching Mailpit message, open its private link and set your own
   password. Do not share/capture that link or password. Log in normally.
2. Open Staff, inspect the recorded invitation history and effective access.
   Change one supported operational override for the existing synthetic Staff
   account and inspect the resulting access. No real staff are invited.
3. Open Notification delivery to inspect local capture states. Use the existing
   synthetic Member's recovery page privately if you want to inspect its saved
   notification/read controls. Finish signed out. Completed automated financial
   tests do not need manual repetition.

## Manual permission checkpoint — 23 October 2026

Operator confirmed private rehearsal Admin recovery/login and saving
`members:read` as Deny. Server-side inspection of only
`isave-accounts-rehearsal / isave_test_browser` confirmed the Staff account is
active, with exactly that one false override. Role grants remain
`applications:read`, `members:read`, `plans:read`; effective access is now only
`applications:read`, `plans:read`. Audit event 46 records the denial at
17:42:22 UTC (19:42:22 Harare), attributed to the authenticated rehearsal Admin.

There were zero pre-existing Staff sessions, so this manual action cannot prove
revocation of a previously live session. The automated revocation tests remain
the evidence for that case. A separate two-minute, in-memory-token HTTP probe
authenticated successfully (200), received 403 from both member listing and
search, logged out (204), and was rejected on replay (401). Its session was
left revoked. No passwords or tokens were printed, and every permission override
matched before/after verification. Normal accounts/database were not accessed.
Sanitized evidence: `staff-administration/manual-permission-check.json`.

Operator then confirmed marking one notification Read, reducing unread from six
to five. A fresh database session confirmed six Admin-owned records: five
unread and notification 14 read. The running API returned that persisted count;
the Member list excluded all Admin notification IDs. A Member attempt to mark
notification 14 returned 404, and anonymous listing returned 401. The foreign
probe supplied the already saved Read value; all notification states, delivery
attempts and permission grants matched before/after. Temporary probe sessions
were revoked; the operator's existing session was preserved. Evidence:
`staff-administration/manual-notification-check.json`.

The remaining local capture/logout checks were subsequently completed in the
closure section below. No financial checks, permission edits or completed
read-state checks were repeated.

## Limitations

External production delivery, promotional messages, WhatsApp/SMS and overdue
reminders are unavailable. SMTP exactly-once inbox delivery is not promised;
uncertain sends require operator review/replacement. Recovery-request/session/
notification retention periods remain unset; automatic deletion is not introduced.
The hash-only recovery queue currently matches existing normalized addresses in
worker batches and requires capacity monitoring before large-scale deployment.
Applicants without login accounts have no in-app recipient; this milestone does
not create accounts or claim pre-activation email delivery. Document review and
further-information history remain protected; account-linked updates receive
generic notices without document contents. Notification email capture is an
explicit authorised action, not a promotional or automatic financial reminder.

## Validation and activation

Normal revision `0015_account_workflows` was activated on 23 October 2026 after
private backup and an independent network-isolated PostgreSQL restore/migration.
The backup is `C:\Users\HP\isave-backups\accounts-20261023t171305\pre-0015.dump`
(201070 bytes; SHA256
`692f9b671d16b3510e073fedcf99f3867e8f7fcffe7dd455cd6e086cb2ad8b6b`).
All original rows, table structure, sequences and permission grants matched.
Only three empty workflow tables were added. No real account, password, grant,
membership, financial record or accepted terms were changed. Rollback images and
the independent recovery volume are retained; the recovery container is stopped.

The required normal backend/frontend were rebuilt, and the local account worker
was added. PostgreSQL and Mailpit retained their container IDs and start times.
Normal withdrawal processing remains blocked by its seven unset operational
decisions. Normal code uses the real clock; no synthetic accounts/policies or
rehearsal clock were copied. Production/external email remains unavailable.

Validation results (not cumulative totals):

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full backend regression, isolated PostgreSQL | 541 | 0 | 7 |
| Final affected auth/account/security suite after bounded-role, link-revocation and SMTP retry hardening | 173 | 0 | 3 |
| Frontend, 19 files | 146 | 0 | 0 |
| Account lifecycle and desktop/mobile notification browser checks | 3 | 0 | 0 |
| Preserved withdrawal policy/timezone browser checks | 5 | 0 | 0 |

The seven full-suite skips are SQLite concurrency variants; PostgreSQL
counterparts passed. The three security-suite skips are the SQLite account
concurrency variants. Direct Docker/pytest commands preserved exit status 0;
the retained JUnit files distinguish errors, failures and skips. The full run
preceded the final bounded-role, outstanding-link and SMTP retry hardening; all affected
authentication, account workflow and account concurrency tests then passed on
the hardened source. TypeScript, production builds and `git diff --check` passed.
The pre-existing Starlette/httpx deprecation warning remains.

An earlier full run found a SQLite downgrade-preflight defect and an incorrectly
Mailpit-enabled regression environment; both were corrected. A subsequent
notification test incorrectly counted legitimate plan notifications as savings
confirmations; its assertion now filters the actual savings-event identities.
Browser diagnostics also corrected a loading-state assertion, selection of stale
captured messages, a hash-only recovery navigation bug and the test's locale
separator match. The rate limit was allowed to expire naturally, not cleared.
The final targeted runs have no remaining failures.

Read-only post-deployment evidence is in `staff-administration/post-deploy.json`;
backup/migration evidence is in `staff-administration/activation.json`, and test
scope/counts are in `staff-administration/validation.json` and `full-backend.json`.
The isolated browser flow exercised local capture, private setup, recovery,
login, notification ownership/read controls, denied Admin access and logout.
No private screenshots, traces, passwords or links were saved as evidence.

The isolated manual rehearsal is now complete and stopped after private
preservation. Operator browser confirmations and server-side evidence are
distinguished in the manual checkpoints and closure section below. Full
unrelated browser regression, human screen-reader review and external delivery
checks were not run. No further manual financial tests were performed.
Nothing was pushed or merged.

Final deployed checks passed again after the SMTP retry build: normal homepage
and recovery form, anonymous Staff portal/API denial, notification ownership
boundary, exact post-migration fingerprints and disabled withdrawal policies.
Frontend, backend, PostgreSQL and normal Mailpit are healthy; the account worker
is running. Normal PostgreSQL/Mailpit were not restarted for this milestone.

Evidence preservation exception: a supplemental homepage test regenerated eight
existing public screenshots under `docs/savings-contributions/browser` before
that run was stopped. Those files cannot be claimed as unchanged historical
evidence. No private screen, password or invitation URL was captured. The named
`docs/homepage-redesign/`, `docs/ui-activation/` and `docs/ui-review/` directories
were not changed; no evidence was staged or deleted.

## Final rehearsal closure — 23 October 2026

Operator browser confirmation: notification 14 displayed **Mailpit accepted**
with one attempt, and the operator logged out. No password, token or private
link was supplied in chat or captured in screenshots.

Independent server evidence:

- Notification 14 remains Read and belongs to the rehearsal Admin; its delivery
  state is Mailpit accepted with exactly one attempt. Audit event 51 records the
  authenticated Admin's delivery attempt. Exactly one captured RFC822 message
  matches this notification's correlation ID. No additional send/retry was
  performed. This proves one local capture, not external inbox delivery.
- Logout audit event 52 is recorded at 20:13:00 UTC (22:13:00 Harare), with
  exactly one Admin session carrying its matching revocation timestamp. Zero
  live sessions remain across all rehearsal accounts; the session validator
  rejects all 12 retained session rows. One older expired session has no explicit
  revocation timestamp and is already rejected by expiry; it was preserved,
  not silently changed or counted as explicitly revoked. The operator's raw
  token is unavailable by design, so no claim of replaying that private token is
  made; earlier isolated HTTP probes established logout/replay behaviour.
- Staff remains Active with only `members:read=False` as its override, with
  effective `applications:read` and `plans:read` preserved. Admin notifications
  remain six total, five unread and one read. No pending/claimed recovery job
  remains. All inspected fee, subscription, contribution, savings-ledger and
  withdrawal tables contain zero rows: no financial rehearsal was repeated.

Disposable writers were quiesced before archiving. The private directory is
`C:\Users\HP\isave-backups\accounts-rehearsal-final-20261023t201653`, restricted
to the current Windows user and SYSTEM. It contains:

- `rehearsal.dump`, 213861 bytes; SHA256
  `29c799642d35c6e291ec9280825643e8cee10f662834154c9b17f3a93ee77e0f`.
- All 18 Mailpit messages as private raw email files, an inbox metadata index
  and checksum manifest. These may contain private historical links and must
  not be published or committed.
- Database fingerprints, exact isolated Compose files, image identities and
  the final closure report.

The saved Windows dump was restored with exit-on-error into a separate,
network-isolated PostgreSQL server. Every original row, schema/trigger,
sequence and grant fingerprint matched; the restored migration structure
check passed. The source rehearsal matched again after preservation. The
independent recovery container is stopped with its dedicated volume retained.
Mailpit email files were archived and checksummed; no email re-delivery/import
was performed or claimed as restore-tested.

Only the five `isave-accounts-rehearsal` containers were stopped. No container,
volume, image, account or retained history was deleted. The normal frontend,
backend, PostgreSQL and Mailpit remain healthy; the normal account worker is
running. Their container IDs, start times, running state and health matched
before/after closure. The normal database/accounts were not accessed or changed
during this closure. No tests already completed were rerun, and no push or merge
was performed. Sanitized evidence: `staff-administration/rehearsal-closure.json`.

No remaining failures were found in these final checks. The earlier documented
limitations, unrun checks and screenshot preservation exception remain explicit.
