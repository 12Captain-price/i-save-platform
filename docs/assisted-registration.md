# Staff-assisted pending registration

Staff/Admin users with `applications:assist` see **Assist an applicant** in the
application list. The validated `/portal/{staff|admin}/assist-registration` screen
reuses the public registration form, fields, savings-category cards, confirmation
and approved office contacts. Staff must check details with the applicant and
obtain their authorisation before submitting. No plan terms are accepted.

## Authorisation and permissions

- `POST /api/v1/registration/assisted` requires a valid, active session, a
  canonical Staff/Administrator role and the specific `applications:assist`
  permission. Members/Finance cannot use it even with a misplaced grant.
  Staff review or generic application-write access does not imply this capability.
- Migration 0006 creates the permission catalog entry and grants it only to the
  existing canonical administrator role. Fresh bootstrap includes it for Admin.
  Staff templates remain read-only. An administrator must explicitly grant it
  using the existing protected role-grant or individual-override API, for example
  `POST /api/v1/roles/{staff_role_id}/permissions/applications:assist` or
  `PUT /api/v1/users/{staff_user_id}/permissions/applications:assist` with
  `{"allowed":true}`. Those operations revoke affected sessions; sign in again.
  Individual denial remains authoritative. No Staff grants were made to office
  accounts during implementation.
- The acknowledgement is required and starts unticked. Its shared wording/version
  is in `backend/app/assisted_authorization.json`. The API requires a strict JSON
  boolean `applicant_authorized:true` and the current `authorization_version`.
  Missing/false/string/numeric consent, stale versions and extra actor, source,
  wording or timestamp fields are refused. Word the acknowledgement as a staff
  attestation; it does not establish identity checks or verified legal consent.
- The server derives the actor from the authenticated session. Throttle counters
  commit independently, then account/session locks and a fresh permission/expiry/
  revocation check protect the save transaction. The browser never selects an
  actor. Assisted requests are limited per staff account to 10 per 15 minutes.
- The exact same-origin `/api/registration/assisted` POST bridge requires the
  HttpOnly session cookie, Origin match and custom request header. It forwards
  only its own cookie-derived bearer header, bounds body size, uses fixed paths
  and deadlines, and returns generic errors/no-store responses.

## Persistence, source and duplicate privacy

The same atomic email reservation protects public and assisted submissions.
A new request saves a **Pending** membership application, initial status event,
optional separate savings-interest snapshot and `application_submissions` record
in one transaction. Assisted provenance stores `staff_assisted`, staff account ID
and email snapshot, the acknowledgement boolean, exact wording/version and
server timestamp. No account, member, fee, payment, plan enrolment or approval is
created. Public requests now record `public` provenance without staff consent.
Historical applications are not backfilled: absent provenance displays
**Not recorded (legacy application)**.

Consent records the first successful application submission. Retried/duplicate
requests neither overwrite that consent/actor/time nor append another application,
interest or history event. New, duplicate and existing-account requests return the
same generic 202 acknowledgement without record IDs or existing details. A user
with assisted permission but no review permission can submit blindly; both review
listing and detail remain forbidden. Confirmation shows only the current request
and optional current category, never a retrieved existing preference.

Protected review requires `applications:read` independently. Detail displays
source, the staff identity, consent wording/version/time and unchanged interest
snapshot. Initial status history identifies staff-assisted submission, its consent
version and authenticated staff identity. Email snapshots retain a historical
identity if an account is later changed or deleted. No staff identity appears in
public acknowledgements or member-only detail responses.

## Migration and recovery

`0006_assisted_registration` adds the provenance table and exactly the new
permission/admin grant. It retains all prior business/security rows, role grants
and individual denials. It does not infer source/consent for old applications.
Downgrade refuses to discard populated provenance; an empty downgrade retains the
permission catalog/grants to avoid erasing later administration. Rollback requires
a reviewed recovery/roll-forward plan; never overwrite newer records blindly.

Before the office upgrade, writers were stopped and a private backup saved at:
`C:\Users\HP\isave-backups\assisted-20261019T192859Z\pre-assisted-0006.dump`.
SHA-256: `aef34b0a1e42201502efa886a3bfa3379802d88eb960432724e8b6fd18a75c41`.
Its Windows copy matched the restored archive bytes. Restore into
`isave_recovery_assisted_20261019t192859z` and migration rehearsal passed.
The preservation check compares all 20 original tables' existing row contents,
counts, columns, keys and indexes; only the specific new permission and canonical
Admin grant are allowed additions. No prior permission or override is changed.
The recovery database and private backup/checker are retained separately.

## Validation

- **198 backend tests passed**, using isolated PostgreSQL plus SQLite/PostgreSQL
  lifecycle checks. Coverage includes permission/role denial, strict/stale consent,
  actor spoofing, snapshot persistence, source/history, blind duplicates, immutable
  original actor/consent, cross-channel retries, revoked sessions (including
  revocation during throttling), migration preservation and protected downgrade.
- **52 frontend tests passed**, TypeScript and production builds passed. Form
  tests cover unticked consent, required validation, preserved retry details and
  consent, session/permission errors, provenance display and the cookie/CSRF bridge.
- **13 Chrome tests passed** on disposable frontend/API/PostgreSQL. The assisted
  test simulates a lost response after commit, retries safely and verifies one
  pending application/history event with the authenticated actor and interest.
  Staff/Admin review, mobile keyboard consent, desktop/mobile layout, member/
  finance/unpermitted-staff denial, actor spoofing and submit-only privacy passed.
  Screenshots contain synthetic data only; traces/videos remain disabled.

The existing TestClient/httpx deprecation warning remains. Fixtures use exact
`isave_test_browser` or guarded `isave_test_*` databases on the disposable stack.
No office synthetic records, credentials in output, volume deletion, force stamp,
push or merge were involved. Approved fee/activation policy and email delivery
remain unconfigured; the feature makes no promise of approval, payment, login
creation, email delivery or a review deadline.

The reviewed images are active locally at `http://localhost:3000`, schema 0006.
All existing rows/structures across the 20 original tables passed comparison
again after upgrade. Only the new permission/catalog Admin grant were added.
Readiness returned 200; anonymous assisted POST/review returned 401 and both
assisted portal URLs redirected to login. The provenance table remains empty in
the office database: no synthetic assisted/public records were submitted there.
The disposable test containers/network were removed after validation; the
existing PostgreSQL volume and private recovery copy were preserved.
