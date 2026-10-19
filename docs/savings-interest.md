# Savings category expressions of interest

The five known categories are Asset, Holiday, Emergency, Retrenchment and
Education. Registration offers five accessible radio cards, each with an icon,
descriptive purpose and a visible selected state. Selection is optional so a
membership application does not require a plan choice. Clearing a choice is
supported. Keyboard users can select using the native radio arrow keys.

The selected information says **Expression of interest—plan terms awaiting
confirmation.** Contribution amount, currency, frequency, duration, fees and
detailed rules are awaiting approval. No numbers or rules are invented and no
terms-acceptance checkbox is shown. The shared public configuration lives in
`backend/app/registration_options.json`, included explicitly in the frontend
build; other backend files remain excluded from that Docker context.

## Separate records and privacy

Migration `0005_savings_interest` adds a separate `savings_interests` table. It
does not modify membership applications, members, accounts, plans, financial
rows or historical registrations. Existing registrations acquire no inferred
preference. An optional new interest is saved atomically with the pending
membership application and its history. It records the category, label, purpose,
information version and exact pending-information notice snapshot, plus recording
time. **These are information snapshots, not accepted plan terms.** No acceptance
date, plan approval, enrolment or payment is recorded.

The strict public schema permits only the five categories and requires the
current information version when a category is supplied. Unknown/stale versions,
unknown categories, fabricated acceptance fields and inconsistent payloads are
rejected. Version the information file whenever its meaning changes; old
snapshots remain unchanged. There is no interest-edit or decision endpoint.

Duplicate registration responses remain generic. They neither reveal an earlier
interest nor overwrite it. Confirmation shows only the preference supplied in
the current submission, explicitly labelled as such; it never claims to retrieve
or change an existing record. Staff/Admin detail shows the saved category and
historical notice/version under the existing `applications:read` permission.
Member ownership permissions do not grant global review access.

## Formal plan applications remain unavailable

Approved financial terms do not exist yet. Merely changing public descriptions
must never enable acceptance, approval, activation, fees or enrolment. A later
formal-plan workflow needs approved versioned terms, a separate plan-application
record, explicit unticked acceptance tied to an immutable terms snapshot, and
server-controlled transitions. It should allow members to request additional
plans without resubmitting membership registration. An expression of interest
must not silently become formal acceptance or approval.

Back up and restore-test before applying migration 0005 to an existing database.
Its downgrade refuses to remove populated interests. No force stamping or volume
deletion is part of activation. Use isolated synthetic data for tests.

## Local activation — 19 October 2026

The private pre-0005 archive is
`C:\Users\HP\isave-backups\interest-20261019T185703Z\pre-interest-0005.dump`.
SHA-256: `3fe84ab8ee3623144615c5d65004a5c9a3ff3b28a3a3574f0b31f71bf9de002c`.
Application writers were stopped first. The Windows copy matched the restored
archive byte for byte. Restore into
`isave_recovery_interest_20261019t185703z` matched all 19 original application
tables in row contents/counts, columns, keys and indexes. Migration 0005 passed
on that restored copy before it ran on the office database. The same original
table comparison passed before and after the office upgrade. The recovery copy
and private Windows backup are retained; no volume or existing record was removed.

Full backend validation passed **170 tests**, including PostgreSQL and SQLite
migration checks, all five categories, optional old submissions, stale/unknown
versions, rejected fabricated acceptance, duplicate immutability, permission
checks and protected downgrade. **41 frontend tests**, TypeScript and Docker
production builds passed. The existing TestClient/httpx deprecation warning
remains. Tests used synthetic data in separate disposable PostgreSQL databases.

All **10 Chrome browser tests passed** against the isolated frontend/API/
PostgreSQL stack: five visible cards and selected state, keyboard radio choice,
pending-information display, saved category/version in Staff/Admin review,
generic duplicates and lost-response retry with one registration/history event.
Mobile cards and review screenshots were inspected. The test-only direct click
on a visually hidden radio was corrected to click its visible card; keyboard
selection was verified separately. No office test records were inserted.

The local application runs at `http://localhost:3000`. Formal plan applications,
terms acceptance, activation and payment verification remain unavailable. No
push or merge was performed.
