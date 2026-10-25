# Private documents, retention and recovery operations

This milestone adds a real private ClamAV service, scoped versioned retention
controls and encrypted local PostgreSQL/document backups with independent
restore checks. It preserves the current interface, evidence replacement and
review history, financial workflows, accounts and permission overrides.

## Storage and scanner

Private evidence is already stored in `application_evidence.content` inside
PostgreSQL, not in public assets or a separate filesystem. There is no missing
document directory to copy: a consistent PostgreSQL snapshot includes the bytes,
their hashes, consent, application links and reviews together. Public content
images are also database-backed and included in the database backup.

`compose.operations.yaml` adds the official ClamAV 1.4 feature-release image,
pinned to the tested digest. It has its own signature volume and a private Docker
network with the backend. Port 3310 is never published. Freshclam needs outbound
access to its signed-definition distribution; there is no inbound/public scanner
endpoint. Allow roughly 3–4 GiB for scanner update/reload headroom; assess actual
host capacity before production deployment.

Every original upload is scanned before image parsing or storage. VERSION must
contain a valid database version/date no older than 48 hours (infrastructure
configuration permits 1–168 hours); future or absent dates are refused. INSTREAM
uses bounded frames, bounded replies and a total deadline. Only `stream: OK`
passes. Detection is rejected; timeout, protocol error, stale/unavailable
signatures and connection failure return a safe unavailable response. None saves
unscanned bytes. Applicants retain entered details and can retry; public errors
never include paths, scanned content or engine error bodies.

Scanner availability is probed for the intake and authorised operations screens.
An OS/container healthcheck alone is not evidence of current loaded signatures.
During initial validation Freshclam updated its signed files before clamd's
socket existed, so clamd initially loaded the image's stale definitions. The API
correctly refused the clean fixture. A clamd reload after the signed update made
the engine current; freshness validation was not relaxed. On such an initial
startup, wait for clamd's normal self-check/reload or request a private `RELOAD`
after confirming Freshclam validation. Never alter signature timestamps or
enable the synthetic adapter as a workaround.

Synthetic scanning remains limited to `APP_ENV=test`, an `isave_test_*` database
and the explicit test flag. Normal Compose forcibly disables that flag. The
rehearsal uses real ClamAV. Only generated TEST ONLY images and the standard
harmless antivirus test file are used; no real malware. Antivirus scanning is a
defence, not a guarantee against every possible malicious file.

Downloads retain permission/ownership enforcement, safe attachment names,
no-store/nosniff/CSP headers and audit. Previously stored evidence is not
retrospectively marked clean/verified. Removed synthetic bytes return HTTP 410;
metadata, original hashes, replacements and reviews remain readable to authorised
reviewers. No normal evidence is deleted or rescanned/rewritten by migration.

## Retention decisions and legal holds

Admin → **Documents & recovery** uses dedicated administrator-only permissions:
`operations:read`, `retention:draft`, `retention:publish`, `retention:hold`,
`retention:execute`, `backups:run`, `backups:restore-test`. Existing grants and
denials are retained; non-Admin overrides cannot bypass the role boundary.
Actors are derived from authenticated sessions. Immutable policy and event
tables preserve who saved/published/held/erased and when. Request keys protect
retries; optimistic draft/hold versions reject concurrent stale changes.

The three optional decisions default to **unset**, with no migration seed:

| Decision | Supported effect |
| --- | --- |
| Superseded evidence days | Preview old superseded evidence bytes on rejected applications, after both closure and evidence age qualify |
| Rejected-application national ID days | Preview only the national-ID field after rejected-application closure qualifies |
| Backup interval hours | Queue one current encrypted local backup after the interval; no attempt to manufacture historical backups after downtime |

Blank is valid and never authorises deletion or scheduling. Draft saving has no
effect until explicit publication. Publication previews describe before/after
values and scope. Effective dates are timezone-aware, non-backdated and ordered;
the UI explicitly uses Harare UTC+02:00. Existing application collection-period
snapshots in Organisation settings remain separate historical records and are
not rewritten/mapped into this new scoped policy automatically.

Legal holds protect all supported evidence/ID erasure for an application and
require reasons for placement/release. Preview is non-destructive and excludes
holds, current evidence and applications without rejected/dated closure. A
keyed digest binds the exact policy/hold/candidate preview. Execution rechecks
under locks; replaced preview or concurrent changes cause conflict rather than
unsafe deletion. Removal creates immutable tombstone events and retains hashes,
review and financial/audit history. Idempotent concurrent execution cannot repeat
erasure events.

**Destructive execution is deliberately restricted to isolated synthetic
`APP_ENV=test`/`isave_test_*` databases.** It is disabled in normal and production
services even if a period is published. No normal retention policy is published
by this milestone. Account deletion, active/current document disposal,
financial/audit erasure and blanket data deletion are unsupported. Retention
periods, legal scope, privacy notices, hold ownership/release procedures,
production disposal approval and archive/key destruction must be decided by
management/legal/operations. Archived backups can retain erased bytes; this UI
does not claim erasure from historical archives or independent copies.

## Encrypted local backup and recovery

Only the private operations worker receives the backup volume, external
32-byte key file and independent restore-server configuration. The web/backend
does not receive backup keys, and there is no archive-download or live-overwrite
API. Provider/infrastructure secrets are not business settings.

The worker holds a PostgreSQL advisory lock while claiming and completing one
job. It commits the claim before external work. Running jobs interrupted by a
crash are marked Interrupted and not blindly replayed. Retries with the same
request key return the existing job. An explicit new request can create a new
backup after an operator inspects an interrupted/failed operation.

Each backup uses an exported repeatable-read PostgreSQL snapshot, a custom-format
dump and an encrypted manifest with record counts/hashes, sequence baseline,
original/current document hashes, dump checksum, database and format information.
AES-256-GCM uses a random 96-bit nonce and authenticated format header. Plaintext
dump bytes use an anonymous tmpfs file, not persistent plaintext storage. The
archive is exclusively created, fsynced and checksummed. The initial local limit
is 256 MiB (bounded configuration up to 1 GiB), with 180-second subprocess limits;
larger datasets need a reviewed streaming/remote backup strategy. Monitor tmpfs,
RAM, database dump duration and disk capacity; this is not a limitless backup
appliance.

The restore test decrypts/authenticates, checks the encrypted archive and dump
checksums, and restores into a uniquely named `isave_restore_*` database on a
**different host and independently identified PostgreSQL cluster**. It never
overwrites or drops an existing database. All restored table record hashes and
private-document checksums must match the snapshot. PostgreSQL sequences are
not MVCC: later concurrent advances may produce harmless gaps; restored values
must not regress behind the captured baseline. Restored targets remain isolated
for controlled inspection, with no application or email worker attached.

Admin status distinguishes Queued, Running, Succeeded, Failed and Interrupted,
last successful local backup and last successful recovery test. Failures create
operational audit events with safe explanations, not raw subprocess/provider
errors. Worker result events identify the initiating job's authenticated actor
separately from the system process. A queued or encrypted-only backup is not a
successful restore test. No external notification delivery is enabled for these
failures; monitoring must check the worker and protected status.

### Commands and deployment prerequisites

Normal documented Compose files are `compose.yaml`, `compose.mailpit.yaml` and
the new optional `compose.operations.yaml`. Use targeted service commands so a
previously stopped Mailpit is not started. Provision private key and restore
password files outside the repo under user/SYSTEM-only ACLs; keep independently
controlled key escrow. Set `BACKUP_KEY_FILE_HOST`, `RESTORE_PASSWORD_FILE_HOST`
and `RESTORE_TEST_URL` through private shell/environment configuration. Never
print `docker compose config`, connection strings or file contents with secrets.
Do not commit `.env`/key files or put passwords on command lines.

Start/build only required services, with the operator's existing database
configuration. The new restore server uses its own persistent volume and internal
network; its password must match the private restore URL. Existing normal
PostgreSQL volume and credentials are not replaced. No Docker socket is mounted.

For a repeatable scheduled invocation:

```powershell
docker compose -f compose.yaml -f compose.mailpit.yaml -f compose.operations.yaml run --rm --no-deps operations-worker python -m app.operations_worker --once
```

Alternatively the worker service polls published schedule decisions. No normal
schedule is seeded or published. A failed executed job returns exit status 1
from `--once`; no due/queued work returns 0. UI Run queues rather than executing
privileged subprocesses in an HTTP request. Use a new explicit operation after
correcting a failed key/storage/target configuration; do not delete retained jobs
or archives to manufacture a pass. Monitor container health, signature age, failed
and interrupted jobs and backup/recovery age against approved RPO/RTO values.

### Controlled recovery procedure

1. Identify the successful encrypted backup and retain its checksum, key version
   and original protected manifest. Preserve the source and current records.
2. Ensure the key is available from controlled escrow and provision a distinct
   PostgreSQL 16 restore server with private credentials and no public ports.
3. Queue **Independent isolated restore test** for the chosen successful backup.
   Verify Succeeded plus table/document checksums and inspect the isolated target.
4. Validate application/version compatibility, document access, holds, audit,
   financial invariants and recovery timing using isolated credentials; never run
   production sending or copied live sessions against that target.
5. A future live recovery requires an incident owner, explicit user approval,
   maintenance/write freeze, current rescue backup, database/key/target identity
   checks, isolated rehearsal, reconciliation, secret/session rotation and a
   documented rollback/cutover. **No live restore action is implemented here.**

Local encrypted volumes and a same-laptop private archive are **not off-site
protection**. Independent storage provider, organisation-owned credentials,
upload/verification monitoring, access separation, retention/immutability,
key escrow/recovery drills and management RPO/RTO decisions remain required.
No paid service, external destination or production delivery is configured.

## Validation and activation evidence

Evidence is under `docs/private-document-operations/`; earlier intentionally
untracked evidence folders are untouched. The persistent isolated project is
`isave-operations-rehearsal-20261025`, runtime database
`isave_test_operations_rehearsal`, separate regression database
`isave_test_operations_regression`; frontend 13090/backend 18090. Unique volumes
cover PostgreSQL, independent restore PostgreSQL, signatures and encrypted
archives. The normal database is never used for synthetic records.

`browser.json` records 18 real-browser checkpoints: unauthorised access denial,
safe retry with preserved form fields, original upload through real scanning,
protected download checksum/headers, mobile/keyboard controls, draft isolation,
explicit publication, legal hold, safe preview, encrypted backup and independent
database/document restore. Synthetic fixture sessions are private and logged out;
these are automated checks, not claims of operator password-login UAT. Expected
worker failure jobs remain as evidence; do not mislabel them as unresolved
unexpected failures. Final counts, activation and preservation are recorded below.

## Final results — 25 October 2026

| Check | Passed | Failed | Skipped | Scope |
| --- | ---: | ---: | ---: | --- |
| Full backend regression | 662 | 0 | 10 | Isolated PostgreSQL, including PostgreSQL concurrency counterparts; exit 0 |
| Final affected backend | 57 | 0 | 1 | Operations, documents, real scanner, concurrency, health; exit 0 |
| Final full frontend | 163 | 0 | 0 | Includes UI and operations bridge denial checks |
| Affected UI before final bridge coverage | 20 | 0 | 0 | Operations, registration and settings |
| Real browser checkpoints | 18 | 0 | 0 | Isolated real scanner, PostgreSQL, encrypted backup and independent restore |
| Worker fault/concurrency checkpoints | 3 | 0 | 0 | Missing-key exit 1, concurrent job handling, source-host restore refusal |
| TypeScript | — | 0 | — | `npx tsc --noEmit`, exit 0 |
| Docker production builds | — | 0 | — | Final normal frontend/backend/account-worker/operations-worker builds passed |

Counts are not additive. The final affected backend run includes **five newly
added dedicated-permission denial cases** written after the full run collected
its tests. Those cases passed in the affected run; a third full run after adding
coverage-only cases was not performed. The full run covers the implemented
workflows; the final affected run also covers the last cache-header refinement.
All ten full-suite skips are SQLite-only concurrency variants, including the
new operations race variant. PostgreSQL equivalents ran. The single affected
skip is that same SQLite operations race, not an untested PostgreSQL workflow.

The initial full run recorded 645 passed, 13 failed, 9 skipped and exit 1 in
`backend-initial.json`. Twelve failures were lifecycle/downgrade regressions:
the additive preflight refused an otherwise permitted older boundary or changed
retained-history error wording. The other was the health test's hard-coded
development environment. Preflights were corrected without removing history
protection, and health now verifies the configured environment. A subsequent
affected run still caught a case-sensitive retained-settings message; it was
fixed before the successful full/final-affected runs. New schedule/concurrency
coverage explains the additional cases and SQLite skip in the successful full
result. The real-scanner test initially exposed stale loaded definitions; that
was fixed by loading the validated current database. Its second fixture assertion
incorrectly expected a whole-file antivirus marker appended after a valid image
to behave like the standard whole test file. The fixture now uses the standard
complete harmless file; no scan acceptance or freshness rule was relaxed.

### Normal activation and preservation

Migration **0018_operations** is active. Before migration, required application
writers were stopped, a **536,728-byte encrypted archive** was created privately,
its authenticated manifest/dump checksum verified, and an independent PostgreSQL
container with **no network and no host ports** restored the original database.
Every original row, schema fingerprint and sequence matched. The upgrade was
rehearsed there before normal upgrade. Normal preservation then matched original
records, accepted terms, permissions/grants/denials and old sequences, allowing
only the new canonical Admin permission catalogue/grants and its sequence advance.
The only new tables are three empty operational tables. No policy, hold, job,
synthetic account/document, campaign recipient or financial record was inserted
into normal PostgreSQL.

The normal source had **zero private evidence rows**. Populated document hashing,
scanning, protected download, retention and restoration were therefore verified
with the isolated synthetic document; do not present the normal zero-row check
as populated-document UAT. A final read-only deployment check confirmed normal
record/grant fingerprints still match after service restart.

The successful private archive, key/configuration paths, checksums and rollback
image references are in `activation.json`. Actual key/password files and archives
remain outside source under user/SYSTEM-only ACLs. The pre-activation rescue
archive is operator evidence, not a completed dashboard job: the normal console
truthfully shows **no recorded backup job yet**. Future real Admin-queued jobs use
the configured encrypted local volume and worker. No real Admin password login
or normal backup/restore job was exercised merely to populate the screen.

The first activation attempt stopped before snapshot/migration because Docker's
automatic address pool was exhausted by 32 retained networks. Existing containers
were brought back up while diagnosing the issue; no schema/data changed. Docker
networks and Windows routes were checked, then explicit non-overlapping private
subnets `10.254.81.0/24` and `10.254.82.0/24` were configured. No networks or volumes
were removed. On another host, validate overlap and override `PRIVATE_SCAN_SUBNET`
and `PRIVATE_RECOVERY_SUBNET` as necessary. `activation-initial.json` retains the
failed checkpoint separately from the successful activation.

Normal frontend/backend/PostgreSQL/account-worker remain running; PostgreSQL and
the existing **stopped Mailpit** retained identity, start time and state throughout
maintenance. New scanner, operations worker and independent private restore
database are running. Loaded scanner signatures were verified current, synthetic
scanning disabled, normal erasure disabled, new retention/scheduling periods unset,
campaign sending disabled and existing withdrawal-policy blockers preserved.
Normal public homepage/mobile-width and anonymous operations API/portal checks
passed. No normal document upload or financial manual check was repeated.

Use the protected `configuration.json` within the successful private activation
directory with the safe launcher:

```powershell
.\scripts\operations-compose.ps1 -Configuration '<private activation directory>\configuration.json' -Action Status
```

`WorkerOnce` runs one due/queued operation and preserves its exit status;
`StartWorker` starts only the three private operations services. The launcher
loads private credentials without displaying them and restores prior shell
environment values. Do not paste credentials or run an expanded Compose config
into logs/chat.

### Rehearsal closure and remaining limitations

`persistence.json` confirms every runtime record/document/policy/job fingerprint
survived a controlled stop/start. Both automated fixture sessions were logged out
and found revoked; no administrative revocation was substituted. A final encrypted
snapshot was preserved privately. Only the operations rehearsal was stopped,
retaining its containers and all **four** dedicated volumes (source PostgreSQL,
restore PostgreSQL, signatures and encrypted archives). Expected failed jobs 3
(missing key) and 5 (unsafe source-host target) remain evidence of passed negative
checks. No unexpected failure remains. A separate restore of the *final closure*
archive was not run; successful independent restores of the browser backup and
normal pre-migration backup were run and are separately recorded.

Unrun/blocked: production data collection approval, normal destructive retention,
account/financial/audit disposal, legal retention/hold rules, archive-disposal and
key escrow/recovery ownership, approved RPO/RTO and alert escalation, independent
off-site provider/credentials/verification, live recovery/cutover, real Admin
authenticated deployment UAT, load/capacity and formal screen-reader testing.
Encrypted backup does not establish live PostgreSQL/host-disk encryption; production
storage protection and operating ownership require infrastructure review. Local
key/backup files need a separately controlled escrow and off-site strategy. PDF
uploads remain unsupported; current PNG/JPEG limits are preserved. Engine image
security updates and signature freshness need monitoring. No external sending,
paid service, public deployment, push, merge or staging of evidence was performed.

Implementation references: [official ClamAV Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html)
and [PyCA authenticated-encryption API](https://cryptography.io/en/latest/hazmat/primitives/aead/).
