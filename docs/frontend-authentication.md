# Frontend authentication — 19 October 2026

The existing login card, public layout, colours, typography and portal navigation
styles are retained. Login now uses backend authentication. Active portal routes
no longer mount `DemoProvider`, sample dashboards or simulated actions. Legacy
account forms and the portal chooser no longer provide demo logins.

## Session boundary

The browser calls the frontend's same-origin `/api/auth/login`, `/api/auth/me`
and `/api/auth/logout`. The frontend server calls the backend bearer API using
`AUTH_API_ORIGIN` (Docker: `http://backend:8000`; local default:
`http://127.0.0.1:8000`). This is server-only configuration. There is no general
backend proxy or new migration.

Successful login sets a session cookie with `HttpOnly`, `SameSite=Strict`,
`Path=/`, no Domain or persistent expiry, and `Secure` on HTTPS. Tokens never
enter frontend JavaScript, HTML, URLs, localStorage or sessionStorage. Login and
logout require an exact Origin match and a custom header. Upstream requests use
fixed paths, deadlines and no redirects. Responses/private documents use
`Cache-Control: no-store` and `Vary: Cookie`. This follows the
[OWASP session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Backend `/auth/me` adds `workspace`, derived from the actual role: member, staff,
finance or administrator (mapped to the `admin` URL). Unknown roles have no
workspace. Browser fields/cookies cannot assign a role. Backend permission and
ownership checks remain authoritative; a workspace assignment grants no API
permission.

The frontend server validates sessions before serving `/portal` documents and
redirects anonymous/expired sessions to login. Cross-role requests return users
to their assigned dashboard. Client navigation also checks identity and hides
workspaces while verification is pending or unavailable. Sessions are rechecked
on initial load, focus, page restoration and every 15 seconds. Expiry/revocation
removes the workspace and requests login. Reloads retain valid sessions. Logout
revokes the backend session before clearing the cookie; failure remains visible
and is never presented as successful logout.

Compose now publishes the frontend on loopback only, as the API/database already
do. Production HTTPS, trusted TLS termination and host/origin configuration need
a separate deployment review. Backend login limits apply to the frontend server's
shared IP; operational proxy/rate-limit tuning remains outstanding.

## Unavailable screens

Authentication, identity, workspace access and logout are connected. The Admin
Organisation overview and Members directory now use real backend data; see
[admin directory validation](admin-directory-validation.md). Other business
screens show **This screen is not available yet**, retaining navigation
without sample balances, member names, transactions, approvals or success toasts.
Backend CRUD alone does not establish a complete UI workflow or approved rules.

Registration now submits pending applications without creating login accounts;
see [registration operations](registration-operations.md). Recovery, email
verification and initial password setup still show
unavailable states, without accepting fake submissions or promising email.
Older `/portal/member/login` and related account URLs redirect to the public
account pages. Unsupported business rules remain unconfigured.

## Repeatable validation

```powershell
npm test
npx tsc --noEmit
npm run build
docker compose -p isave-browser-auth -f compose.auth-test.yaml up -d --build
$env:PLAYWRIGHT_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
docker compose -p isave-browser-auth -f compose.auth-test.yaml down
```

Use a fresh disposable stack for each complete browser run. It has its own
network, memory-backed `isave_test_browser` database and loopback ports
13000/18000; it never mounts `i_save_postgres_data`. Fixtures refuse other database
names and generate synthetic passwords in memory. They never use the office
administrator. Browser traces/videos/automatic screenshots are disabled; test
artifacts are ignored by Git.

- **20 frontend tests passed**, covering direct URLs, role isolation, cookie/CSRF
  controls, expiry, unavailable states and logout failure semantics.
- Production build and TypeScript check passed. Before/after Chrome screenshots
  confirmed the existing login design was retained.
- **6 Chrome tests passed** against Docker frontend/API/PostgreSQL: login/logout
  for all roles, reload, cross-role refusal, direct backend member ownership and
  permission denial, HttpOnly/no web-storage tokens, PostgreSQL revocation,
  actual database expiry, login errors and unavailable account workflows. Token
  replay returned 401 after logout; database checks confirmed revocation.
- **82 backend authentication tests passed on isolated PostgreSQL**, including
  canonical workspace/unknown-role checks. The upstream TestClient warning remains.

No test accounts/business rows were inserted into the existing database. Nothing
was pushed or merged. Invitations/recovery, account activation, business UI integration
and unresolved financial/activation rules remain outstanding. See the earlier
[backend activation record](authentication-activation.md).

## Local activation

The reviewed images are active in the existing Compose stack. All three services
are healthy; login is available at `http://localhost:3000/login`, bound to
loopback. A final Chrome check on that application confirmed all four anonymous
workspace URLs redirect to login and an invalid login traverses the bridge/API/
database and displays the expected HTTP 401 error. The real administrator's
credentials were not requested or used in automation. Successful login/logout
for every role was verified only on the isolated PostgreSQL stack above.

The existing database remains at revision 0003, with its one administrator and
zero member rows preserved. No new migration or bootstrap ran. The disposable
browser stack was removed without deleting any existing volumes. No new business
records were created in the operational development database; the invalid-login
check naturally recorded authentication throttle counters.
