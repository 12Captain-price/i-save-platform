# Savings contributions and reconciliation

This milestone records office contributions against active member enrolments. It does not approve normal plan terms, separation policy, production financial operations or any withdrawal/returns product. See the validation/activation section for what has actually run.

## Working workflow and source of truth

`/api/v1/savings` is the dedicated workflow; the same-origin browser bridge is `/api/savings`. Actors are authenticated session users. The selected enrolment supplies the member and currency. Strict request bodies reject browser actor/member IDs. Read/list/receipt queries enforce the session-owned member link and reject caller-supplied identity selectors. Office lists are searchable and paginated.

Recording stores a positive two-decimal amount (maximum ten whole-number digits), payment date, free-text payment method and receipt/payment reference. Methods are recorded as evidence, not invented approved payment channels. The amount must be USD or ZiG (`ZWG`) and match the accepted enrolment currency. Fee exchange rates are never consulted. Account membership and plan enrolment must already be activated.

Each payment snapshots the effective published savings separation and weekly-allocation settings. Unset means **recorder, verifier and reconciler must be three distinct users**, labelled as the restrictive default pending approval. Registration-fee same-person approval does not authorise savings same-person processing. Admin Settings can explicitly publish `distinct_all`, `recorder_separate` (verifier and reconciler may coincide), or `same_actor_allowed`; every action still needs its own permission. A later publication applies to new contributions only and cannot relax an existing contribution's captured controls.

| Current state | Action and evidence | Result / savings effect |
| --- | --- | --- |
| No record | Record office payment | Pending verification; excluded |
| Pending verification | Explicit extra authorisation with evidence/reference and reason, when flagged | Separate event; remains pending |
| Pending verification | Verify with evidence/reference and reason | Verified; still excluded |
| Pending verification | Reject with evidence/reference and reason | Rejected; excluded; original retained |
| Verified or Discrepancy | Reconcile observed amount, currency and payment reference, with reconciliation evidence/reference and reason | Matched posts Confirmed and one positive ledger credit atomically |
| Verified or Discrepancy | Record discrepancy, observed values and reason | Discrepancy; excluded; further matching reconciliation can resolve it |
| Confirmed | Reverse with evidence/reference and reason | Reversed and one linked equal/opposite ledger entry; original credit retained |

Payment/reference normalisation folds case and repeated whitespace; a database unique hash prevents duplicate references, including retries under another request key. Existing legacy contribution references are checked too. Exact UUID request-key retries return the retained result; conflicting reuse is refused. Decisions use the last event ID for optimistic conflicts and lock the contribution row. PostgreSQL row/advisory locks plus unique credit/reversal constraints prevent concurrent double posting. Confirmation, immutable event, signed ledger entry and audit commit in one transaction. Failure rolls back that transaction.

The append-only signed ledger is the sole confirmed-savings source of truth. Totals sum credits and linked reversals **separately by currency**. PostgreSQL rejects event/ledger updates and deletes, protects original recorded payment fields, and checks ledger inserts match their audited contribution/action. There is no delete endpoint, discretionary adjustment, fee conversion, revaluation, interest, benefit, withdrawal, penalty, debt or automatic billing/collection.

## Programme boundaries and unresolved rules

Payment dates before the enrolment start or on/after its eight-month completion boundary are recorded with a visible flag but cannot be verified/confirmed. Future payment dates are also flagged and blocked. Handling these exceptions needs approved policy; there is no bypass switch or silent date alteration.

The weekly target is not a debt or an automatic obligation. To identify extra processing, payments are compared against the accepted weekly target using an explicitly published convention: Monday-to-Sunday calendar weeks or seven-day periods anchored to enrolment start, including non-rejected/non-reversed payments. The convention defaults to unset; while unset, every contribution needs explicit allocation/extra authorisation rather than assuming a week boundary. Exceeding the remaining target requires a separate `savings:extra` authorisation event before verification. This is an operational extra-review flag, not billing, an invented missed-target consequence or a promise that future payments will be consistent. An approved programme-week choice, partial-week handling, late/backdated exceptions and historical mapping require organisational review before production operation. No missed-target balance or penalty is generated.

Rejected contributions cannot be edited/reused, and confirmed contributions cannot be overwritten. Record a linked reversal to correct a posted credit; any replacement payment is a separately recorded transaction with its own genuine reference and evidence. There is no partial reversal or amendment workflow. No refund or withdrawal is performed by a reversal.

## Permissions and connected screens

`savings:read`, `savings:record`, `savings:verify`, `savings:reconcile`, `savings:extra` and `savings:reverse` are dedicated office capabilities. Migration/bootstrap grants these to canonical Admin only; Staff/Finance need explicit grants. Member read access uses `savings:own`. Misplaced office grants cannot turn members into financial operators, and office accounts cannot use member ownership grants. Per-person denials remain effective.

Savings contributions is available in the validated Admin/Staff/Finance navigation. The member Contributions screen and Overview share the ledger calculation. The interface provides owned history, distinct pending/confirmed totals, status/search/pagination, recorded controls, flags, review history, discrepancy processing and linked reversals. Pending/rejected records have no confirmed receipt. Confirmed receipts show reference, currency/amount, payment date and status; reversed receipts retain their historical warning and links. Fees and subscriptions remain on their existing separate screens. Server checks enforce every workflow condition regardless of visible controls.

Draft/published separation controls reuse Admin Organisation settings, version history, preview, effective dates, permissions, conflict detection and session audit. No secret/infrastructure settings are added. Currency conversion remains restricted to the separate fee-obligation workflow.

## Existing data and migration

Read-only inventory of the normal database at revision 0011 found **zero legacy contributions, zero payment verifications and zero active enrolments**. No legacy money was backfilled. On another database, historical rows including Verified/Reversed remain unchanged and are listed as requiring explicit review, excluded from the ledger. Legacy Verified is not reconciliation evidence. This milestone does not invent an enrolment mapping or automatically post those rows. The old generic contribution/verification write endpoints remain unavailable, closing bypasses; legacy reads remain available. Compatibility USD-total helpers now use USD ledger rows only, never mixed currencies or legacy status labels.

Revision `0012_savings_ledger` adds `savings_contributions`, `savings_events`, `savings_ledger_entries`, seven capability/grant entries and financial-integrity triggers. It does not rewrite settings snapshots, accepted terms, fees, subscriptions, accounts, contributions or verifications. Old settings read with an unset separation decision and restrictive enforcement. Downgrade refuses retained financial/workflow history before DDL. Never force-stamp history or delete volumes.

## Validation and activation

Normal local activation completed on **22 October 2026**, revision **0012_savings_ledger**. All 15 activation checks passed. No synthetic normal users, payments, savings records, settings or enrolments were inserted. Existing business/security rows, accepted terms, schema, sequences and prior permission grants were preserved, allowing only the seven intended capability/grant additions.

| Check | Result |
| --- | --- |
| Current full backend on isolated PostgreSQL, including migration variants | **458 passed, 0 failed, 2 skipped**, 460 collected, original pytest exit **0**, 391.08 seconds. |
| Full frontend suite | **114 passed**, 15 files, no failures/skips. |
| TypeScript | Passed, exit 0. |
| Frontend client/server and backend Docker production builds | Passed. |
| Full browser regression | **43 passed, 3 skipped, 1 failed**, exit 1; the failure was an ambiguous test status locator during a real loading transition. |
| Final release-image savings and authorised Finance queue browser cases | **2 passed, 0 failed**, exit 0 after correcting the locator to assert the durable contribution row. |
| Final Finance description recheck | **1 passed**, exit 0; repeated positive Finance case after a copy-only correction, not an additional distinct case. |
| Normal read-only browser/API checks | **6 passed**; public pages, protected-workspace redirect and anonymous savings denial; no normal login, test data or financial submission. |

There are **45 distinct enabled browser cases passed across full and affected runs**: the failed savings case is now passed, plus one additional positive Finance case. Do not describe this as a single final full-browser pass: a single full-browser rerun after the locator-only correction was not performed. The three browser skips are opt-in Mailpit delivery/expiry/SMTP-failure cases unrelated to savings; they remain unrun in this milestone.

The two backend skips are the SQLite parameters of test_concurrent_application_and_activation_are_single_events and test_concurrent_post_verify_reconcile_reverse_and_append_only. True PostgreSQL row-lock concurrency is inapplicable to SQLite; **both PostgreSQL variants passed**. Concurrent distinct-key posting, exact-key retries, immutable history, linked reversals and injected posting-failure rollback were exercised. A projection labelled Confirmed without a credit cannot yield a confirmed receipt. Legacy Verified rows and fee receipts cannot bypass the ledger.

All 105 backend Python source files in the regression runner and release image matched the workspace hashes. The last full suite includes the final receipt-evidence regression, rather than reporting the earlier 457-pass run as current. Existing Starlette/httpx deprecation and frontend tooling notices remain; no test failure remains unresolved. Human screen-reader, non-Chromium browser, load and production operational/security review are unrun. Real normal Admin credentials were neither read nor reset; normal credentialed manual login was not repeated for this milestone.

Early failed/interrupted runs are diagnostics, not passes: a missing isolated test DB, duplicate fixture session, outdated legacy expectations, PostgreSQL constraint-rendering differences, downgrade guard messages, API default-port mismatch, an interrupted backend during a build, and the ambiguous browser live-status assertion. All functional issues found were corrected and covered by the final full/affected checks. The environment also restarted during the work, stopping the disposable stacks and Mailpit; the existing Mailpit container was restarted without recreation. No normal volume was reset.

The private backup is outside Git at C:/Users/HP/isave-backups/savings-20261022t165920/pre-0012.dump, **156377 bytes**, SHA-256 6f1cfa197275f38147a0da31ed7b5bd0a5fadded45bb09f4f492962ead11e656. Windows access is restricted to the current user and SYSTEM. The exact saved archive was independently restored into a separate **networkless, portless** PostgreSQL recovery container, compared before migration, migrated using the tested image, and compared again. Normal writers were quiesced before dumping. PostgreSQL and Mailpit were not stopped by activation. Rollback images are retained as isave-backend-rollback:pre-savings-20261022 and isave-frontend-rollback:pre-savings-20261022. Rollback after new financial activity requires reviewed recovery/reconciliation, not force-stamping or blindly starting an older backend. See [activation evidence](savings-contributions/activation.json).

Normal runtime checks confirm all three new savings tables remain empty, both savings decisions remain **unset**, synthetic scanning is false, and the synthetic fixture CLI refuses normal before connection. The restrictive three-person rule and explicit allocation review are therefore effective defaults, not a synthetic policy copied into normal. See [normal read-only checks](savings-contributions/normal-activation-readonly.json), [browser checks](savings-contributions/normal-browser-readonly.json), [source verification](savings-contributions/release-source-verification.json) and [full test exit status](savings-contributions/final-backend-exit.json).

The homepage browser harness previously defaulted to an intentionally protected untracked evidence folder. A command used the wrong override name and wrote captures there. Ten image hashes and metadata matched retained earlier evidence; the zoom image differed and was copied to `savings-contributions/evidence-check` for review. The harness now rejects protected output folders and defaults to the new milestone folder. Nothing in the protected folders was deleted or staged. This is an evidence-handling deviation, not a claim those folders were untouched.

Before any normal upgrade: stop normal writers only, save a private custom PostgreSQL archive outside Git with restricted Windows access, independently restore it into a separate networkless recovery server, compare original rows/schema/sequences, rehearse the exact migration/image there, compare again, then upgrade normal and repeat preservation checks before reopening writers. `scripts/savings-activation.cjs` implements these checkpoints and retains rollback build references. It must only run after isolated validation.

## Short isolated manual rehearsal

The empty manual rehearsal is prepared at **http://127.0.0.1:13030**, API port 18030, project isave-savings-rehearsal. It has no accounts or payments until you privately initialise it. Run from your own repository-root terminal:

```powershell
docker compose -p isave-savings-rehearsal -f compose.auth-test.yaml -f compose.savings-rehearsal.yaml exec backend python -m app.savings_rehearsal
```

Use two different synthetic @example.test addresses and unique passwords only at the hidden prompts; never paste them in chat or put them in arguments. The test-only seed explicitly uses enrolment-anchored weeks as well as same-actor processing. The private CLI `python -m app.savings_rehearsal` refuses the normal database before connection, requires a private interactive terminal, and prompts for exactly one synthetic Admin and one Member account. It refuses existing emails rather than resetting accounts. It requires typing `TEST ONLY` before publishing a clearly audited **synthetic same-actor test setting**; this does not approve normal policy. It creates labelled synthetic accepted USD/ZiG enrolments and posts no funds. Credentials are never printed.

1. Privately create those two accounts; sign in as the rehearsal Admin. Record one small office contribution in the enrolment currency. Confirm pending status and no confirmed savings.
2. Verify explicitly, then reconcile against the exact recorded amount/currency/reference with synthetic evidence. Confirm one ledger credit and a confirmed receipt. Use the same account only because the explicitly labelled synthetic policy permits it.
3. Sign out, sign in as the Member, inspect the same contribution/receipt and per-currency Overview total. Fees must remain separate. Sign out. No additional accounts or repeated manual payments are needed.

Normal default separation cannot be completed by one employee; automated tests exercise three distinct actors and denial of same-person processing. Do not publish the synthetic relaxation in normal settings. Live scanner/retention/privacy/production operational limitations from the documents milestone remain unchanged.

## Final scope and limitations

Normal app, PostgreSQL and Mailpit remain available. Automated savings browser/regression services and the private recovery server are stopped after validation; recovery data/archive and rollback images are retained. The manual rehearsal remains running and has not yet been completed by the user. No database volumes were deleted or migration history force-stamped; nothing was staged/pushed/merged, and no public deployment occurred.

Unapproved decisions remain explicit: normal savings separation and week allocation are unset; programme-date exceptions, partial weeks, historical enrolment mapping/reconciliation, partial corrections/refunds and replacement of rejected/misrecorded payments require approved workflows. Legacy records remain excluded rather than silently credited. No automatic financial adjustment, withdrawal, debt, penalty, savings conversion or benefit/return is enabled. The manual seed uses clearly labelled synthetic settings solely to permit a short two-account rehearsal, not to approve normal policy. The document scanner/retention/privacy limitations from the prior milestone remain unchanged.

Final UI review corrected the three working Finance queue descriptions that had inherited unsupported-screen copy. The full frontend suite (114 tests), TypeScript, production build and one positive Finance browser case passed again. Only the normal/manual frontends were updated for this copy change; normal backend, database and Mailpit remained running. The current [service snapshot](savings-contributions/final-services.json) records normal health, the ready manual rehearsal and stopped automated services.

### Private setup refusal investigation — 22 October 2026

Inspected only `isave-savings-rehearsal`. Its guarded target was `isave_test_browser` at internal host `db`, with current schema and test-only document-scanning configuration. Accounts, members, membership applications, plan applications/enrolments, savings contributions and ledger entries were all empty; role assignments were empty. Neither reported attempt left a partially created account or fixture. The original CLI suppressed every exception and retained no safe diagnostic, so the original failed private-input check cannot be determined retrospectively.

The helper now identifies acknowledgement, email-domain/format, password-length/UTF-8, confirmation, duplicate-address and existing-account failures without echoing input. Requirements are explicit in the private password prompt. Setup has an outer PostgreSQL transaction so bootstrap's intermediate commit cannot persist partial fixture creation. Existing accounts are refused, never reset.

Validation: six targeted pytest cases passed. Nine additional isolated checks passed, including complete synthetic fixture creation within a transaction that was explicitly rolled back, followed by zero-account/zero-enrolment assertions. No durable rehearsal fixture was added by these checks. No normal database was accessed. The repaired helper was copied only into the running savings rehearsal container; normal services were not rebuilt or restarted. Original private inputs and exact failed checks remain unknown. No credentials or tokens recorded. No push or merge.

### Manual savings rehearsal follow-up — 22 October 2026

Browser confirmations supplied by the user: one USD10 office contribution progressed from Pending verification to Verified (without savings credit), then Matched/Confirmed with ledger credit 1. Admin and Member receipts matched reference TEST-ONLY-SAVINGS-001, amount USD10 and payment date 2026-10-22. Member Overview and contribution history both showed USD10 confirmed, no pending amount, and fees/subscriptions separate. These are user browser confirmations, distinct from server-side evidence.

Server-side evidence: the sole Admin session and sole Member session were both revoked, zero unrevoked/unexpired sessions remained, and two login/two logout audit events existed. One credit and no reversal existed at this checkpoint. Original credit/review history and receipt-identity hashes were checkpointed privately inside the disposable backend for the requested reversal preservation comparison; no tokens were emitted.

Fixed member contribution-page introduction and guidance to describe member history rather than staff recording tasks. Replaced literal question-mark enrolment separators with middle dots and corrected the loading message. Added regression coverage for member wording and populated enrolment separators. Affected frontend tests: 28 passed, 0 failed, 0 skipped (four files). TypeScript passed. Default and Docker-compatible node-server production builds passed. An initial sandbox EPERM prevented Vite startup; the authorised rerun passed. No backend business logic changed; backend regression suites were not repeated for these presentation fixes. The fixes are in source/build output; running normal services have not been rebuilt for this follow-up.

Linked reversal remains pending the user's single authorised browser action. The rehearsal must stay running until its reversal, preservation and final logout checks finish. Do not describe this checkpoint as a completed reversal or final shutdown. No normal database accessed, no volumes deleted, no push or merge.

### Completed manual reversal and shutdown — 22 October 2026

User browser confirmation: contribution 1 became Reversed; member Contributions displayed USD0.00 confirmed, credit ledger 1 and reversal ledger 2 linked to entry 1. User confirmed final logout. No completed receipt/member checks were repeated.

Independent server-side checks passed before shutdown:
- Contribution 1 remains present with Reversed status and its original USD10 amount/reference/payment identity.
- Exactly two ledger entries: original USD10 Credit and one USD-10 Reversal referencing credit 1. Net confirmed USD0; application summary also reports USD0 and no pending amount.
- Exactly one reverse event. Original credit, verification/reconciliation events and receipt identity match the private pre-reversal SHA256 checkpoints. Reversed historical receipt remains available, with all three review events and both ledger links.
- Initially all three completed sessions were revoked. A newer member login appeared during checks; after the user logged out again, all FOUR sessions were revoked and the backend session validator rejected each with HTTP401 semantics, without exposing or reconstructing tokens. Zero active sessions remained.

Affected validation remains 28 frontend tests passed, zero failed/skipped, plus TypeScript and both default/node-server production builds passed. No new backend financial implementation was changed in this follow-up; the earlier full 458-pass/2-skip backend regression was not rerun. The earlier 6 setup-validation tests and 9 rollback-only checks are separate from these 28 frontend tests. No new browser automation was run for these copy fixes; browser observations above are manual user confirmations. Presentation fixes remain in source/build output and were not activated into the running normal frontend during this follow-up. No unresolved financial or session failure remains; running normal UI still needs a future frontend-only rebuild to display these copy fixes.

Before stopping tmpfs PostgreSQL, privately exported the final rehearsal database to `C:\Users\HP\isave-backups\savings-rehearsal-final-20261022\rehearsal.dump`, SHA256 `c07afdf835e911d5d9901e8bf9cd53efeecc2cf45eb1c477eebbbb55d0b4d48b`. Archive listing validation succeeded (470 lines); this final rehearsal archive was not independently restore-tested. This preserves the synthetic history outside the stopped ephemeral database and outside Git; stopping tmpfs does not promise live-data persistence on restart.

Stopped ONLY project `isave-savings-rehearsal` using compose stop: its frontend, backend and PostgreSQL containers exited 0; no containers/volumes deleted. Normal frontend3000, backend8000, PostgreSQL5432 and Mailpit8025/1025 remained running and healthy. No normal database access, mutation or restart occurred during these checks. Original untracked evidence folders were untouched. Nothing pushed or merged.

### Normal frontend copy-fix activation — 22 October 2026

Rebuilt and recreated ONLY the normal frontend using the documented project `i-saveprototype-main` and `compose.yaml` plus `compose.mailpit.yaml`: `build frontend`, followed by `up -d --no-deps --no-build --force-recreate frontend`. Both exited 0. Retained previous image as `isave-frontend-rollback:pre-member-copy-20261022` (prior image sha256:2e5c9a1131cc8d58590809a7c1b407cd951d56b7cd176c1a6851f90cfdb8add8). No disposable environment/configuration or accounts copied.

Verified the running frontend retains `AUTH_API_ORIGIN=http://backend:8000`. Its deployed server modules contain corrected member-specific contribution wording, loading text and Unicode middle-dot enrolment-summary separators, with no broken question-mark separator strings. Earlier component regression tests (28 passed) verify rendered member wording and populated summary; this activation checked the newly deployed artifacts without accessing real member records or credentials.

Normal Chrome smoke checks passed: localhost3000 homepage HTTP200 with expected hero heading; anonymous member contributions, member overview and Admin overview each redirected to login with a password field; same-origin auth identity endpoint returned401. Browser runner initially lacked its bundled Playwright browser; installed Chrome was used. A network-idle wait timed out; DOM-ready navigation completed all checks. No unresolved smoke failure remains.

Final normal frontend/backend/PostgreSQL/Mailpit all healthy. Backend, database and Mailpit IDs and start timestamps exactly matched their pre-activation checkpoint: none was recreated or restarted. No database commands, account changes, credential submissions or manual financial tests were performed. Savings rehearsal remains stopped. This supersedes the preceding limitation that the copy fixes were not yet active in the normal frontend. No push, merge, public deployment or edits to intentionally untracked evidence directories.
