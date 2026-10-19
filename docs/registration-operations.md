# Pending public registration — 19 October 2026

Staff-assisted submission and its separate permission, consent/provenance and
local activation are documented in [assisted registration](assisted-registration.md).

`/register` submits a persisted membership application, not an account signup.
It asks for name/email and optional phone, address and reason. It never collects
a password, payment, identity document or invented policy acceptance.

## Data and access boundaries

- `POST /api/v1/registration` validates a strict public schema and assigns the
  application number and `Pending` status on the server. Member/reviewer/role
  IDs and status/password fields are rejected. No user, member, fee, savings
  entry or privilege is created or changed.
- Emails are trimmed/lowercased. A database primary key on a hashed email reserves
  each public submission atomically, in the same transaction as application and
  initial history creation. Concurrent retries cannot create two applications.
  Existing applications and login accounts are not duplicated. Repeated requests
  do not overwrite original details. No automatic resubmission after rejection
  or account provisioning is configured; contact the office for corrections.
- New, duplicate and existing-account requests all receive the same HTTP 202
  acknowledgement, without email, account state, application number or ID.
  There is no public application lookup. Validation errors disclose no account
  existence. Registration attempts are limited to 10 per IP per 15 minutes,
  including duplicates. The local frontend bridge shares an upstream IP;
  production rate-limit/proxy tuning remains a deployment requirement.
- The frontend exposes one exact same-origin POST bridge, checks Origin and a
  custom header, bounds request size, forwards no browser cookies/credentials,
  and does not forward upstream error details. Private reads use the existing
  HttpOnly session bridge, fixed paths, deadlines and no-store responses.
- Staff `/portal/staff/registrations` and Admin `/portal/admin/registrations`
  provide search, offset pagination and a detail view with recorded history.
  Backend `/applications/page` and `/applications/review/{id}` both require
  `applications:read` on every request. Member ownership permission does not
  grant global review access; individual denials override role permissions.
  A role's URL or frontend visibility never grants a backend permission.
- Review is read-only. Application decisions, fee verification and activation
  remain unconfigured. Viewing a record does not change status or payments.

## Migration and rollback

`0004_pending_registration` adds `registration_submissions` and
`application_events`. It does not alter original tables or their rows. Existing
applications receive a migration-time snapshot of their recorded status, with a
note that earlier transitions are unavailable. It does not invent earlier dates
or decisions. New applications receive an initial recorded event in the same
transaction. Authenticated internal creation/legacy decision service events use
the session actor; the policy-gated decision HTTP endpoint remains disabled.

Back up and restore-test before upgrading an existing database; follow
[database operations](database-operations.md). Never baseline or stamp an already
tracked database. Downgrade refuses to discard populated registration/history
tables. Use a verified backup and a reviewed recovery procedure for rollback;
do not overwrite newer records without reconciling them first.

## Validation and local activation

- **158 backend tests passed** on isolated PostgreSQL, with SQLite and PostgreSQL
  migration checks: fresh/repeated upgrades, preserved legacy rows, honest
  history snapshots, populated downgrade refusal and concurrent duplicate
  submissions. Permission/ownership and policy-gate regressions passed.
- **38 frontend tests passed**, TypeScript passed, and both Docker production
  images built. The existing TestClient/httpx deprecation warning remains.
- **8 Chrome browser tests passed** through Docker frontend/API/PostgreSQL.
  Public submission was persisted as Pending, duplicate/existing-account
  acknowledgements matched, and no account/member/fee rows were created.
  Staff and Admin searched/paginated and opened status history. Empty search,
  anonymous denial, CSRF refusal, session expiry, logout/revocation and the
  existing directory checks passed. Synthetic desktop/mobile screenshots were
  reviewed; forms/review screens had no horizontal overflow.
- Fixtures used only the disposable memory-backed `isave_test_browser` database
  and separate `isave_test_*` regression databases. Exact name/prefix guards
  prevent fixture writes to the office database. Nothing was test-submitted
  through the office application's public endpoint.

Private pre-upgrade backup:
`C:\Users\HP\isave-backups\registration-20261019T161636Z\pre-registration-0004.dump`.
SHA-256: `8a0ac2d2bdc096e5ebdae4395edd182dec6df111ea42410857b8ee1719716803`.
Application writers were stopped first. The saved Windows archive was verified
byte-identical to the archive restored into
`isave_recovery_registration_20261019t161636z`. All 17 original application tables
matched in row contents/counts, columns, keys and indexes. Migration 0004 was
rehearsed on that restored database before upgrading the office database.

The recovery database is retained separately. The dump is outside Git in a
Windows directory restricted to the current user. No volume was removed,
migration history force-stamped, credential printed, push or merge performed.

The local application is active at `http://localhost:3000`, revision 0004; all
three services are healthy. The office database still contains one account and
zero members, applications, submission reservations, history events or fees.
`/register` returns 200; anonymous review APIs return 401 and Staff/Admin review
URLs redirect to login. All original table comparisons passed again after the
migration. The disposable test stack was removed after validation.

Remaining: approved registration identity/fee/activation policy, invitations and
recovery delivery, production privacy/retention and deployment review. There is
no automated approval, activation, billing or email promise in this feature.

## Applicant guidance and approved public contacts

The owner supplied the approved public contacts on 19 October 2026. The single
configuration is `src/lib/public-contact.ts`: office landline +263 29 226 1341,
Director +263 78 552 1029, additional contact +263 78 663 9536,
zpyfinfo@gmail.com, and 5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe.
Preserve the spelling **Yolk House**. Phone/email links use `tel:`/`mailto:`;
no number is labelled WhatsApp and no office hours are asserted.

The former Harare address in the demo configuration and Eligibility page was a
conflicting placeholder and has been replaced. No conflicting address was found
in the checked-in Markdown documents. Review any external or printed material
against the owner-approved address before reuse. Demo contact/content defaults
now derive from the shared configuration; the public Contact card does not read
editable prototype contact state. The unconnected Contact form was replaced with
direct contact guidance, so the website cannot claim a message was sent.

Registration explains required/optional information and offers help before the
form. HTTP 202 replaces the form with a focused **Application received** status
panel, the pending-review disclaimer, three next steps and approved follow-up
contacts. New and duplicate responses render the same panel. No reference is
displayed because the public API deliberately returns none. There is no promise
of a deadline, email delivery, approval, activation or payment confirmation.

Failures keep all entered values, focus the error panel and offer safe retry.
Even when the server committed before a response was lost, the existing atomic
duplicate protection prevents another application. The API, Admin review and
financial/policy gates are unchanged. This UI change needs no migration.

Applicant-experience verification: **40 frontend tests**, TypeScript, production
builds and **10 browser tests** passed. Browser checks used isolated synthetic
PostgreSQL records, keyboard-only form/retry navigation, focused error and
confirmation panels, 390px mobile layout and desktop screenshots, approved
contact links and duplicate acknowledgement. A lost-response test let the server
commit before aborting the browser response: entered details survived, retry
returned confirmation, and the database still had exactly one application and
one history event. The updated frontend is active locally; existing office
records/schema were not migrated or used as test data. Nothing was pushed or
merged.
