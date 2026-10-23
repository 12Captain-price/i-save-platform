# Organisation settings foundation

The subsequent [recurring subscriptions and financial reporting milestone](recurring-subscriptions.md) adds monthly catch-up generation, explicit subscription separation, operational queues and source-reconciled reports. Earlier statements below about recurring generation being unavailable describe the prior milestone. See the new report for current activation and validation status.


The subsequent [savings contributions and reconciliation milestone](savings-contributions.md) introduces ledger-backed, currency-separated confirmed savings. Legacy Verified contribution rows do not count as reconciled savings. Registration fees and subscriptions remain separate; existing amounts, obligations and accepted terms are unchanged.

The subsequent [fee currency extension and isolated rehearsal](fee-currency-and-settings-rehearsal.md)
adds explicit obligation freezing before converted payment, versioned USD-to-ZiG
rates and separate subscription settlement. Registration fee/review settings now
pin when that obligation is created; native recording can create it atomically
for compatibility. Existing obligations and payments remain unchanged. The
extension was activated on the normal database at migration 0010 on 21 October
2026 after a fresh normal backup, separate restore rehearsal and preservation
checks. Rate 34 remains unpublished there; synthetic rate 35 is confined to the
rehearsal. Historical source evidence is unchanged and status is displayed separately.

Open **Admin → Organisation settings**. This controls the working features
listed below; it is not a general feature-enablement panel. Values are business
configuration, not secrets. Plan drafts, category interests and enrolments
remain separate.

## Configuration inventory and consumption

| Setting | Preserved baseline | Working consumer / scope of a published change |
| --- | --- | --- |
| Public contacts | Office: 5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe; zpyfinfo@gmail.com; office +263 29 226 1341, director +263 78 552 1029, additional +263 78 663 9536 | Public Contact cards, registration help, submission follow-up and password-setup help read the currently effective published contacts. Phone/email links remain clickable. No WhatsApp label, office hours or delivery claim is added. |
| Registration fee | 20.00 USD | The first recording of a pending application's payment selects and pins the effective fee and review settings. This also applies to an older application with no recorded payment. The payment must match the pinned amount/currency to be verified and approved. Existing recorded payments retain their original gate; they are never repriced, duplicated or counted as savings. |
| Monthly subscription amount/currency | 5.00 USD | Future activations create their first obligation using the effective settings at activation. Existing obligations retain their amounts/currencies. This does not add a recurring billing generator. |
| Subscription start rule | Calendar month following activation | This remains the only supported start rule. Existing recorded activation/start months are not recalculated. Other rules cannot be published. |
| Optional subscription due day | Unset | Future activation obligations may record days 1–28. Blank stays unset. Days 29–31 remain unsupported pending an approved short-month rule; no rule is invented. Existing due dates are not changed. Unapproved legacy dates remain suppressed in the member portal, as before. |
| Existing membership-review requirement | Mandatory verified fee and explicit reviewer acknowledgement; `membership-review-v1` wording | The configured wording is pinned with the first payment recording. Approval rechecks the pinned acknowledgement version server-side and persists the exact wording/version on approval. The fee gate and acknowledgement cannot be disabled. A fee change requires reviewing/updating the wording before publication. No identity-document or eligibility rules existed to migrate. |

The former contact constants remain only as legacy demo/test fixtures. Public
working screens now use `/api/public/contacts`, whose fixed server bridge calls
`/api/v1/public/contacts` without forwarding browser credentials. It returns
only effective public contact fields and version, never drafts or financial
configuration. Responses are not cached. Open contact sections refresh on focus
and every 60 seconds; navigation/reload fetches again. Failure shows an explicit
unavailable/retry state, not a stale hard-coded contact fallback.

The original sources were `src/lib/public-contact.ts`, hard-coded fee and
activation values in `services/membership.py`, and
`backend/app/membership_policy.json`. That last file contained acknowledgement
wording/version, not a configurable identity checklist. Existing payment,
subscription, application, approval and accepted plan/interest records are not
rewritten. The original review version is retained when the wording is unchanged.
Custom wording gets an organisation settings version identifier.

## Drafts, publication and dates

Separate Admin-only backend capabilities are `settings:read`, `settings:write`
and `settings:publish`. Existing generic plan/role/user permissions do not
replace them. Staff, finance and members are denied even if accidentally given
individual settings grants. Writers need read access to use this form; publication
can be delegated separately to another authorised administrator.

Saving appends a full draft snapshot with authenticated actor ID/email and time.
Incomplete drafts are permitted and missing decisions are listed in history and
the publication preview. Required contact, fee, start and review fields must be
configured before publication; the due day is optional. Positive two-decimal
amounts, uppercase three-letter currency codes, contact syntax and the supported
start/due-day options are validated. This is syntax/consistency validation, not
external verification of the organisation's contacts or policy approval.

The publication preview compares a saved snapshot with the currently effective
values, lists the effects on future records and excludes unsaved edits. Publication
is a separate explicit action on the latest saved version. Backdated and naive
timezone dates are rejected. Blank means immediately; a future date schedules
the version. Dates are stored in UTC and displayed in the browser's local time.
The latest publication whose effective time has arrived is selected on each
workflow read, without a background job. Scheduled publications must be strictly
ordered; inserting ahead of a pending publication, cancellation and deletion are
not implemented. Schedule a later revision to supersede a scheduled version.

Expected base versions and a global transaction lock prevent lost edits.
Publication rejects a stale head. Draft and publication request keys make exact
retries idempotent; changed payloads using the same key conflict. An uncertain
browser response preserves the exact pending request and disables edits until
retry resolves it. Conflicts require an explicit reload; the UI states that this
discards unsaved edits. No history update/delete endpoint exists.

`business_settings_versions` stores snapshots;
`business_settings_publications` stores publication actor/time/effective date.
`application_settings_snapshots` and `subscription_settings_snapshots` pin the
version used by new records. General audit events independently record draft
creation and publication. Existing approval/payment/activation audit events
remain distinct. Migration baseline rows have no fabricated staff actor and are
labelled **Preserved migration baseline**.

## Unsupported configuration

Withdrawals, refunds, returns, penalties, overdue consequences, automatic recurring
billing, additional subscription start rules, identity/eligibility rules, plan
publication and enrolment are not enabled by this screen. Savings remains
unavailable until a reliable reconciled ledger calculation exists. SMTP/provider
credentials, sender configuration, token expiry, session security, database URLs,
keys and infrastructure remain environment/operational configuration. Publishing
a public email address never configures or proves email delivery.

## Migration and validation

Migration `0009_business_settings` adds four tables and three settings permission
entries/grants for the canonical Admin role. It publishes only the frozen approved
baseline above, preserving an unset due day and original acknowledgement. It does
not update business rows. Downgrade refuses retained settings or downstream
history; never force stamp or delete records to bypass that guard.

Validated on 20 October 2026 using `compose.auth-test.yaml`, project
`isave-browser-auth`, tmpfs PostgreSQL and guarded `isave_test_*` databases:

| Run | Result / scope |
| --- | --- |
| Initial full backend | 321 passed, no failures/skips |
| Full backend with migration/concurrency variants | 323 passed, no failures/skips; PostgreSQL ordinary tests plus PostgreSQL/SQLite migration lifecycle variants |
| Final settings, membership and member overview suites | 68 passed, no failures/skips, after the protected review due-day consistency adjustment; includes an additional scheduled-fee workflow-consumption test added after the full run |
| Settings-only check before that final adjustment | 24 passed, no failures/skips |
| Browser regression + final affected rerun | 27 distinct cases passed across runs; 3 opt-in Mailpit cases skipped |

The last all-files browser run had 25 passes, 3 skips and two settings assertions
to correct: the preserved baseline's button says **Saved version already
published**, and the future-date test must compare with its own previously
effective contact instead of depending on a previous case succeeding. The final
settings browser file passed 5/5 on a fresh disposable database. It includes
keyboard/mobile/desktop use, committed response loss and identical save retry,
draft isolation, publication preview, actual public contact/help consumption,
new fee recording/verification/approval/activation and member Fees/Overview,
denied Member/Staff/publish-withheld Admin access, stale edits and scheduled
publication isolation. No final all-files browser rerun is claimed.

Backend tests verify individual permissions and canonical-role restrictions,
incomplete/invalid drafts, actor spoofing, unknown secrets/unsupported switches,
immutable versions/audit, retry conflicts, immediate/future effective dates,
publication races, preservation of existing rows during migration, prior fee
gates/accepted wording, future-record consumption and member-owned Fees
consistency. The final affected run includes all settings/membership/member
overview checks. The new scheduled-fee case was added after the 323-test full
run; these counts describe separate runs and are not additive. Each PowerShell
pytest command saved `$LASTEXITCODE` immediately, reported it and exited with
that same value (all successful runs above: 0).

Frontend: **77 passed**, TypeScript `tsc --noEmit` passed and production
client/server Docker builds passed. Publication uses a native form so keyboard
submission and native date validity checks apply. Field-specific validation
guidance is translated at the browser boundary without reflecting submitted
values or secret-like unknown fields.

## Backup and preservation evidence

Normal frontend/backend writers were paused before the archive and fingerprint.
The restricted private backup is outside Git:
`C:\Users\HP\isave-backups\organisation-settings-20261020T060444Z\before-0009.dump`.
Container and copied archive SHA-256 both matched:
`6ab5e3b2dcf49a3dd070d69be3069ded25ed0a758b9a493dea9f96a30351a3dd`.

`pg_restore --exit-on-error --no-owner` restored the archive into the new
`isave_recovery_settings_20261020_060444` database. All 26 original tables' row
fingerprints, columns, keys, constraints and indexes matched. Migration 0009 was
then rehearsed there and the same comparison passed, allowing only the three
known settings capability/Admin grants. Only after this was 0009 applied to the
normal database; the comparison passed again. The recovery copy and original
archive are retained for acceptance. No volume deletion, force stamping or
business-record rewriting was used. Synthetic changes were confined to the
disposable test environment.

After restart, all 26 original-table fingerprints still matched. The normal
database contained exactly one preserved settings version/publication with a
null migration actor and zero new application/subscription setting bindings.
The effective snapshot matched the approved baseline exactly, including the
unset due day. Read-only smoke checks passed for readiness, frontend response,
published contacts through the browser bridge and anonymous denial at both
private settings endpoints. Normal frontend, backend, PostgreSQL and local
Mailpit were healthy. No normal administrator password/session was used or reset.
The final settings browser rerun after native form/validation-message changes
passed 5/5 again, including Enter-key publication and explicit backdate rejection.
Only the disposable validation stack was stopped and removed afterwards, without
volume deletion. Normal services and the retained recovery copy remain available.

Human screen-reader review, broader policy approvals, days 29–31 short-month
handling, publication cancellation, recurring billing and external email
delivery remain outside this foundation. There is one existing Starlette/httpx
deprecation warning in backend tests and existing frontend build-tool warnings.
No production sending, push or merge was performed.
# Current extension: private registration documents

See [registration documents and plan enrolment](registration-documents-enrolment.md) for the published requirement controls and submission-time snapshots. Existing settings/history remain unchanged; old versions read with unenforced document defaults. Retention can remain unset, and configuring a period does not implement deletion. Earlier validation below describes the original settings milestone.

## Savings contribution controls

The new optional savings separation-of-duties setting and weekly-allocation convention apply only to future recorded contributions. Unset separation enforces three distinct actors; unset weekly allocation requires explicit contribution allocation/extra authorisation. Settings drafts have no effect, and publication/effective dates use the existing audited settings workflow. Existing contribution policy snapshots, accepted plan terms, fees and posted ledger entries are not rewritten. Same-person savings processing is not authorised by the registration-fee exception. See the consolidated savings report for supported values and outstanding policy decisions.


## Withdrawal policy drafts

The [withdrawal extension](withdrawals.md) adds optional versioned operational decisions for future requests only. All normal values remain unset. Missing decisions block withdrawal requests, while unrelated settings publication continues to work. Existing accepted plan terms, requests, payments and obligations are not rewritten. The registration-fee same-person policy does not authorise same-person withdrawals.
