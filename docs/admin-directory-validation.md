# Admin overview and member directory

The Organisation overview and Members screens retain the dark/green portal shell.
They are read-only. No database migration, member creation, business-rule defaults
or financial calculations are part of this change.

The overview counts actual member records, member records with/without a linked
login account, and all login accounts (including administrators and inactive
accounts). An account link does not imply approval, activation or payment.
These counts come from one SQL statement. Failures are shown as errors, never zeros.

`GET /api/v1/admin/overview` requires both `members:read` and `users:read`.
`GET /api/v1/members/page` requires `members:read`, with `q` (up to 100 characters),
`skip` (nonnegative) and `limit` (1–100). It returns `items`, filtered `total`,
`skip` and `limit`, ordered by member ID. The original list response is unchanged.
Search matches name/full name, member number, email or phone, case-insensitively;
SQL parameters and escaped wildcard characters keep search literal.

The same-origin frontend bridges only `/api/admin/overview` and
`/api/admin/members`, using the HttpOnly session cookie as the backend bearer
credential. It permits only the documented query keys and GET requests. The
backend checks permissions on every request, including individual denials.
Private responses are not cached. Expiry triggers authentication refresh.

Members use a table on desktop and cards on mobile, explicit missing-contact
labels, filtered totals and bounded Previous/Next pagination. Empty datasets,
empty search results, loading, denied access and service errors have separate
states. No sample names, balances or simulated success actions are displayed.

Validation uses `compose.auth-test.yaml` with memory-backed PostgreSQL and an
exact database-name guard before fixture writes. Backend regression tests use
another `isave_test_` database in that isolated stack. Browser tests cover all
roles, permission denials, populated and empty records, search, pagination,
mobile overflow, expiry, logout and database session revocation. Screenshots
contain synthetic records only and remain in ignored `test-results`.

Validation on 19 October 2026: 95 backend tests passed on isolated PostgreSQL,
29 frontend tests passed, TypeScript and Docker production builds passed, and
7 Chrome end-to-end tests passed. The existing TestClient/httpx deprecation
warning remains. Existing office data was not used as test fixtures.

The final browser run also passed after changing navigation to wait for the
document plus explicit UI assertions, avoiding an intermittent full-load timeout.
Desktop/mobile screenshots were reviewed; the mobile menu was checked after its
transition and the page had no horizontal overflow. The disposable stack was
removed afterwards without touching the office volume.

The rebuilt frontend/backend are active locally at `http://localhost:3000`.
All three existing services are healthy. Office counts before and after remained
one login account and zero member records at revision `0003_authentication`.
Readiness returned 200, both new private API reads returned 401 anonymously,
and an anonymous Admin Members URL redirected to login. Actual administrator
credentials were not used by automation. No push or merge was performed.
