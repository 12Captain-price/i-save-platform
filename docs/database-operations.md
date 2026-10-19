# Database stabilisation and recovery

Run commands from the repository root unless stated otherwise. Use synthetic
data for development. Never delete an existing Docker volume to fix migration
tracking. This runbook does not perform a production deployment.

## What changed

Alembic owns schema creation. The API no longer calls `create_all`; it refuses
startup if history is missing/behind, tables are missing or structural drift is
detected. Docker runs `python -m app.migrations upgrade` before starting Uvicorn.
It will refuse existing untracked tables rather than silently stamping them.

`GET /health` checks process liveness. `GET /ready` checks database connectivity,
required tables and migration heads, returns 503 on failure and exposes no
database exception details. Compose uses `/ready`. Full structural validation
runs at API startup and in `python -m app.migrations status`.

The initial migration's Boolean default now compiles to a valid Boolean for
PostgreSQL and SQLite. This corrects a fresh-PostgreSQL failure in revision
`0001_initial_schema`; it does not rerun or rewrite an existing database's history.
Revision `0002_enrolment_timestamps` adds missing plan-enrolment timestamps to
legacy ORM-created tables; initial-migration tables already have them. Existing
enrolments receive migration-time timestamps, not invented historical dates.
Both paths retain existing rows. Its downgrade deliberately retains timestamps
because revision 0001 defines them too.

Revision `0003_authentication` adds sessions, login throttles and individual
permission overrides without changing existing business rows or accounts. See
[authentication operations](authentication-operations.md) before enabling the
new backend. Existing revision-0002 databases use upgrade only, never baseline.

## Existing untracked Docker database

Revision `0004_pending_registration` adds duplicate reservations and application
history without changing original business rows. Back up before upgrade; see
[registration operations](registration-operations.md) for its restore rehearsal,
local activation and rollback limits. The reviewed legacy baseline still compares
the original 14-table layout; it excludes all later migration-owned tables.

Use a maintenance window with all application writers stopped. Inspect existing
changes before applying code updates. Back up **before** recording history.
The commands below never reset data. The DB service stays running.

```sh
# Stop application writers. Stop other writers/replicas as well if applicable.
docker compose stop backend frontend
docker compose up -d db
docker compose build backend

# Set this to a secure, persistent directory outside the checkout.
# Do not commit or upload a real-member database dump.
ISAVE_BACKUP_DIR="$HOME/isave-backups"
mkdir -p "$ISAVE_BACKUP_DIR"
chmod 700 "$ISAVE_BACKUP_DIR"
ISAVE_BACKUP_FILE="$ISAVE_BACKUP_DIR/pre-baseline-$(date -u +%Y%m%dT%H%M%SZ).dump"
(umask 077; docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$ISAVE_BACKUP_FILE")
test -s "$ISAVE_BACKUP_FILE"
docker compose exec -T db pg_restore --list < "$ISAVE_BACKUP_FILE"

# Inspect the exact legacy schema. This command is read-only by default.
docker compose run --rm --no-deps backend python -m app.migrations baseline
```

Use a shell with `set -e` when running the block as a script, so failed backups
or checks stop the sequence. Listing an archive is not a restoration test:
restore it into a separate development database and verify records as described
below before continuing on important data. Keep the backup until acceptance.

After the backup has been verified and the baseline check passes:

```sh
docker compose run --rm --no-deps backend python -m app.migrations baseline --apply
docker compose run --rm --no-deps backend python -m app.migrations upgrade
docker compose run --rm --no-deps backend python -m app.migrations status
docker compose up -d --build backend frontend
docker compose ps
curl --fail http://127.0.0.1:8000/ready
curl --fail http://127.0.0.1:3000/
```

Baseline requires the original exact 14-table ORM structure, equivalent unique
keys, expected indexes, columns, types, nullability, PK/FKs and known defaults.
It accepts absent Python-side defaults or the corresponding known SQL defaults.
Unexpected tables, views, columns, constraints and defaults cause refusal. It
records only revision 0001; the following upgrade applies revisions 0002 and
0003. Legacy inspection still compares only the original 14-table layout;
authentication tables are created by migration, never by baseline.
Business rows are not changed by stamping. Take the service out of maintenance
only after migrations, readiness and representative reads pass.

If history already exists, skip baseline and use upgrade/status. If the schema
does not match, stop and inspect the reported differences; do not force-stamp,
drop tables, regenerate migration history or assume an empty database. A
migration-created database with lost history is intentionally refused by this
legacy path and requires recovery/review. Future migrations beyond the known
adoption head also require reviewing the baseline procedure.

## Fresh database / local non-Docker workflow

Fresh Compose database: `docker compose up -d --build` applies migrations before
serving. Defaults are local-development placeholders, not production secrets.

For local SQLite development, from `backend`:

```sh
mkdir -p data
.venv/bin/python -m app.migrations upgrade
.venv/bin/python -m app.migrations status
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Set DATABASE_URL securely for PostgreSQL. Never paste credentials in commands,
logs or chat. The migration CLI serialises its PostgreSQL operations with a
session advisory lock; all deployment instances should use this CLI rather than
running competing raw Alembic commands. Keep writers stopped during adoption;
the lock does not stop other applications or direct SQL writers.

## Backup/restore drill

Use a separate PostgreSQL instance or a newly named database, never the live
target. `pg_dump -Fc` must complete successfully; preserve the original archive.
Create the recovery database with the same owner, then stream the archive to
`pg_restore --exit-on-error --no-owner -U <owner> -d <recovery_database>`.
Do not add `--clean` against an existing database. Check the revision, expected
tables, unique/FK constraints, per-table row counts, representative records,
references and currency-specific totals against the source. Start an isolated
API pointing at recovery and exercise readiness and representative reads.
Record duration and any discrepancies. Only retire test databases created for
that drill; do not replace live data as part of verification.

The local dump/restore exercise proves recovery of synthetic PostgreSQL data.
It does not implement encrypted off-server storage, production retention,
scheduled backups, alerts, uploads backup, key management or the Admin Backup &
Recovery Centre. Those remain rollout requirements.

## Consolidated regression checks

```sh
set -e
npm test
npm run build
cd backend
.venv/bin/python -m pip check
.venv/bin/pytest -q
```

The migration lifecycle suite runs SQLite by default and explicitly skips
PostgreSQL cases unless TEST_POSTGRES_URL is provided securely. On an isolated
development PostgreSQL server, set that variable and run the same pytest command.
It creates random `isave_test_*` databases and drops only those after each test;
the test account therefore needs CREATEDB permission. Never point it at a
production server. The rest of the existing service tests remain SQLite tests;
this is not end-to-end PostgreSQL financial-workflow acceptance.
