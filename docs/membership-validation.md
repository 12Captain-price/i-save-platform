# Membership workflow validation — 19 October 2026

Implemented and activated locally, without pushing or merging. See
[workflow operations and policy boundaries](membership-activation.md).

## Automated validation

These counts describe the earlier fee-gated activation revision, not a fresh
full-suite run after Mailpit integration. See the [Mailpit suite-count
clarification](local-invitation-email.md#backend-suite-count-clarification) for
the later targeted 141-test run and guided replacement verification.
The subsequent [full backend regression](local-invitation-email.md#full-backend-regression-follow-up--20-october-2026)
passed **all 256 current tests**, with zero failures/errors/skips and original
exit status 0, against isolated PostgreSQL. Historical counts below are retained
as evidence for their original revisions.

- Complete backend suite: **240 passed**, using a dedicated `isave_test_*`
  PostgreSQL database. Migration lifecycle tests also exercised SQLite and
  temporary PostgreSQL databases, fresh/repeated upgrades, legacy preservation,
  constrained permission grants and guarded downgrade.
- Final affected backend run: **37 passed**, including four additional
  inappropriate-role override denials and concurrent invitation consumption.
  These overlap the complete suite; they are not 277 unique tests.
- Frontend: **57 passed**; TypeScript `tsc --noEmit` passed; production Docker
  frontend/backend builds passed.
- Complete Chrome browser suite: **15 passed**, against disposable tmpfs
  PostgreSQL in project `isave-browser-auth`, never the office volume.

Coverage includes unauthenticated and ungranted actions, Member/Finance role
boundaries, independent record/verify permissions, one Staff actor holding both,
strict acknowledgement/version, spoofed actor fields, missing/unverified fees,
invalid amount/currency/future payment dates, conflicting and repeated receipts,
case-insensitive legacy-reference conflicts, existing-account reconciliation,
repeated and concurrent approval/activation, exactly one payment/member link,
next-calendar-month timezone/year rollover and unset due date. Fee visibility
is member-scoped and fees never create contributions or increase savings.

Invitation tests covered missing provider, failed provider acceptance/rollback,
provider evidence, repeated request keys, hashed tokens, expiry, replacement
revocation, uniform invalid errors, single-use including concurrent consumption,
password policy, login and logout. No real email provider was contacted.

The browser exercised public category selection/submission, protected review,
same-employee recording and verification, disabled approval prerequisites,
keyboard acknowledgement, explicit activation, unavailable delivery, synthetic
private setup, member login and actual paid-fee display. A lost payment response
was simulated **after** server commit; entered fields survived and retry retained
one payment. Mobile 390px and desktop layouts retained the dark-and-green design,
with no horizontal overflow on the mobile review and no invented balances.

## Existing PostgreSQL database

Stopped frontend/backend writers before the dump. Private backup retained outside
the checkout, with inherited Windows access removed and one explicit owner rule:

`C:\Users\HP\isave-backups\membership-20261019T202210Z\pre-membership-0007.dump`

SHA-256 (host and container matched):

`8314e6033c3501a2e3150b03b2a7b7de8a02a57a34407bb81b0fcef061a9d3b1`

Restored with `pg_restore --exit-on-error` into the separately retained
`isave_recovery_membership_20261019t202210z`. Compared row fingerprints/counts,
columns/defaults, primary/foreign/unique keys and indexes for all **21 original
tables**, then upgraded the recovery copy to 0007 and compared again. Only the
five specified capability entries and canonical Admin grants were allowed as
additions; existing permission rows/grants/denials were retained.

Applied 0007 to the existing database only after successful restore rehearsal,
then repeated schema and original-data preservation checks. Backend/frontend
were rebuilt and restarted and are healthy. Verified readiness, public pages,
anonymous API/bridge denials and that all three new workflow tables contain no
synthetic operational records. No original rows or table structures changed;
no volume was deleted and migration history was not force-stamped.

## Outstanding

Email delivery remains explicitly unavailable: an approved provider adapter,
sender, credentials, HTTPS setup origin and provider idempotency are required.
The browser setup test issued a fixture token only inside isolated synthetic
PostgreSQL; it did not claim email delivery or create an office member.

Refund handling and the subscription due day remain unavailable/unconfigured.
Only the initial next-month US$5 subscription is scheduled here; recurring
monthly generation remains future work. No identity-document, additional
eligibility or formal savings-plan rules were invented. Production rollout,
provider integration and organisational UAT remain separate work.
