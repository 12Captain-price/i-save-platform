# i-Save delivery roadmap

Baseline reviewed: 19 October 2026. This tracks engineering delivery; it does
not record organisational or legal approval. The current work is Phase 1 of
the requested rollout. Preserve the public design while replacing prototype
flows incrementally with authenticated APIs. Portal access now requires backend
authentication; unconnected screens show unavailable states, without sample data.

## Source material and decisions

The [optional announcement/event campaign milestone](announcement-campaigns.md)
adds explicit campaign approval/queueing, separate Member marketing consent,
confirmed unsubscribe and a retry-safe local recipient outbox. Publication never
sends automatically. Normal/production campaign sending stays disabled pending
approved provider, sender, complaint/bounce and privacy operations. The report
distinguishes isolated validation, normal migration preservation and operator UAT.

The content management and owned member-support extension is documented in
[content and support](content-support.md). It adds explicit editorial
review/publication, separate scanned public media and immutable private support
conversations. Contacts remain in published settings; legal approval, retention,
real scanner operations and external sending remain separate dependencies.

The staff administration, secure invitations/recovery and essential notification
extension is documented in [staff administration](staff-administration.md),
including current validation/activation gates and remaining delivery limitations.
It preserves existing financial policies and permission grants; it does not
enable production email, marketing or overdue reminders.

Reviewed the uploaded Master Requirements & Development Roadmap v1.0,
Web Application Requirements Specification v1.2, Hosting & Operating Cost
Proposal v1.0, and the scanned flyer (OCR; confirm its wording before reuse).
These are reference requirements, not evidence that features already work.
The latest user request authorises continuing implementation from the database
stabilisation milestone. No production deployment or paid services are requested.

- Confirmed fee values in the requirements: US$20 registration, US$5 monthly
  subscription. Keep both separate from savings; remaining billing rules need
  decisions before automation.
- Current operating direction: physical office payments recorded by staff and
  reconciled by authorised finance users. No payment gateway has been selected.
- Weekly cadence is the initial baseline. Owner-approved plan amounts, terms,
  eligibility, due dates, missed-payment and switching rules are still needed.
- Withdrawal processing, returns, bonuses and lending remain unavailable until
  approved rules exist. The flyer's growth/loan claims are not sufficient approval.
- The hosting proposal assumes a static frontend. This repository is a TanStack
  Start/Nitro SSR application with a Node server; verify the hosting architecture
  and revise the budget before selecting or purchasing production services.
- Suggested role URLs differ between the documents and the existing validated
  `/portal/$role/$screen` routes. Preserve working routes; add authenticated
  redirects when real sessions are integrated rather than redesigning screens.

## Verified code baseline and delivery gates

| Milestone | Current implementation / gap | Acceptance evidence required |
| --- | --- | --- |
| 1. Database foundation | Added migration-owned Docker startup, read-only API schema gate, readiness endpoint, guarded legacy adoption, PostgreSQL-compatible Boolean defaults and enrolment timestamps | Fresh and repeated migrations; legacy rows retained; schema drift refused; restart and independent PostgreSQL restore verified |
| 2. Authentication and permissions | Controlled admin CLI; revocable sessions and ownership/permission checks; pending public applications and protected review. Fee-gated activation and single-use member setup invitations are implemented; provider delivery, staff invitations and recovery remain outstanding. See authentication and registration operations | Controlled initial admin creation; member registration; staff invitation; protected sessions, logout and recovery; per-person permissions; member ownership checks; negative Member/Staff/Finance/Admin tests; no self-escalation or last-admin lockout |
| 3. Registration and plan workflows | Persisted pending public applications, duplicate/privacy protection, Staff/Admin search/pagination and recorded status history. Dedicated payment recording/verification and membership approval/activation with US$20 fee gate; next-month US$5 subscription, due day unset. See [membership workflow](membership-activation.md). Plan terms/history/scheduling remain outstanding | Fee verified separately from savings; account activation distinct from plan approval; approved plan terms snapshotted; rejected requests retained; approval never changes balances |
| 3. Financial integrity | Decimal fields and pending-only exclusion exist. API approval/reversal workflows now return unconfigured; underlying legacy services still need immutable reversal and transactional verification work. Contribution actors come from sessions; totals still mix currencies | Immutable linked ledger entries; transactional verification; idempotency and concurrency tests; authenticated actors; currency-specific totals; fee/subscription separation; duplicate/rejected/reversed flows and reconciliation agree with ledger |
| 4. Communications and administration | Browser login/logout is connected; role workspaces are protected and unconnected business screens show unavailable states | In-app notifications, provider-backed email, receipts, support tickets, content approval/versioning, consent-aware campaigns, safe retries, reports/exports, append-only audit and individual permissions |
| 4. Backup and recovery | Local PostgreSQL dump/restore drill is part of Phase 1; production backup centre is still outstanding | Approved recovery point/time targets and retention; encrypted separate storage; schedules/manual backups; verification, access control, failure alerts and regular restore drills |
| 5. Staging and rollout | No production readiness established | Full browser/API UAT, security review, load tests, HTTPS/secret configuration, monitored staging, rollback, privacy/legal review, staff training, organisational go-live approval |

The [savings contributions and reconciliation milestone](savings-contributions.md) adds pending office recording, separate verification/reconciliation, append-only currency ledgers, linked reversals, owned history and ledger-backed summaries. Its consolidated report records validation, preservation and activation status; it does not approve unresolved policy or production operation.

The [recurring subscriptions and financial reports milestone](recurring-subscriptions.md)
adds idempotent catch-up of activated memberships, Admin preview/run, explicit
subscription separation and source-reconciled currency-separated reports/CSV.
No scheduler, normal obligations or payment records are created merely for tests.
See its final validation/activation section for deployment status and remaining policy.

## Ordered implementation backlog

The combined [registration-documents and plan-enrolment milestone](registration-documents-enrolment.md) adds private evidence review, future-application requirement snapshots, explicit plan approval/publication, immutable member acceptance and separate eight-calendar-month enrolment activation. No plan is automatically published, no existing application is retrospectively verified, and no enrolment action posts money. See the consolidated report for validation, local migration activation, scanner/retention dependencies and isolated manual rehearsal.

1. Complete and review the database runbook; apply it to the existing office
   development database after a verified backup. Cloud validation does not
   establish the state of the user's laptop or another deployment.
2. Persisted revocable sessions, private API protection and session actors are
   implemented locally. Next add one-time invitation/recovery tokens (store
   token hashes, expiry and consumption) and provider-backed delivery.
3. Conservative Member, Staff, Finance and Administrator permission templates,
   per-person overrides, member ownership, audited security changes and a
   controlled bootstrap CLI are implemented. Review operational permissions
   before rollout; see [authentication operations](authentication-operations.md).
4. Pending public applications and permission-protected Staff/Admin review are
   implemented; see [registration operations](registration-operations.md).
   [Staff-assisted registration](assisted-registration.md) reuses that pending
   workflow with explicit applicant authorisation and session-derived provenance.
   Duplicate submissions receive a uniform public acknowledgement. No account,
   active membership or payment is created. Approved identity, fee verification
   and activation policy is still required before enabling those workflows.
5. Optional category expressions of interest are separate from membership
   applications; see [savings interest](savings-interest.md). No approved plan
   terms or acceptance are configured. Admin-only [draft savings-plan configuration](savings-plan-drafts.md)
   now saves incomplete, unpublished versioned proposals with authenticated actor
   audit. Drafts are excluded from offers and enrolment; no policy values are seeded.
   Version approved plans, record accepted terms and separate plan requests
   from member applications. Require configured amounts and schedules before
   publication. Keep original requests and review reasons.
6. Introduce an append-only money ledger, linked reversals/adjustments and
   unique idempotency keys. Lock or atomically transition verification state;
   post verification and audit in one transaction. Reconcile separate
   currency/fee/subscription/savings totals and exercise concurrent retries.
7. Wire member/staff/finance/admin screens to these APIs with real loading,
   error and retry states. Authentication and role guards are connected; keep
    unintegrated screens unavailable. Admin Organisation overview and Members now
    read backend counts and searchable, paginated records; see
    [admin directory validation](admin-directory-validation.md) and
    [frontend authentication](frontend-authentication.md).
8. The [Organisation settings foundation](organisation-settings.md) provides
   Admin-only draft/history/publication/effective dates for public contacts,
   future registration payments/review wording and activation subscription
   obligations. Existing records retain their original values. Unsupported
   financial workflows and infrastructure/secrets have no enable switches.
   The [fee currency extension and isolated rehearsal](fee-currency-and-settings-rehearsal.md)
   adds unpublished management rate drafts, explicit publication and frozen
   USD/ZiG fee settlement. It does not enable savings conversion. Migration 0010
   was activated locally after normal backup/restore and preservation checks;
   the normal management rate remains unpublished until explicit approval.
   Add notifications, receipts, approved content, support, permission-scoped
   reporting and audit search. Choose email/storage providers before delivery
   integrations; marketing needs consent and unsubscribe handling.
9. Build backup orchestration and monitoring after recovery targets, storage
   ownership, retention and key management are agreed. Test restoration into
   a separate environment before live financial records.
10. Validate staging against the documents' complete acceptance criteria,
    including member isolation, financial corrections, duplicate requests,
    reconciled reports, operational failures and restore drills. Record owner
    sign-off before production handling of real funds.

## Decision register (unresolved)

| Owner decision | Blocks |
| --- | --- |
| Registration identity checks, activation authority and fee verification/refund policy | Production activation |
| Per-plan amount, currency, duration, eligibility, approved weekly schedule and plan changes | Publishing live plans and generating due items |
| Subscription start date, due date, grace period and overdue consequences | Automated subscription billing and reminders |
| Financial recorder/verifier separation and approval matrix | Privileged workflow rules |
| Withdrawal, interest, lending, bonus and referral policies | Those features remain disabled/unimplemented |
| Approved content, publication authority and permission matrix | Official publishing and staff access |
| Email provider/sender, consent, storage, backup retention and recovery targets | Live delivery and production backup operations |
| Organisation-owned hosting/domain accounts, approved budget and operational owner | Paid provisioning and handover |
| Zimbabwean legal/regulatory review, terms/privacy/retention policies and go-live approval | Handling real member funds and production launch |

Do not invent answers to this register. Continue independent engineering with
synthetic data and explicit disabled/unconfigured states where rules are pending.


## Withdrawal workflow extension

See [withdrawal implementation and validation](withdrawals.md) for member-owned requests, atomic reservations, fourteen-day notice enforcement, separate manual payout evidence/verification and linked append-only debits. Eight-calendar-month completion and the minimum notice are approved eligibility rules. Normal processing remains blocked until the versioned operational withdrawal policy is explicitly completed and published. Earlier statements that withdrawals are entirely unimplemented are historical; they do not authorise real payouts or replace outstanding policy decisions.
