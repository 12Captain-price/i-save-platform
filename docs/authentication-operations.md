# Authentication and backend permissions

Current extension: [staff administration, recovery and notifications](staff-administration.md)
adds operational staff invitations, individual access controls and rate-limited
recovery through the existing security permissions. The original checkpoints
below are historical; external production delivery remains disabled.

This milestone changes backend access only. The frontend design and labelled
demo portals remain unchanged; demo accounts do not log into this API. No
production deployment, account bootstrap or migration of the existing office
database is performed by implementing or testing these changes.

The subsequent local activation is recorded separately in
[authentication activation](authentication-activation.md).
The frontend now uses a same-origin session bridge; see
[frontend authentication](frontend-authentication.md) for its cookie boundary,
route guards and browser validation.

## Upgrade and controlled initial administrator

Revision `0003_authentication` adds `auth_sessions`, `user_permissions` and
`login_throttles`. It does not modify existing users, password hashes, roles,
member links or financial rows. Existing users with no password cannot log in;
roles with no explicit permissions receive no access. There is no automatic
promotion or default administrator password.

Use the backup, maintenance and restore-verification steps in
[database operations](database-operations.md) before upgrading an existing
database. A database already at revision 0002 needs `upgrade`, never `baseline`.
Keep application writers stopped, build the backend, then run:

```powershell
docker compose run --rm --no-deps backend python -m app.migrations upgrade
docker compose run --rm --no-deps backend python -m app.migrations status
```

In a trusted interactive terminal, create the initial administrator:

```powershell
docker compose exec backend python -m app.bootstrap
```

The account address is requested privately and the password twice without echo.
Run this in your own terminal; never send the inputs to the chat. The command
refuses a missing TTY or unavailable echo suppression. Use a unique password of at least
12 characters and at most 72 UTF-8 bytes (bcrypt's limit). Never pass passwords
on command lines, commit them, paste them into chat, or capture login responses
in shared logs. The CLI refuses an existing administrator, including inactive
administrators, an existing account at that email, ambiguous legacy role names,
or existing assignments/permissions on a role it would seed. It rolls back on
failure. Review legacy accounts explicitly rather than overwriting them.
Concurrent bootstrap processes are serialized by a PostgreSQL transaction
advisory lock or SQLite write transaction. API startup never seeds accounts.

After verification, start services using the normal runbook. Starting a newly
built Compose backend also runs migrations automatically; do not rebuild and
restart it against an important database before the backup is verified.

## Sessions

`POST /api/v1/auth/login` accepts JSON `email` and `password`. It returns an
opaque bearer token once, its expiry and `token_type: bearer`. Send the token
only through `Authorization: Bearer ...`. Cookies and query parameters do not
authenticate requests to the backend. The frontend server exchanges a protected
HttpOnly cookie for this bearer header; frontend authentication documents the
browser CSRF boundary. Do not put tokens in URLs or JavaScript-accessible storage.

Sessions contain 256 random bits; only SHA-256 token hashes are persisted.
Expiry defaults to 30 minutes, configurable with
`ACCESS_TOKEN_EXPIRE_MINUTES` (1–1440). Each request checks expiry, revocation,
account activity and current database permissions. `GET /api/v1/auth/me`
returns the account without its password hash and the effective permission
codes. `POST /api/v1/auth/logout` revokes the current session.
`POST /api/v1/auth/password` requires `current_password` and `new_password`,
changes the bcrypt hash and revokes every session, requiring a fresh login.
Password changes are limited to 10 attempts per account per 15 minutes. After
locking the account they re-check session revocation and expiry so an earlier
authentication check cannot authorize a stale request.
Administrator `DELETE /api/v1/users/{id}/sessions` also revokes all sessions.

Missing, inactive, ambiguous-case legacy and incorrect-password accounts receive
the same login error. Login attempts are limited in the database to 10 per
15-minute window independently by normalized account and direct client IP,
including successful attempts. Counters use atomic upserts across workers;
they are not process-local. No forwarded client IP header is trusted here.
The default Docker command disables proxy-header processing, so client-supplied
forwarded headers cannot bypass the client-IP counter or HTTPS enforcement.
These conservative development limits still need operational tuning and edge
rate limiting before rollout. Retention/cleanup of expired sessions and throttle
rows remains an operational follow-up.

All API responses use `Cache-Control: no-store`. Validation errors exclude
submitted input, and user response schemas omit password hashes. With
`APP_ENV=production`, authentication requires HTTPS; configure trusted proxy
handling deliberately and disable application debug mode. TLS termination,
provider-backed recovery, staff invitations and MFA remain outstanding.
The session approach follows the
[OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Permission defaults and ownership

Assisted pending submissions now use the separate `applications:assist`
capability for canonical Staff/Admin roles. Staff need an explicit grant;
review permission alone does not permit submission. See
[assisted registration](assisted-registration.md) for consent/session handling.

Bootstrap seeds conservative engineering templates, not organisational approval
of a financial approval matrix:

| Role | Default access |
| --- | --- |
| Member | Own member profile, applications, contributions, registration fees and subscriptions, read only |
| Staff | All member profiles and applications, read only |
| Finance | All member profiles, contributions, fees, subscriptions and verifications, read only |
| Administrator | Known read/write permissions, subject to disabled business workflows and security invariants |

Plan browsing remains public. Every other entity endpoint requires a session;
collection queries filter ownership **before pagination** and individual reads
check the linked `members.user_id`. Unlinked accounts see no member data. A
member cannot change account links, roles, permissions, account activation or
financial states. Other members' records return 404.

Only administrators can provision accounts or change security access. Use
`POST /api/v1/users` with an explicit role ID and a securely communicated initial
password; this is controlled provisioning, not public registration or an
invitation flow. `PUT /api/v1/members/{member_id}/account` with `user_id` links
an unlinked member record to an unlinked member-role account. It never replaces
an existing link or changes activation/fee/application state. Administrator
provisioning is temporary operational capability pending invitation delivery.

Permission codes are `<resource>:read`, `<resource>:write` and supported
`<resource>:own` scopes. Audit is read only. Role grants use the existing
`POST /api/v1/roles/{role_id}/permissions/{permission_code}` endpoint.
Individual overrides use:

- `PUT /api/v1/users/{id}/permissions/{code}` with `{"allowed": true}` or
  `{"allowed": false}`; explicit denial overrides a role grant.
- `DELETE /api/v1/users/{id}/permissions/{code}` removes the override and
  restores the role template's effect.

Changes revoke the affected sessions; permissions are also re-read on each
request. Unknown codes are refused. Security writes (`users:write`,
`roles:write`) cannot be delegated to non-administrator roles. Administrators
cannot change their own role/activity or their own permission overrides.
Administrator-role overrides and renaming built-in roles are refused. Changes
to the administrator set are serialized, re-check the actor and protect the
last active administrator. Security changes append audit events with the
authenticated actor and no password/token values.

Contribution recorder identity comes from the session, never `recorded_by`
query input. Approval/reviewer identities are no longer caller-controlled.
New contributions, fees and applications accept only their initial states;
caller-selected approved/paid/verified states and extra credential fields are
refused. Financial verification/reversal, fee/subscription payment marking,
subscription creation and application decisions return `503 unconfigured`,
including for administrators. Their approval, billing, ledger and activation
rules remain unresolved. No automated fee, activation, returns, withdrawal or
lending rules are introduced.

## Validation

`python -m pytest -q` runs SQLite checks by default. For isolated PostgreSQL
validation, `TEST_POSTGRES_URL` enables temporary migration databases, and
`ISAVE_TEST_DATABASE_URL` runs the ordinary service/API tests against a separate
database whose name must start with `isave_test_`. Tests create/drop tables in
that dedicated database; never point either setting at an operational server.
Migration tests create/drop only their randomly named test databases.

Tests cover every private route without authentication, member collection and
record isolation, role escalation, session expiry/logout/password revocation,
individual denials, disabled accounts, actor spoofing, credential redaction,
throttling, HTTPS enforcement, controlled bootstrap, preservation of existing
accounts across revision 0003, and concurrent administrator deactivation.

Local validation on 19 October 2026 used a separate validation image with
read-only source mounts. SQLite: **103 passed, 13 PostgreSQL cases skipped**.
The complete suite with both PostgreSQL settings enabled: **116 passed, no
skips**, using an isolated PostgreSQL 16 container with no published ports and
only temporary memory-backed data. Dependency checking passed. Both runs
reported the existing upstream TestClient/httpx deprecation warning. No
frontend files or dependency manifests changed. The existing Compose database
was not migrated or bootstrapped during this validation.

## Private verification after activation

After the backend is healthy and the administrator has been created, run in your
own terminal:

```powershell
docker compose exec backend python -m app.verify_auth
```

Both account address and password are hidden. The command contacts only the
running backend's loopback address, refuses redirects/environment proxies,
keeps tokens in memory and prints only status checks. It verifies readiness,
anonymous/invalid-session denial, login, authenticated member reads, refusal of
administrator self-deactivation, logout, survival of a separate session and
revocation of every session. It ends signed out and records only redacted
status results in `/tmp/isave-auth-verification.json` inside the backend
container. This is a local-development HTTP check; production requires a
separately configured HTTPS deployment. It creates no member or financial
records. Normal session, throttle and audit records are retained.
