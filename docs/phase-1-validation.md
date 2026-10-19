# Phase 1 validation — 19 October 2026

Validated in this cloud workspace using synthetic data. This does not validate
the user's laptop database, staging, production, organisational policy approval,
or the remaining authentication/financial requirements.

This is the database milestone's historical validation record. The later
authentication implementation and its operational limits are documented in
[authentication operations](authentication-operations.md); statements below
about unauthenticated routes describe this earlier baseline.

| Check | Result |
| --- | --- |
| Frontend `npm test` | 22 tests passed, 2 test files |
| Backend pytest with TEST_POSTGRES_URL configured | 39 passed; no PostgreSQL lifecycle cases skipped; one upstream TestClient deprecation warning |
| Fresh and repeated migrations | Passed on SQLite and PostgreSQL 16 |
| Explicit legacy baseline | Read-only inspection left history untouched; apply recorded initial history; upgrade retained synthetic rows and added enrolment timestamps |
| Drift refusal | Missing/extra tables, missing/partial unique indexes, extra columns and unexpected defaults refused; stamped index drift blocked API startup |
| Startup/readiness | Uninitialised/untracked schemas refused without table creation; `/ready` returned 503 without required history and 200 with current history |
| Docker images | Backend and production frontend built; frontend build used existing node-server preset |
| Docker services | Separate `isave-phase1` Compose project: frontend, backend and PostgreSQL all healthy |
| Functional requests | Docker production `/`, `/plans`, `/login` returned expected SSR HTML; backend readiness and member reads passed |
| Restart | Restarted PostgreSQL and backend; migrations repeated successfully, readiness recovered, synthetic member persisted |
| PostgreSQL restore | Custom-format dump restored into independent database; all 15 tables (14 application tables + Alembic) and every row matched |
| Restored API | Separate API returned readiness, restored member and both synthetic contribution records |
| Recovery money checks | Restored USD 25 verified contribution, USD 12.50 pending excluded, USD 20 registration fee separate; direct fixture checks, not financial-workflow acceptance |
| Working tree checks | `git diff --check` passed; dependency manifests and lockfiles unchanged; frontend source unchanged |

Docker build containers initially could not resolve external package hosts in
this cloud machine. Validation used temporary Compose/Dockerfile overrides
outside the repository to supply the existing proxy host resolution and mount
the cloud CA bundle as a BuildKit secret. TLS verification remained enabled.
The overrides changed package-install networking only; application copies,
build commands, runtime commands and migration logic were the repository's.
No proxy credentials or CA files were added to the repository or runtime images.

Local validation used alternate loopback ports to avoid existing development
listeners, and a separate named PostgreSQL volume. It did not touch an existing
office database or overwrite the standard development volume.

Next milestone: authentication, revocable sessions, controlled administrator
bootstrap, staff invitations, per-person permissions and ownership enforcement.
Entity routes remain unauthenticated. Ledger corrections, idempotency,
reconciliation and end-to-end financial acceptance remain outstanding. See
[delivery roadmap](delivery-roadmap.md) and
[database operations](database-operations.md).
