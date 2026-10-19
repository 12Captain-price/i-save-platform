# Local authentication activation — 19 October 2026

This records the Windows/Docker development activation, not production approval.
Frontend files/design and existing database rows were preserved. Nothing was
pushed or merged. No existing volume was removed and no history was stamped.

This record describes backend activation. The subsequent frontend integration
and its browser evidence are documented in [frontend authentication](frontend-authentication.md).

## Review and fixes

- Revision 0003 adds only three authentication tables, their keys and one lookup
  index. Existing accounts, member links and financial tables are unchanged.
- Individual member reads now filter ownership in the query, matching collection
  isolation. Foreign and missing record IDs receive the same error semantics.
- Password-change attempts now have a persistent account throttle. After taking
  the account lock, the endpoint reloads and validates session expiry/revocation.
- Docker startup disables proxy-header processing. Forwarded headers therefore
  cannot choose the apparent client IP or HTTPS scheme in this local setup.
- Private console input refuses missing TTY/echo suppression. Initial-admin setup
  can prompt for the account address privately, avoiding command-line identifiers.
- Added an interactive live verifier that keeps credentials/tokens in memory,
  prints only status checks, and ends with all of its sessions revoked.

## Regression and recovery evidence

- Full SQLite run: **107 passed, 13 PostgreSQL cases skipped**.
- Full isolated PostgreSQL 16 run: **120 passed, none skipped**.
- Dependency compatibility and `git diff --check` passed. The existing upstream
  TestClient/httpx deprecation warning remains.
- Backend image rebuilt from reviewed source. Tests used disposable databases;
  the PostgreSQL test server had no published ports and memory-backed data.
- Application writers stopped before backup. DBeaver's idle connections were
  preserved; no external editor sessions or unsaved files were terminated.
- Backup saved privately outside the checkout:
  `C:\Users\HP\isave-backups\auth-activation-20261019T141259Z\pre-auth-0003.dump`.
  SHA-256: `b36d1a679f95768964e2302da7c4941d8709cc14910df0f98e3a24eec80021da`.
- The saved Windows archive was copied back and restored with exit-on-error into
  `isave_recovery_auth_20261019t141259z`. All 15 original tables, including
  Alembic history, matched in rows, columns, defaults, keys and indexes; sequence
  states matched. All 14 business tables were empty, so this does not establish
  populated financial-record recovery evidence.
- Migration 0003 and repeated upgrade passed on the recovery database; its API
  passed readiness/public-plan reads and denied anonymous member access.
- Source data was compared again against recovery before upgrading `isave`.
  Migration 0003 applied successfully and exact contents of all original business
  tables were unchanged. There are now 17 application tables plus Alembic history.
- Backend and unchanged frontend restarted. Readiness, public plans and frontend
  returned HTTP 200; anonymous member reads returned HTTP 401. Schema status and
  dependency checks passed on the rebuilt container.
- All **44 private HTTP operations** in the running API rejected anonymous
  requests with HTTP 401, a Bearer challenge and `Cache-Control: no-store`.
  All three Compose services subsequently reported healthy.

## Private operator step

Initial-admin creation and authenticated live checks require private operator
input. Run these in your own repository-root PowerShell terminal:

```powershell
docker compose exec backend python -m app.bootstrap
docker compose exec backend python -m app.verify_auth
```

Do not paste passwords, tokens or login responses into chat. The verifier writes
only status evidence to `/tmp/isave-auth-verification.json` in the backend.
The operator completed both commands privately. The status-only report finished
on 19 October 2026 at 16:19:50 Africa/Johannesburg (14:19:50 UTC). All 15 HTTP
checks passed against the running Docker backend:

- Readiness, three successful logins, authenticated identity and member reads:
  HTTP 200.
- Anonymous and invalid-session access: HTTP 401.
- Administrator self-deactivation: HTTP 403, with the administrator remaining active.
- Logout: HTTP 204; replay of that token: HTTP 401. A separate session remained
  valid until explicit revocation.
- Revoke-all-sessions: HTTP 204; both the revoking session and the other session
  subsequently returned HTTP 401.

Independent database checks confirmed revision `0003_authentication`, exactly
one active administrator, one initial-admin creation audit event and zero
unexpired, unrevoked sessions. All three Compose services remained healthy.
No passwords, token values, account identifiers or response bodies were included
in the verification report or this record.

Keep the original backup and recovery database until acceptance. Production TLS,
MFA, invitation/recovery delivery, public registration, frontend login wiring,
operational rate-limit/retention tuning and the unresolved financial/activation
rules remain outstanding. See [authentication operations](authentication-operations.md).
