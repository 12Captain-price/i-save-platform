# Admin savings-plan drafts

This is configuration drafting, not policy approval. Open **Admin → Savings
plans**. All saved versions remain **Unpublished draft**, unavailable for
enrolment. Nothing is seeded. Savings-category expressions of interest remain
independent records; no interest is converted into a plan or enrolment.

Canonical administrators need `plans:drafts:read` to list/read history and
`plans:drafts:write` to create/revise. Staff, finance and members are denied,
including users with accidental individual grants. Existing `plans:write`
does not grant these capabilities. Migration 0008 grants the two capabilities
only to the existing canonical administrator role, preserving existing grants
and overrides. Every request checks the authenticated session; actor IDs are
never accepted from the form.

Draft configuration includes category, description, three-letter currency,
fixed/member-chosen contribution amount, optional minimum/maximum, weekly
cadence, fixed weeks/open-ended duration, and proposed rules for missed/extra
contributions. All fields may be undecided. Positive amounts have at most two
decimal places; minimum cannot exceed maximum, a fixed amount must fit supplied
limits, and open-ended duration cannot have a fixed week count. These are
structural checks, not approved amounts, currencies or business rules.

The form identifies missing configuration decisions. Completing these fields
does not approve policy. The rule text is retained as a proposal and is never
executed. Publication, plan approval, acceptance, enrolment, financial posting,
penalties, billing, withdrawals and returns have no new actions in this feature.
Currency/amount/eligibility and all detailed terms still need owner approval.
The referenced source requirements are listed in the delivery roadmap; the
original uploaded documents are not present in this checkout for rereading.

`plan_drafts` identifies a draft; `plan_draft_versions` stores append-only
snapshots, version number, authenticated actor ID/email and timestamp. The
general audit log records each create/revision. The API offers no history
update/delete or publish endpoint. These tables have no link that could create
a `savings_plans` offer or `member_plans` enrolment. Existing legacy plan APIs
continue to read only their original table.

Each save has a UUID request key and expected base version. Exact retries
return the original result without creating another version or audit event.
Changed payloads using the same key and stale edits return conflict. PostgreSQL
locks serialise concurrent saves. After uncertain delivery the form retains the
same payload/key for retry and prevents edits until the save is resolved. A
conflict requires reloading the latest draft; this explicitly discards unsaved
form edits. Server/browser errors do not display a saved confirmation.

Migration `0008_plan_drafts` creates only two tables/indexes and adds two
permission catalog entries/Admin grants. It does not change business records.
Rollback refuses retained draft or downstream membership/application history;
use reviewed recovery instead of deleting history or force stamping.

## Validation

Validation uses `compose.auth-test.yaml`, project `isave-browser-auth`, with
tmpfs PostgreSQL and guarded `isave_test_*` databases. Synthetic accounts,
amounts and rule proposals exist only there, never in the normal database.

On 20 October 2026:

- Final full backend suite: **295 passed, 0 failed, 0 skipped**, exit status 0.
  `ISAVE_TEST_DATABASE_URL` selected `isave_test_drafts` on the disposable
  PostgreSQL server; `TEST_POSTGRES_URL` enabled temporary PostgreSQL lifecycle
  databases as well as the SQLite migration variants. The original pytest exit
  status was captured immediately and returned by the PowerShell command.
- Frontend: **70 passed**, TypeScript `tsc --noEmit` passed and the production
  client/server Docker build passed.
- Browser: **22 distinct cases passed across regression/affected runs**;
  **3 opt-in Mailpit cases skipped** (invitation delivery is outside this scope).
  The last all-files run had 21 passes, 3 skips and one draft case that exposed
  unstable filled-textarea naming. After correcting the names, the final
  `playwright test e2e/plan-drafts.spec.ts` run passed **4/4**, covering that case
  and all three access restrictions. This is not a claim that a final all-files
  run was repeated. Remaining test-harness assumptions were corrected: select
  the save acknowledgement specifically while a loading status also exists,
  and compare existing synthetic business rows instead of assuming empty
  legacy plan/enrolment tables.
- Backend coverage includes anonymous/non-Admin denial, accidental grants,
  each required Admin permission, spoofed actors, invalid/contradictory fields,
  incomplete drafts, fixed/member-chosen amounts, fixed/open duration,
  exact retry, changed-key conflict, stale/concurrent edits, authenticated audit,
  version retention, pagination, public-offer exclusion and no financial or
  interest/enrolment side effects. Migration tests verify preserved legacy rows,
  Admin-only grants and refusal to discard retained history.
- Frontend checks cover read-only/denied access, no seeded values, failed saves
  retaining details, identical retry bodies and fixed-path/CSRF/session proxying.
- Browser draft coverage traverses browser → BFF → backend → PostgreSQL, with
  mobile/desktop layouts, keyboard entry, incomplete save, simulated committed
  response loss and exact retry, refreshed version history, missing decisions,
  member/staff/read-only denials, CSRF and nonexistent publication routes. Row
  fingerprints for existing synthetic plans, enrolments, contributions,
  interests, fees and subscriptions and public legacy plan responses remain
  identical before/after. No outstanding failing assertion remains in the
  affected checks. Human screen-reader review remains outstanding.

The first full backend pass was 293 tests, before adding the two migration race
variants. Their initial fixture incorrectly invoked initial-admin bootstrap on
already granted roles; the bootstrap correctly refused. The fixture was fixed
without weakening bootstrap. Browser checks found and fixed explicit select
labels and network-error retry guidance; the final browser result is below.

## Existing database protection and local deployment

Writers were paused before fingerprinting and backup. The private backup is
`C:\Users\HP\isave-backups\draft-plans-20261020T052652Z\before-0008.dump`,
outside Git, with restricted Windows directory permissions. SHA-256:
`4e8f6f5d55ab54014b34e36a98b10e7d173d8be289519bc0c366c80fd00e92b5`.
The container archive and copied archive checksums matched.

The archive was restored with `pg_restore --exit-on-error --no-owner` into the
new `isave_recovery_drafts_20261020_052652` database. All 24 original tables'
rows, columns, constraints and indexes matched the pre-backup fingerprint.
Migration 0008 was rehearsed there and the comparison passed again, allowing
only the two known permission entries and canonical Admin grants.

Only after successful recovery/rehearsal was 0008 applied to the normal database.
The same 24-table preservation comparison passed before and after restart.
The required Alembic revision/readiness checks passed; both new draft tables
were empty. No synthetic data, proposed amounts or rule examples were added to
the normal database. Normal frontend/backend/PostgreSQL and localhost-only
Mailpit were restarted healthy, preserving the existing Mailpit configuration.
Final read-only smoke checks passed for frontend response, backend readiness
and anonymous denial at both the backend and browser draft endpoints. The
24-table preservation check passed again after the final frontend deployment.
Only the disposable `isave-browser-auth` validation stack was then stopped and
removed, without volume deletion; the normal four services remained healthy.
The recovery copy and private backup are retained for acceptance. No volumes,
history or original records were deleted or force stamped.

## Remaining limits

No organisational plan policy is approved by this implementation. A complete
draft still cannot be published or enrolled. Formal policy approval, accepted
terms, enrolment and all operational financial workflows need their own future
scope and owner decisions. Browser automation does not replace human
screen-reader usability review. Backend tests have one existing Starlette/httpx
deprecation warning; builds have existing tooling/chunk warnings, no failures.
No production deployment, push or merge was performed.
