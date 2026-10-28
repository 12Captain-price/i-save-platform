# PostgreSQL identities and audit protection

## Activation boundary

The local normal cutover was explicitly authorised and completed on 27 October
2026; see [activation evidence and rollback](database-security-activation.md).
This does not authorise changes to any other database. New cutovers still require
isolated acceptance, private backup, independent restore and owner authorisation.
Migration `0019_database_audit` is required by the new backend. Do not deploy that
backend against schema0018 or give its runtime a migration password to work around
startup refusal. Role provisioning is an explicit maintenance operation, never
ordinary API/worker startup.

## Responsibilities

| Identity | Intended access | Not permitted |
| --- | --- | --- |
| `isave_owner` | NOLOGIN schema owner; owns application tables, sequences and trigger functions | Ordinary connections/password login |
| `isave_migrator` | NOINHERIT login; explicit `SET ROLE isave_owner` inside migration CLI; schema changes | Mounting this credential in API or workers |
| `isave_api` | Application reads and supported workflow writes; audit INSERT/SELECT; only existing member/permission-override deletion paths | Schema changes, role administration, ownership, audit UPDATE/DELETE/TRUNCATE |
| `isave_account_worker` | Recovery claims/hashed links; campaign claim/results; necessary policy/content/account reads; INSERT audit/delivery events | Financial writes, private evidence, password changes, permission grants |
| `isave_subscription_worker` | Read activation/settings/rates; INSERT obligations, snapshots, audit | Payments, ledger, membership activation, private evidence |
| `isave_operations_worker` | Backup job claim/results and INSERT operational events; policy and deployment-inventory metadata | Document bytes, financial writes, global audit mutation, schema changes |
| `isave_backup_reader` | SELECT tables and sequence values for consistent full backups | INSERT/UPDATE/DELETE/TRUNCATE, nextval/setval, schema changes |
| Independent restore login | Owner of a newly created isolated restore database, or a precreated empty target | Source-database access and live overwrite |
| Provider/bootstrap operator | Reviewed role creation, grants and object adoption | Running as the ordinary application identity |

All ordinary identities are NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION,
NOBYPASSRLS, NOINHERIT and have no other role memberships. Database CREATE/TEMP
and public-schema privileges are revoked from PUBLIC in this dedicated database.
Other existing roles/grants are not dropped or reassigned. Shared-database hosting
requires a separate review before these PUBLIC revocations.

The supported layout uses a dedicated PostgreSQL cluster per environment. Role
names and passwords are cluster-wide; staging and production must not share this
fixed identity set on one cluster. The many databases used in automated testing
are all synthetic and belong to a single disposable test environment.

Provisioned logins explicitly use UTC sessions, independent of the provider/host
timezone. Startup verifies this too. Harare business dates still use the existing
explicit Africa/Harare conversion; this does not change stored instants or policy.

The API is one trusted application boundary, not a database identity per member.
Its access to operational tables does not replace endpoint permissions, session
revocation or member ownership checks. A compromised API can still perform the
supported writes and insert false new audit events. This is tamper resistance,
not cryptographic nonrepudiation or a security certification.

The exact reviewed table matrix is `app/database_security.py`. Workers receive
metadata-only column access to account/member/application inventory where they
do not need full rows. The account worker has UPDATE(id) solely for existing
SELECT FOR UPDATE lock paths; it cannot update passwords or account status.
Database insert guards restrict account/subscription audits to their specific
system events with no staff identity. Operations can append backup/recovery
events only, cannot publish retention policy and can update only job-result
columns. The API can queue jobs but cannot manufacture their completed status.
Account-worker updates are limited to recovery/delivery state and locking
columns; saved campaign versions, recipient identities/addresses, invitation
purpose/issuer and account status cannot be rewritten by that worker.
No future-table DML default grants are installed: a migration adding a table
requires an explicit matrix review and repeat provisioning before deployment.

`compose.database-roles.yaml` is the **activated local normal role overlay**.
Apply it last after the normal `compose.yaml`, `compose.mailpit.yaml` and
`compose.operations.yaml` definitions, using protected DB_*_FILE_HOST paths.
It clears inherited privileged database URL values, removes API auto-migration,
mounts only each purpose's DSN and enables runtime privilege checks even in local
development. Maintenance and scheduling remain explicit profiles. It preserves
the normal volume names, frontend destination, scanner, Mailpit and launch mode.
Do not run an unqualified `up`: activate only reviewed service names and preserve
the original running/stopped baseline. In particular, including the Mailpit file
does not authorise starting a previously stopped Mailpit service.

## Audit guarantees and sensitive data

0019 preserves event rows, replaces the audit actor FK's SET NULL with RESTRICT,
and installs ALWAYS-enabled UPDATE/DELETE and TRUNCATE rejection triggers.
Runtime roles have only INSERT/SELECT on global audit history, cannot own it,
disable triggers, change trigger functions, SET ROLE to its owner, or switch
session_replication_role. Existing actor attribution is retained rather than
silently cleared when an account is deleted; suspension remains supported.

Authenticated routers pass the session-resolved user into audit writers. Worker
events use null actor IDs with explicit event/action provenance, not an invented
staff identity. The general audit helper requires either a server-side actor or
an explicit system source. Audit reads remain permission-protected.

ORM audit insertions redact credential-shaped keys recursively and URLs in audit
details. Do not pass request bodies, documents, headers, passwords, tokens or
credential URLs to any audit writer. Redaction is defence in depth: an arbitrary
secret disguised as ordinary prose cannot be detected, and direct SQL bypasses
the ORM hook. Existing audit text is not rewritten. Database query parameters
are hidden, and operational CLIs suppress raw connection/SQL errors.

The schema owner, database/provider administrator or host operator can change
protections, restore an older database or replace files. Independently retained
encrypted backups and externally monitored integrity evidence are still needed.
No external audit anchoring is implemented here.

## Provisioning and migration procedure

Use a private operator environment with PostgreSQL client tools and protected DSN
files outside Git/build contexts. Never put a connection string/password in a
command argument, expanded Compose output, browser configuration or ticket.
Examples below use file paths, not credential values.

1. Inspect read-only with `python -m app.database_security inspect --dsn-file /private/operator-dsn`.
   Confirm database identity, current role attributes, object owners, memberships,
   grants, extensions/functions, existing consumers and audit triggers privately.
   Do not infer these from an old report.
2. Obtain a private backup including bytea evidence, verify checksums, independently
   restore it and compare row/document/sequence inventories. Capture pre-change
   row fingerprints, existing role grants and service IDs/states privately.
   In the approved cutover window, quiesce only the authorised API/worker writers
   before the preservation baseline. Do not stop/restart database, frontend,
   scanner or Mailpit merely to make comparison convenient.
3. On an isolated copy first, use
   `python -m app.database_security prepare --dsn-file /private/operator-dsn --apply`.
   New login roles have **no password**. Repeat preparation never resets one.
   Set each password privately through psql `\password role_name` or the approved
   provider's secret-management process. Never use ALTER ROLE plaintext in chat
   or ordinary terminal command history. Keep the NOLOGIN owner passwordless.
4. For an existing schema, run reviewed ownership adoption using
   `python -m app.database_security provision --dsn-file /private/operator-dsn --apply --adopt-owned-objects`.
   This is scoped to the exact application table inventory, owned sequences and
   trigger functions. Unexpected tables/functions and unmarked colliding roles
   cause refusal. It never uses broad REASSIGN OWNED or drops roles/rows.
5. Run `python -m app.migrations upgrade` from a dedicated maintenance process,
   with its **own** DATABASE_URL_FILE, DATABASE_PURPOSE=migrator and
   DATABASE_MIGRATION_ROLE=isave_owner. Existing records must remain identical.
   On a fresh empty database, prepare roles, migrate as owner, then provision/adopt.
6. Repeat provisioning after migration to apply the reviewed grants. Run
   `python -m app.database_security verify --dsn-file /private/api-dsn --purpose api`
   and the account/subscriptions/operations/backup counterparts, authenticating
   separately as each login. Verification checks effective grants/memberships,
   ownership, writable schemas, audit trigger state and SECURITY DEFINER exposure.
7. Only after approval, switch the corresponding service secret files in a
   maintenance window and deploy matching images. Startup refuses unsafe hosted
   runtime privileges. Do not temporarily grant ownership/superuser to pass it.
   Recheck health, supported reads/writes, worker runs and record fingerprints.
   Update the normal launch procedure to include the role overlay consistently;
   retire privileged DATABASE_URL values from application/worker deployment
   configuration. The original local-development profile is not a production
   alternative or a rollback path for bypassing the new privilege checks.

The preparer needs CREATEROLE plus the necessary role ADMIN/SET options and
ownership/grant authority on this dedicated database/schema. PostgreSQL16 does
not automatically grant every new role's SET capability to a CREATEROLE user.
The script explicitly grants schema-owner membership to the bootstrap operator
and migrator, never to runtime identities. Provisioning is serialized by a
transaction advisory lock; grants/ownership change atomically. Password rotation
is a separate operation. No provider-level superuser is assumed.

## Managed PostgreSQL and Render

Preflight actual capabilities on the selected service. If direct role creation
or ownership transfer is disallowed, provider-assisted preparation is required;
do not substitute a provider owner credential in the application.
[Render documents](https://render.com/docs/postgresql-credentials) that SQL-created
users are distinct from dashboard-managed credentials, and Blueprint default
credentials can change on sync. Do not wire ordinary services to an automatically
selected provider-owner URL. Use explicit per-purpose secret references. Render
hosting has **not** been provisioned or acceptance-tested by this change.

Use private database networking and verified TLS (`sslmode=verify-full` with the
appropriate CA where required). Backup subprocesses preserve supported libpq TLS
options and reject unreviewed URL options; they do not inherit unrelated secrets
or PGSERVICE configuration. See [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)
for SELECT/row-security requirements. If RLS is introduced later, revalidate
complete backups rather than enabling partial row-security dumps.

## Backup and independent recovery

Operations jobs use the restricted job connection. BACKUP_SOURCE_URL_FILE is a
separate read-only source, mounted **only** in the operations service. Migration
and bootstrap credentials are absent from normal API/account/subscription/backup
worker containers. The dump, manifest and private evidence remain encrypted
together. Restore never installs source role grants/ownership (`--no-owner
--no-acl`); the reviewed provisioning procedure is part of recovery.

Preferred managed mode is RESTORE_TARGET_MODE=precreated. An operator supplies a
fresh empty database named `isave_restore_*` on an independent target; its restore
login owns only that target and needs no CREATEDB. The worker refuses nonempty
targets, holds a target advisory lock across restore/verification and never drops
or overwrites a target. Failed partial targets remain for investigation; provide
a different empty target for a subsequent rehearsal.

Where permitted, server system identifiers establish independence. Identical
host/port endpoints are refused; different ports still require distinct cluster
identifiers or endpoint-bound operator evidence. Two local test processes prove
database isolation, not independence from loss of their shared physical host.
Production restore storage must use a separately verified failure domain. Managed
providers restricting pg_control_system require a private RESTORE_INDEPENDENCE_FILE,
containing exact `source` and `target` objects (`host`, `port`, `database`), distinct
`source_provider_id`/`target_provider_id` and `independence_verified: true`.
The operator must verify those resource IDs using provider evidence. The worker
validates endpoint binding but cannot prove an operator's infrastructure
attestation is truthful. Without that evidence the operation fails closed.
Different DNS names alone are insufficient. create_database mode remains available
only on a separate server whose restore login has explicitly approved CREATEDB.

Local encrypted archives are not off-site protection. Off-site destination,
RPO/RTO, key escrow, alerts and responsible operators remain launch requirements.
Key loss makes archives unrecoverable. Retain old keys privately for old archives;
never rotate an archive key in place and assume historical files still decrypt.

## Rotation, incident response and rollback

For a suspected leak, revoke the affected login, terminate its existing sessions
through the authorised DB operator, issue a replacement private credential, and
roll only affected services after approval. REVOKE LOGIN/password changes alone
do not terminate pooled existing connections. Do not revoke user sessions or
reset member/Admin passwords as a substitute for DB credential rotation.

Planned rotation uses a private password change and controlled pool restart, or
a separately reviewed replacement-login grant matrix. Verify privileges again;
provider-managed default credentials do not automatically preserve this model.
Preserve event attribution and historical payments. Recovery access stays offline
or in an approved secret store, not resident in application containers.

Rollback uses retained compatible builds and verified backups under a maintenance
procedure. 0019 downgrade refuses populated audit history. Never remove audit
protections, force-stamp migration history or restore over live data casually to
make an older image start. Any live restore requires explicit owner approval,
an isolated verified restore, a preservation plan and a documented cutover.

## Validation and normal activation status

Current test results and outstanding checks are recorded in the database-security
addendum of `release-readiness.md`. The standalone
`compose.database-security-test.yaml` uses no host ports, persistent project-scoped
storage and a separately supplied random synthetic password. Select an unused
subnet and unique project; never overlay normal Compose. Preserve the pytest
process exit status (PowerShell `$LASTEXITCODE`) before formatting/copying output.
Stop only that explicit project without `-v`; never prune other storage/networks.

During the pre-activation implementation checkpoint Docker was unavailable, so acceptance used two private,
loopback-only portable PostgreSQL16 processes instead. Both were independently
initialised, survived a controlled preservation restart, then stopped without
deleting storage. No Windows service was installed. Full PostgreSQL regression:
798 passed/0 failed/11 skipped; final affected checks after the last account-worker
column reduction:138 passed/0 failed/0 skipped. See the readiness addendum for
the exact non-additive scopes, SQLite failures, scanner skip and Linux/provider
checks that remain unrun. Normal privilege status could not be refreshed while
normal Docker/PostgreSQL endpoints were unavailable.

The subsequent owner-authorised Linux acceptance and normal activation passed:
full803/0failed/11skipped; affected actual-role91/0failed/0skipped. The Linux tool
version failure was diagnosed and fixed before cutover. Normal encrypted backup,
independent restore, 0019 rehearsal, frozen-record checks, actual role cutover and
restricted-reader/nonsuperuser post-cutover recovery passed. Only API and the two
workers were recreated; Mailpit remains stopped. See the activation document for
non-additive test scopes, historical failures, remaining limitations, the private
normal configuration path, `scripts/normal-compose.ps1` and recovery instructions.
