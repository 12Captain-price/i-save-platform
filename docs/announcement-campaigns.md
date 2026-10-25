# Optional announcement/event email campaigns

This milestone adds consent-aware campaigns alongside the existing content and
essential account/security workflows. It preserves the redesigned interface,
financial records, accepted terms and previous evidence folders. Campaigns are
not created or sent when content is published. No consent is imported or seeded
for existing users. No production/external sending adapter is enabled.

## Preparation, approval and execution

Admin and specifically authorised Staff use **Email campaigns**. Separate
capabilities are `campaigns:read`, `campaigns:prepare`, `campaigns:approve`,
`campaigns:send` and `campaigns:recipients`. Mutations also require read access;
Member/Finance overrides cannot grant office campaign access. Only a Member
with `marketing:own` can change their own optional-email preference. New
migration grants are additive to canonical Admin/Member roles; existing grants
and denials are preserved. Permissions use the existing Staff administration
system, not a parallel role store. Separate capabilities are required; a
requirement for different human preparer/approver/sender has not been invented.

Saving appends an immutable campaign version linked to a currently effective
published announcement or event. Organisation/FAQ/team/draft/future/unavailable
versions cannot be chosen. Incomplete subject/message drafts are allowed but
cannot be approved. Plain text is escaped, HTML/private-token URL schemes are
rejected and subjects cannot contain line breaks. Approve, queue and cancel are
separate attributed immutable events with reasons and idempotency keys. A new
draft invalidates approval. Stale base versions/actions conflict.

The saved preview shows subject, message, exact linked version/public URL,
audience criteria/count, delivery availability and schedule in **Africa/Harare**.
The supported audience is active Member accounts with explicit optional-email
consent. It does not assert financial membership eligibility or import contact
lists. A count/address/consent-revision/version digest must still match at queue
confirmation. An unticked acknowledgement is required. Queueing captures the
current audience once; later opt-ins are not added to that snapshot. Zero
eligible recipients and ambiguous addresses block queueing. The local test
limit is 1000 recipients per campaign.

Audience freshness uses a server-keyed HMAC, not an exposed unkeyed hash of
recipient addresses. Final privacy review added this count-reader safeguard;
it uses the existing infrastructure secret, which must be strongly configured
before production approval. It does not disclose recipient identities or alter
historical queue snapshots.

An aware future time schedules the campaign; blank makes it eligible after
explicit queue confirmation. A past time requires a new saved/approved version.
Cancellation is supported before dispatch starts, including future schedules;
it preserves recipient/event history. It cannot recall already attempted email.
New navigation does not enable delivery in the normal environment.

Email links open `/updates/{content-item-id}/{published-version}`, an exact
public version page. Only that currently effective published version is served;
an archived/replaced version shows unavailable instead of silently redirecting
to different text. Private drafts never appear there or in email. Before every
submission, the worker checks that the linked version is still public; unsent
messages are suppressed with a reason when it is not.

## Optional consent and unsubscribe

**Member → Email preferences** defaults to not opted in, with an unticked
checkbox and explicit Save. Version `campaign-consent-v1` records the displayed
wording, enabled/withdrawn state, source, authenticated actor and timestamp.
Changes are immutable consent events with optimistic revision/idempotency
checks. Membership, account activation and an email address never imply consent.
The wording is an explicit engineering baseline for this local workflow, not
legal/production approval; approved marketing/privacy/retention operations are
still required before production readiness.

Each individual campaign email includes an opaque 256-bit unsubscribe token in
a URL fragment. Only its hash is stored; it is scoped to the recipient and
expires after 30 days. The hash is committed with the attempt before SMTP so
the link remains valid even if the result commit is lost. Opening/GET/prefetching
the page changes nothing. The fragment is removed from the address bar, no
public account/email details are shown, and an unticked explicit confirmation
is required for a same-origin POST. Invalid, expired, consumed and valid links
receive generic acknowledgements. IP throttling applies. Public confirmations
record source `email_unsubscribe`, exact displayed checkbox wording and distinct
version `campaign-unsubscribe-v1`; there is no fake authenticated actor. Final
review separated this version from the opt-in wording version. Existing isolated
automation history is retained as originally written, not rewritten; future
confirmations use the corrected exact wording/version.

Consumption is single-use and safe under concurrent requests. A consumed old
link does not override a later fresh opt-in. If unavailable/expired, the person
can use signed-in preferences or approved office contacts. No automatic
one-click provider/header action is enabled. The expiry/single-use semantics
need legal/deliverability review before production use.

Preferences, activity, address identity and suppression are rechecked after
queueing, immediately before submission. User/content locks are held through
the SMTP critical section: a committed withdrawal/archive preceding submission
suppresses it. An action arriving after SMTP has begun cannot recall that
submission; it applies to future messages. Essential notifications, invitations,
password recovery, security emails, sessions, roles and finances are not disabled
or changed by optional marketing preferences.

## Recipient outbox, evidence and retries

The existing account worker and Mailpit transport are reused, with a separate
optional-recipient outbox so campaign suppression cannot affect essential jobs.
One unique campaign/user row prevents duplicate queueing. PostgreSQL transaction
locks and `SKIP LOCKED` claims protect independent workers. A committed Attempted
claim precedes SMTP. A crash leaves an unconfirmed Attempted state; it is not
automatically picked up again. Local rate limiting is shared across workers
(default 10 attempts/minute, infrastructure-configurable within 1–60).

| State | Meaning / supported action |
| --- | --- |
| Queued | Approved snapshot awaiting its scheduled time and eligibility recheck |
| Attempted | Claimed; outcome may be unknown after a crash. Blind retry is blocked |
| Mailpit accepted | Local SMTP capture accepted; neither external nor inbox delivery |
| Failed before submission | Proven connection failure before any SMTP submission; an authorised explicit retry is available |
| Uncertain | Submission outcome unknown; automatic/blind retries are blocked |
| Suppressed | Consent/activity/address/content check failed; reason retained |
| Cancelled | Cancelled before dispatch; history retained |

Provider accepted/delivered states are not produced: no approved provider or
trustworthy delivery callbacks exist. A stable message identifier is correlation,
not exactly-once inbox delivery evidence. Successful messages are never resent
by retrying queue/worker requests. Retry requires send plus recipient access,
an explicit acknowledgement/reason and a fresh idempotent action; eligibility
is checked again. Delivery events remain append-only.

Emails are individual, never shared To/Cc/Bcc lists. Message/footer links use the
configured local frontend origin and effective approved public contacts. No
private documents or account details are included automatically. Recipient
addresses are available only through the separately permissioned details view;
each access is audited, paginated and uncached. No recipient CSV export is
implemented; no unaudited export endpoint or pretending export button exists.
Ordinary campaign list/preview responses contain counts, not recipients/tokens.
Provider credentials stay outside business settings and logs/evidence.

## Configuration and production blockers

`CAMPAIGN_DELIVERY_ENABLED` defaults **false** and normal Compose does not opt
into it. Preparation/approval can be available normally, but queueing returns an
explicit unavailable result. The isolated campaign Compose file alone enables
it. The only transport remains guarded development Mailpit, a local SMTP host,
test sender and localhost frontend. `APP_ENV=production` refuses this adapter
even if flags/SMTP values are supplied. No external messages are sent by tests.

Production remains blocked pending an approved provider, verified sender and
domain authentication, an approved public HTTPS origin, authenticated bounce/
complaint callbacks and suppression operations, approved consent/privacy/
retention policies, unsubscribe/legal review, deliverability/load/monitoring
checks and an operational approval matrix. Bounce/complaint callbacks are not
implemented; no unauthenticated webhook exists. No retention/deletion period,
marketing import, recurring promotional schedule or staff opt-in-on-behalf rule
is invented. SMS, WhatsApp, promotional cross-channel campaigns and overdue
reminders are outside scope.

## Validation and isolated manual rehearsal

Current sanitised results belong only to `announcement-campaigns/`. Earlier
content/replacement/account evidence is untouched. Full regression, deployment
and preservation gates are recorded there separately; a pending/missing result
must not be called passed.

The standalone project is `isave-campaigns-rehearsal-20261025`, database
`isave_test_campaigns_rehearsal`, frontend **http://127.0.0.1:13080/login** and
separate test Mailpit **http://127.0.0.1:18025**. Regression uses a different
`isave_test_campaigns_regression` database and generated disposable databases on
that isolated PostgreSQL server. There are no shared normal database volumes or
networks. Named volumes are
`isave-campaigns-rehearsal-20261025-pg-8b4a1f3c` and
`isave-campaigns-rehearsal-20261025-mail-8b4a1f3c`; neither uses tmpfs. Do not
combine `compose.campaigns-test.yaml` with normal or older rehearsal Compose.

Two established synthetic email identities are reused: `accounts-admin@example.test`
and `accounts-member@example.test`. No normal credential was copied. Automation
uses short-lived private fixture sessions (not a newly claimed password-login
test), checks the Member's unticked consent UI, explicit opt-in, zero→one preview,
approval/queue, a single Mailpit capture and exact public link, scanner-safe
unsubscribe, scheduled suppression after withdrawal and essential recovery
capture after withdrawal. A real schedule is awaited; no test clock is used.
Automated sessions are logged out. Private recovery messages for the operator
remain only in test Mailpit.

One draft **TEST ONLY manual campaign** (ID in `browser.json`) is prepared but
unapproved/unqueued. To avoid repeating completed transactions, use only that
draft and these two accounts for the short operator check:

1. Privately set the Member password from its newest test Mailpit recovery
   message. Open Email preferences, confirm Not opted in, then explicitly opt in.
   Log out. No passwords or private links belong in chat/screenshots.
2. Privately set/sign in as the synthetic Admin, open the existing manual draft,
   load preview (one eligible Member), approve it, reload the saved preview and
   explicitly confirm queueing once. Local capture must not be called delivered.
3. Open only its matching campaign capture in test Mailpit. Follow the exact
   public link; then open its private unsubscribe link and explicitly confirm.
   Opening alone must not change consent. Confirm signed-in Member preference
   is withdrawn and current future-audience preview is zero. Do not send another
   campaign to test suppression: automated queued-suppression evidence already
   covers it. Finish logged out.

Operator confirmations, server evidence and unresolved/unrun production checks
will be recorded distinctly. At authorised closure, stop only this project with
`docker compose -p isave-campaigns-rehearsal-20261025 -f compose.campaigns-test.yaml stop`;
retain both volumes. Never delete volumes or reseed existing rehearsal accounts.

## Validation checkpoints and limits

The initial full backend run had **624 passed, 4 failed, 9 skipped**, exit 1.
The failures were retained-history multi-revision downgrade checks: SQLite could
lose new empty tables before an older revision refused the downgrade. Revision
0017 now preflights retained older records, settings and delegated permissions
before any DDL. All **8 affected SQLite/PostgreSQL lifecycle cases passed**;
the subsequent full run is recorded separately in `backend.json`. A dedicated
test additionally covers the older delegated-grant refusal without structural
loss. Do not confuse those resolved initial failures with the final gate.

Frontend full run: **157 passed, 0 failed**. After public-page landmark/heading
review, the **11 affected campaign/shared-content tests passed**. TypeScript,
host production build and Docker production build passed. An initial JSX
syntax/type diagnostic in the new form/tests was corrected before these gates.

Real Chrome automation passed **17 workflow checkpoints** and **3 additional
Admin/public mobile and keyboard checkpoints**, with no screenshots, traces or
private URLs in evidence. One actual local capture, an exact content link,
explicit unsubscribe, real-time scheduled suppression and independent security
capture were verified. No normal accounts or emails were used. These are
automated checks, not operator confirmations. The default consent state and
manual campaign remain ready for the short UAT described above.

Production/external delivery, authenticated callbacks, real provider bounce/
complaint handling, deliverability/load testing, formal screen-reader review,
legal/privacy/retention approval and unrelated financial browser suites were
not run for this milestone. Existing financial/backend suites are part of the
full regression; financial manual transactions are not repeated.

The corrected full backend run passed **630 tests, 0 failed, 9 skipped**, exit
**0**. All nine skips are SQLite variants of PostgreSQL row-lock/concurrency
tests; their PostgreSQL variants ran. Final campaign/consent/concurrency tests
after exact unsubscribe wording and keyed-preview review passed **35 tests,
0 failed, 1 SQLite skip**. Those local guards and their added privacy assertion
were checked with the affected suites after the complete run; the full count
is not presented as a second full rerun after them. Original exit statuses are
retained in the JSON results, and raw recipient/token-bearing diagnostics are
not printed or committed. The immutable earlier synthetic consent event was
not rewritten when the wording version was corrected.

Persistent restart checks passed: the same cluster/container/volume identities,
every table fingerprint and all three original captured messages survived a
controlled stop/start. The public source remained version 1 while its later
private edit stayed hidden. No financial fixtures/postings were created.

## Normal activation — 25 October 2026

Migration **0017_campaigns** was activated only after passing regression/browser/
persistence gates, a fresh private backup, independent restore and original-row
preservation checks. All normal application writers were stopped for the
preservation window; normal PostgreSQL and Mailpit identities/start states did
not change. The private pre-migration dump is
`C:\Users\HP\isave-backups\campaigns-20261025t153235\pre-0017.dump`
(237852 bytes, SHA-256
`e748f0a373bc011e06e529dca11da0477275b09df93b355caac5f7c007cdd47f`).
It was independently restored into a separate PostgreSQL container with no
network/host ports, upgraded there and structurally checked before upgrading
normal PostgreSQL. The private restored volume and rollback images are retained;
the restore container is stopped. No volume was deleted and no history stamped.

All original rows/schema, grants, denials and business sequences matched.
Only new canonical campaign/own-preference catalogue grants and their catalogue
sequence changed; all eight new tables were empty. No real consent was imported,
no normal campaign created and no real recipient queued. Normal campaign
delivery remains explicitly disabled; withdrawal policy blockers and the real
clock remain unchanged. Required normal application services were rebuilt with
their existing database connection. The final keyed-preview guard required only
a subsequent backend rebuild, with no additional migration/data changes.

Post-deployment checks are recorded in `post-deploy.json`. Normal Mailpit was
already stopped and is left in that state; the application/database/worker remain
running. No real authenticated campaign, opt-in, queue or send action is tested
against normal data. The isolated campaign stack remains available for the
operator rehearsal; its accounts and configuration have not been copied to
normal services. Nothing is pushed or merged.

### Manual rehearsal checkpoint — 25 October 2026

Operator browser confirmations: campaign 3 preview showed one eligible Member;
approval and explicit queueing completed; the UI showed one Mailpit acceptance.
The operator received the generic unsubscribe acknowledgement and subsequently
viewed zero eligible recipients while the historical acceptance remained.
Opening the exact public announcement was not explicitly confirmed manually;
that link was verified by automated browser tests instead.

Read-only server checks after the reported Admin logout confirmed the live Admin
session is revoked. Campaign 3 retains one approval, one queue event, one
recipient with one Mailpit-accepted attempt, and one consumed unsubscribe link.
The Member preference is false, with two historical opt-in and two withdrawal
events preserved. A separate live Member session remains unrevoked, so final
closure/preservation and stopping the rehearsal are pending that Member logout.
No financial records were created. Normal services have not been changed by
these checks. No sessions were forcibly revoked to manufacture a logout pass.

### Final closure — authorised administrative cleanup

After the checkpoint above, the operator explicitly authorised revocation of
only the remaining disposable Member session. Exactly one live Member session
was revoked, with a `rehearsal_administrative_session_revocation` security audit
event. The event identifies operator-authorised cleanup without inventing an
authenticated application actor. This is administrative revocation, **not a
successful manual Member logout test**. Admin manual logout was verified
separately. All retained sessions now have revocation timestamps and backend
session validation rejects them with HTTP 401; no raw-token replay is claimed.

Final server evidence confirms campaign 3 has one approval, one queue action,
one recipient and one Mailpit-accepted attempt. Test Mailpit contains exactly
one matching locally prefixed message. Its unsubscribe link was consumed and
the Member remains opted out. Campaign 2's earlier queued suppression and all
consent/history records remain preserved. Financial fixture tables remain empty.

The closure script initially paused safely at the live Member session and later
at an overly strict subject comparison that omitted Mailpit's local-test prefix.
The comparison was corrected and closure reran successfully; neither pause
repeated delivery or changed financial state.

Final PostgreSQL and stopped Mailpit archives were saved outside the repository
under user/SYSTEM-only ACLs. The PostgreSQL archive decoded successfully; no
additional independent restore of this final disposable archive was run. The
earlier normal-migration independent restore and rehearsal persistence checks
remain separately recorded. `closure.json` records private archive paths,
checksums and final evidence without credentials, tokens or message contents.

Only `isave-campaigns-rehearsal-20261025` was stopped. Its containers and both
uniquely named PostgreSQL/Mailpit volumes are retained. Normal service identities,
start times and running states matched before and after cleanup: application,
database and worker remain running; normal Mailpit remains in its pre-existing
stopped state. Normal campaign sending remains disabled. Nothing was pushed or
merged. Manual public-announcement opening remains unconfirmed; its exact link
passed automated browser checks. Production/provider, legal/retention and
accessibility limitations listed above remain unchanged.
