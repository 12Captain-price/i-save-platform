# i-Save delivery roadmap

Baseline reviewed: 19 October 2026. This tracks engineering delivery; it does
not record organisational or legal approval. The current work is Phase 1 of
the requested rollout. Preserve the public design and clearly labelled demo
portals while replacing prototype flows incrementally with authenticated APIs.

## Source material and decisions

Reviewed the uploaded Master Requirements & Development Roadmap v1.0,
Web Application Requirements Specification v1.2, Hosting & Operating Cost
Proposal v1.0, and the scanned flyer (OCR; confirm its wording before reuse).
These are reference requirements, not evidence that features already work.
The latest user request authorises continuing implementation from the database
stabilisation milestone. No production deployment or paid services are requested.

- Confirmed fee values in the requirements: US$20 registration, US$5 monthly
  subscription. Keep both separate from savings; billing/activation rules need
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
| 2. Authentication and permissions | bcrypt helper exists; entity routers currently lack authentication. Caller-supplied actor IDs are not trusted identities | Controlled initial admin creation; member registration; staff invitation; protected sessions, logout and recovery; per-person permissions; member ownership checks; negative Member/Staff/Finance/Admin tests; no self-escalation or last-admin lockout |
| 3. Registration and plan workflows | Basic member/application/plan CRUD exists; no complete activation workflow, terms versioning, plan request history or schedule engine | Fee verified separately from savings; account activation distinct from plan approval; approved plan terms snapshotted; rejected requests retained; approval never changes balances |
| 3. Financial integrity | Decimal fields and pending-only exclusion exist. Reversal overwrites state; verification router trusts query actor IDs; generic verification can diverge from contribution status; totals mix currencies | Immutable linked ledger entries; transactional verification; idempotency and concurrency tests; authenticated actors; currency-specific totals; fee/subscription separation; duplicate/rejected/reversed flows and reconciliation agree with ledger |
| 4. Communications and administration | Portal screens are demonstrations, not persistent operational services | In-app notifications, provider-backed email, receipts, support tickets, content approval/versioning, consent-aware campaigns, safe retries, reports/exports, append-only audit and individual permissions |
| 4. Backup and recovery | Local PostgreSQL dump/restore drill is part of Phase 1; production backup centre is still outstanding | Approved recovery point/time targets and retention; encrypted separate storage; schedules/manual backups; verification, access control, failure alerts and regular restore drills |
| 5. Staging and rollout | No production readiness established | Full browser/API UAT, security review, load tests, HTTPS/secret configuration, monitored staging, rollback, privacy/legal review, staff training, organisational go-live approval |

## Ordered implementation backlog

1. Complete and review the database runbook; apply it to the existing office
   development database after a verified backup. Cloud validation does not
   establish the state of the user's laptop or another deployment.
2. Add persisted, revocable sessions and one-time invitation/recovery tokens
   (store token hashes, expiry and consumption). Authenticate every private API
   and derive actors from sessions. Keep public plan browsing separate.
3. Define permission templates for Member, Staff, Finance and Admin, with
   per-user grants and server-side ownership checks. Audit changes. Add a
   controlled CLI/bootstrap path instead of public admin registration.
4. Implement pending self-registration, verified fee records and approved
   activation conditions. Keep passwords and token material out of logs and
   responses; test enumeration, throttling, expiry and logout revocation.
5. Version approved plans, record accepted terms and separate plan requests
   from member applications. Require configured amounts and schedules before
   publication. Keep original requests and review reasons.
6. Introduce an append-only money ledger, linked reversals/adjustments and
   unique idempotency keys. Lock or atomically transition verification state;
   post verification and audit in one transaction. Reconcile separate
   currency/fee/subscription/savings totals and exercise concurrent retries.
7. Wire member/staff/finance/admin screens to these APIs with real loading,
   error and retry states. Retain explicit demo labelling where not integrated.
8. Add notifications, receipts, approved content, support, permission-scoped
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
