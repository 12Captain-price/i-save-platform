# Persistent replacement content/support rehearsal — 25 October 2026

This is a **fresh synthetic replacement**, authorised after the earlier tmpfs
rehearsal stopped. It is not a restore and does not recover the original
rehearsal records. Earlier validation/checkpoint files remain unchanged in
`content-support/`; new evidence is isolated in
`content-support/replacement-20261025/`. No normal backup, credentials, grants,
members, settings or financial records were copied.

## Isolation and storage

Use the standalone `compose.content-replacement.yaml` alone, with project
`isave-content-replacement-20261025`. Do not combine it with normal Compose files
or the old tmpfs test configuration.

- Database: `isave_test_content_replacement_20261025`; no published PostgreSQL port.
- PostgreSQL volume: `isave-content-replacement-20261025-pg-7d9c2e1a`.
- Mailpit volume: `isave-content-replacement-20261025-mail-7d9c2e1a`.
- Dedicated network: `isave-content-replacement-20261025-private`.
- Login: **http://127.0.0.1:13070/login**.
- Separate test inbox: **http://127.0.0.1:18025**.
- Backend readiness: `http://127.0.0.1:18070/ready`.
- Test SMTP: localhost port 11025; internal SMTP uses only this project's Mailpit.

Preflight checked that the project/volumes were unused before creation, no normal
mounts or networks were shared, database URLs were literal replacement-only
values, no normal environment/credential files were imported and all published
ports bind to localhost. Tested existing local images were reused without
building or changing normal services. Only the obsolete rehearsal frontend and
Mailpit were stopped to release their ports; no old containers/volumes were
deleted. Normal Mailpit was already stopped and remains unchanged.

## Minimum fixtures and password setup

There are only two synthetic users: `accounts-admin@example.test` and
`accounts-member@example.test`, using the existing canonical Admin/Member
permissions. Fresh, unretained random password hashes were generated inside the
replacement backend; no normal passwords or reusable passwords were copied,
printed, stored in evidence or emailed. Users choose their own passwords through
the application's expiring, single-use recovery workflow.

One announcement has explicitly fixture-reviewed/published version 1, titled
**TEST ONLY replacement announcement**. Version 2 is an **unpublished** edit with
the same title. Fixture audit reasons explicitly identify synthetic setup; they
are not operator approvals or recovered history. One owned support ticket,
**TEST ONLY replacement support ticket**, has only its initial Member message,
ready for one manual office reply. No extra accounts, internal notes, media,
membership applications, payments, enrolments or ledger postings were added.

The standard public recovery endpoint queued one request for each account. The
dedicated worker completed both requests, both deliveries reached **Mailpit
accepted**, and two messages were captured in the separate inbox. Tokens and
full private links were never returned in ordinary API responses, logs, chat or
evidence. This is local capture, not external email delivery. If a link expires,
request recovery again on port 13070 and use only the newest matching message.

## Persistence validation

`scripts/verify-content-replacement-restart.cjs` stops/starts only this project.
It compares the PostgreSQL cluster identifier and hashes/counts of every table,
including draft/history, permission, password-hash and single-use-link records;
no row contents or credentials are saved. It also compares captured Mailpit
message IDs as an aggregate hash. Success requires the same container IDs,
dedicated mounts, migration, complete table fingerprints and captured messages
after restart. It then checks effective publication/draft exclusion, anonymous
denial, empty financial tables and unchanged normal container IDs/start times/
running states. Results are in `replacement-20261025/restart.json`; a missing or
failed checkpoint must not be called passed.

No full application regression suite is repeated for this environment-only
replacement. Earlier full-suite counts remain historical; they are not new
replacement-run results. Real scanner operations, legal/retention approval and
external delivery remain unavailable/unconfigured. No test clock is configured.

## Short manual sequence

1. In the test inbox, open the newest recovery message addressed to the
   synthetic Admin. Privately set a password, then sign in at the one login URL
   above. Do not share/capture the password or full link. Reply **replacement
   Admin ready**.
2. In Content management, inspect the same announcement's private version 2;
   compare the public Announcements page, which must still show version 1. No
   second announcement or extra publication is needed.
3. In Member support, open the existing synthetic ticket and send one clearly
   labelled office reply. Log out. Privately set the Member password through its
   matching inbox message and sign in with the same login URL. Confirm the reply
   on that owned ticket and log out. Record operator confirmations separately
   from automated evidence.
4. After logout/revocation and final database checks, stop only this project's
   containers. Keep both volumes. Do not use `down -v`, delete volumes, rerun the
   one-shot seed or change normal services.

To resume this replacement later without recreation:

```powershell
docker compose -p isave-content-replacement-20261025 -f compose.content-replacement.yaml start
```

To stop it at completion while keeping records:

```powershell
docker compose -p isave-content-replacement-20261025 -f compose.content-replacement.yaml stop
```

The one-shot preparation script refuses existing fixture records. It must not
be rerun as a password-reset or repair mechanism.

## Operator and server checkpoint — 25 October 2026

Operator browser confirmations: private Admin password setup/login completed;
the protected preview showed the unpublished edit while the public page showed
the original published text; the office reply was saved; and the signed-in
Member opened the owned ticket and confirmed that reply was visible. These are
operator observations, separate from the database checks below.

Fresh server-side inspection of only the replacement database confirmed the
same two users, published version 1 and private version 2. Content-version,
publication-history and permission/override fingerprints still match the
post-restart checkpoint. The ticket remains Open with one initial Member
message, exactly one Admin office reply (with its attributed reply event/audit),
and one additional Member follow-up. The latter is a distinct actor/request,
not a duplicated office reply. All three messages and their history are
preserved. The Member's protected view excludes the Admin email identity; the
office reply generated exactly one owned notification. No financial rows or
postings were created.

Four recovery-link records exist: two consumed successfully and two superseded,
revoked unused links. Neither password hashes nor link/session identifiers were
printed or committed. Admin logout is verified. One live Member session was
checkpointed in a user/SYSTEM-only private directory for the final logout check.
The initial diagnostic assumed the original message/link counts; inspection
identified the additional legitimate Member follow-up and replacement-link
history, and the verifier was corrected without modifying application records.
Sanitised results are in
`content-support/replacement-20261025/manual-before-logout.json`.

**Pending at that checkpoint (completed below):** operator Member logout, checkpointed-session revocation check,
private final preservation and stopping only the replacement containers while
retaining both persistent volumes. The rehearsal remains running for that
logout; completed content/support checks need not be repeated.

## Final closure — 25 October 2026

The operator confirmed Member logout. A fresh read-only check found that the
exact privately checkpointed Member session had a revocation timestamp; the
same server session-validation function used by authenticated requests rejected
it with status 401. All checkpointed Admin/Member sessions were revoked and no
live rehearsal sessions remained. No raw token was available or reconstructed
for an HTTP replay; this evidence is database/session-validator verification,
not a newly claimed browser replay test.

Final checks retained the same announcement/version/publication and permission
fingerprints, one Admin office reply with its audit, and the additional Member
follow-up. All three conversation messages remain. The ticket stays Open;
version 1 remains the effective public announcement and version 2 stays private.
No financial records or postings exist in the replacement. No completed manual
content, payment or notification checks were repeated.

After application writers and replacement Mailpit were stopped, a private
custom-format PostgreSQL dump was saved byte-for-byte to a new user/SYSTEM-only
directory under `C:\Users\HP\isave-backups\content-replacement-final-*`.
The complete archive decoded successfully with `pg_restore --file=/dev/null`,
without connecting to or writing a database. The stopped Mailpit data directory
was archived there privately as well; it may contain private setup messages and
must not be published or committed. Backup paths, sizes and SHA-256 checksums
are recorded in the sanitised `replacement-20261025/closure.json`. A separate
restore of this final archive was **not run**; the earlier controlled-restart
persistence test remains the successful storage check, not a substitute claim
of a final restore test.

All five `isave-content-replacement-20261025` containers are now stopped and
retained. Both uniquely named PostgreSQL and Mailpit volumes are retained; no
container, database or volume was deleted/recreated. Normal application,
database and account worker remain running with the same container identities
and start times. Normal Mailpit remains stopped as it was before this task; it
was neither started nor stopped by closure. Normal data was not accessed or
modified. Nothing was pushed or merged.

All replacement setup, persistence, manual and final closure checks passed.
Earlier regression counts were not rerun or relabelled as new replacement
tests. Real antivirus/scanner validation, approved retention/legal policies and
external email delivery remain outside these completed checks and unchanged.
