# Controlled normal database-security activation — 27 October 2026

## Scope and authority

The owner explicitly authorised private backup, independent restore, migration
0019, ownership/grant changes, purpose-specific credentials and only required
normal service restarts. This is local activation, not hosting or launch approval.
No account-password reset, application permission change, policy publication,
external email, force-stamp, destructive restore or volume deletion is authorised.

Docker Desktop Linux engine 29.8.2 was available. The recorded normal baseline
was schema `0018_operations`; `isave_user` was a superuser with role/database
creation rights and owned all 71 public tables. Global audit had no noninternal
protection triggers. Existing grants and service configuration were captured
privately, not printed. API, frontend, account worker, operations worker, database,
scanner and independent recovery database were running. Mailpit was stopped.

## Acceptance and preservation evidence

- Initial Linux full regression: **802 passed, 1 failed, 11 skipped**, original
  pytest exit **1**. The sole failure was encrypted restore. The test image used
  an unpinned Debian PostgreSQL client package, now version 17; its restore emitted
  `transaction_timeout`, which PostgreSQL 16 rejects. An independent synthetic
  reproduction confirmed this. No normal cutover occurred with this failure.
- `Dockerfile.security-test` now matches `Dockerfile.operations`' PostgreSQL
  16 Bookworm toolchain, rather than installing a newer unqualified client.
  Operations client version checked: **16.15**. The worker/test Python runtime is
  3.11; the API image remains Python 3.12.
- Corrected Linux actual-role suite: **91 passed, 0 failed, 0 skipped**, exit **0**.
  This includes authenticated role denials, concurrent operations, API financial
  workflows, worker dispatch, encrypted backup and independent nonsuperuser restore.
- Corrected **full Linux PostgreSQL regression: 803 passed, 0 failed, 11 skipped**,
  original pytest exit **0**. These scopes overlap and must not be added together.
  Ten skips are SQLite-only concurrency variants with their PostgreSQL counterparts
  running; the eleventh is the opt-in real ClamAV integration, not rerun against
  the normal scanner. The earlier 798-pass full result preceded five additional
  role-boundary tests. Existing all-SQLite parity failures are not declared fixed.
- A separate network-isolated Linux check exercised real tmpfs execution and
  refusal of oversized output through `RLIMIT_FSIZE`: **passed**.
- Required API/account/operations images built successfully. Prepared Compose
  routing, persistent volume names, runtime secret separation and existing
  operations secret references were checked privately. No frontend rebuild needed.
- Private evidence directory checked: no broad Everyone/Authenticated Users/Users
  allow grants. Normal backup is encrypted with a separately retained private key.
  Its manifest contains snapshot row fingerprints, document digests and sequence
  values; encrypted/archive checksums and authenticated decryption were verified.
- Backup restored into a new database on an independently initialised PostgreSQL
  cluster, confirmed by distinct system identifiers. All restored rows, documents
  and sequence values matched. The restore did not overwrite any database.
- Migration 0019, ownership adoption, grants and separate actual-role authentication
  were rehearsed on that restored copy. All records matched before/after, except
  the intended Alembic revision change. This includes accounts, grants stored as
  application records, accepted terms, financial history and audit attribution.

Private logs/XML, existing grants, service baselines, manifests, encryption key,
credential files and compatible-image IDs are retained under the ignored,
access-restricted `.database-security-private/activation/` directory. Never stage
that directory or paste its contents. The restored copy contains normal private
data and must receive the same custody protections as the source; it is not a
synthetic application environment. Persistent Docker storage is not an off-site
backup or a separate physical failure domain.

## Cutover and final status

**Activated successfully.** Only the normal API/account/operations writers were
quiesced. A final comparison confirmed that the live database still matched the
independently restored backup before changes. Scoped role preparation, private
random credentials for previously nonexistent purpose roles, ownership adoption,
migration `0019_database_audit` and repeat grants then completed successfully.
No existing account password or application permission override was changed.

All 71 tables are owned by NOLOGIN `isave_owner`; runtime roles do not own schema,
tables or protected functions and lack schema/role administration. All five
purpose-specific identities authenticated independently and passed the effective
grant/column/sequence/audit verifier. Audit mutation/truncation and worker-scope
triggers are ALWAYS enabled; the actor foreign key preserves attribution.
Destructive denial checks were confined to isolated data, not normal audit rows.

Only backend, account worker and operations worker were recreated. Each deployed
process passed schema/privilege checks under its actual login. The operations
process also verified its separate backup reader. A scheduler one-off performed
read-only startup verification without generating normal subscription obligations.
Runtime URLs are file secrets, inherited privileged URLs are empty, migration
credentials are not mounted, and the API no longer migrates at startup.

Post-cutover encrypted backup under `isave_backup_reader` and independent restore
under the dedicated nonsuperuser recovery login also passed all checksum, record,
document and sequence checks. No source backup-job or synthetic workflow rows
were inserted for this operator drill. That recovery copy is retained. A fresh
empty target under the same restricted recovery login was then prepared and
verified; only operations was restarted to load it. The normal worker now points
to this empty target, with matching cluster-independence evidence. After another
successful restore, prepare the next empty target rather than overwriting a copy.

Final source preservation matched the pre-cutover fingerprints across every table
and sequence and every private document, excluding only `alembic_version`'s intended
0018-to-0019 change. No accepted terms, payments, obligations, ledger entries,
account/session rows or business settings were modified.

HTTP checks: homepage, readiness and public contacts **200**; unauthenticated
identity and Admin plan management **401**. API/frontend/database/scanner are
healthy; account/operations workers and recovery database are running without
startup/permission errors. Frontend, database, scanner and recovery database were
not restarted. Mailpit retains its original stopped state (its old unhealthy
health metadata is not a running health check). Launch mode is unchanged.

Both isolated Linux projects are stopped, with persistent volumes retained.
Completed one-off privileged maintenance containers were removed, retaining all
private logs, archives, keys and preservation evidence. No normal volume was
deleted; intentionally untracked evidence folders were untouched. Nothing pushed
or merged. No external sending or policy publication occurred.

Frontend/browser/TypeScript tests were not repeated for this database-only
activation; the required API/account/operations image builds passed. The new
normal Compose helper passed PowerShell syntax validation and actual activation
execution; `git diff --check` passed. Managed-provider deployment/role/TLS
acceptance, an all-SQLite full rerun and fresh real scanner/Mailpit integration
remain unrun in this activation, not failures of the passing PostgreSQL suite.

## Operating the activated normal stack

Once activation is confirmed, consistently use the role overlay last. The helper
refuses implicit whole-stack startup and never starts Mailpit as a dependency:

```powershell
.\scripts\normal-compose.ps1 -PrivateEnvironmentFile .database-security-private\activation\normal.private.env -Action status
.\scripts\normal-compose.ps1 -PrivateEnvironmentFile .database-security-private\activation\normal.private.env -Action start -Services backend,account-worker,operations-worker
```

Only specify services intentionally being started/recreated. Do not use bare
`docker compose up` on this activated installation: that omits private role
configuration and restores the obsolete privileged runtime defaults. Privileged
operator/migration connections remain offline or in an explicit maintenance job;
they are not API/account/operations/scheduler secrets. Role provisioning remains
separate from ordinary startup.

The operations service retains its existing archive key and archive volume.
The activation backup uses a separate private key; neither key replaces the other.
A dedicated `isave_restore_*` database with a nonsuperuser owner was prepared on
the existing independent recovery service, successfully restored, and retained.
The worker's current target is the separately checked empty
`isave_restore_hardening_ready_20261027`. Older restore databases were left intact.
A successful restore consumes an empty target: subsequent rehearsals need a
different reviewed empty target, never an overwrite. Update both the private
restore DSN and endpoint-bound independence evidence, then restart operations
only to load the change. Do not change source or migration credentials.

## Rollback and recovery

1. Keep the private backup/key, original grants/configuration and retained matching
   0019 image tags. Diagnose privately; never print credential URLs or SQL inputs.
2. Before a schema change, stop a failed cutover and resume only the original
   writers with their recorded compatible configuration. Preserve all other states.
3. After 0019, prefer a fix forward using the retained matching 0019 backend and
   worker images and the role overlay. Old 0018 images fail the exact-head check;
   an old image alone is not a safe rollback. Do not disable audit protection,
   downgrade retained audit history, grant runtime ownership, or force-stamp.
4. If recovery requires data restoration, obtain explicit approval for a live
   recovery cutover. Restore independently, verify rows/documents/sequences and
   constraints, rehearse the required migration/provisioning, and account for all
   writes since the backup before redirecting service connections. Never restore
   casually over the live database or delete its volumes.
5. Rotate an affected database credential privately and roll only its dependent
   pools. Changing a password does not terminate existing connections. Do not reset
   member/Admin passwords or application grants as database recovery shortcuts.

Managed-provider role/TLS acceptance, independently stored encrypted off-site
backups, RPO/RTO/key custody/alerts, production email integration and the remaining
business/privacy approvals stay separate launch prerequisites. This activation
does not certify security or production readiness.
