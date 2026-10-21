# UI and usability refinement — 21 October 2026

## Priority checklist

1. Correct misleading public content: fictional profiles/events, duplicate goal
   sections, invented operational claims and outdated provisional fee text.
2. Give visitors an accurate application → office review → activation journey;
   distinguish category interests from unpublished plan proposals/enrolment.
3. Organise supported portal tasks first; label unavailable services and supply
   a working next step. Preserve the backend as the permission authority.
4. Divide long application and settings screens into named, navigable sections;
   distinguish current configuration, saved drafts and publication consequences.
5. Standardise touch targets, headings, spacing, keyboard focus, mobile menus,
   reduced motion, long references and loading/error/empty states.
6. Validate real rendered routes at 360, 390, 768 and 1440px, capture representative
   before/after images and exercise existing workflows with synthetic PostgreSQL.

## Isolation

Only the `isave-ui-review` project is used for this work's mutations. It combines
`compose.auth-test.yaml` and `compose.ui-test.yaml`, with disposable PostgreSQL,
frontend 13010 and API 18010. Normal ports 3000/8000 and the existing settings
rehearsal on 13000/18000 are not restarted or migrated. No normal database
records, settings, policies, migrations or API contracts are changed. Private
synthetic passwords are generated in memory and passed over stdin, never printed.
Existing Settings/ZiG implementation and histories are retained.

## Findings and implemented changes

The original mobile homepage was 7823px tall, repeated the five categories, and
used a decorative growth graphic and unsupported savings/receipt claims. The
replacement uses one linked category collection, an accurate pending-application
journey and a compact payment/account-access explanation, within the shared
public shell. Categories now lead to their own information rather than the same
homepage anchor. Their descriptions come from the existing interest configuration.
At 390px the refined homepage measures **4120px**, approximately **47% less
scrolling**. The removal is duplicated/decorative content, not financial evidence.
Browser testing also found that the plans parent route omitted an outlet, so
detail URLs incorrectly rendered the list. It now renders the actual selected
category detail page; a browser test checks both the destination and its content.

Sample team profiles, events and announcements are removed from rendered routes;
each now has an honest approved-content empty state and an office-contact route.
FAQs, About and eligibility guidance describe working features without invented
eligibility requirements, automatic notifications or community-ownership claims.
Unmounted legacy demo fixtures are retained as existing source work; they no
longer supply these public routes or the authenticated workspace shell.
Public fees explain the authoritative recorded obligation instead of showing
hard-coded figures that could conflict with published settings. There is no
public live-fee API: publishing that schedule requires a separately scoped API
decision; no private settings data is exposed. Approved contacts continue to use
the existing effective-publication endpoint. Legal draft text is retained, with
review flags linking to current process/fee guidance.

Portal navigation prioritises working tasks and groups unfinished screens under
“More services · unavailable”; their validated routes remain reachable and
honestly unavailable. Staff/Finance overviews offer real task destinations
without invented counts. The mobile sidebar is a modal sheet with Escape,
focus containment and focus restoration. Public navigation supports Escape and
focus return. Both shells have keyboard skip links; login and unavailable account
pages have real page headings. Login errors receive focus and retain inputs.

Application records have a compact identity/status summary and direct links to
details, payments/review and history. Unsupported documents are explicitly
identified. Organisation settings group contacts, registration fees, subscription
configuration and review wording into fieldsets, with direct links to draft,
preview, history and exchange rates, plus an expandable current-value snapshot.
Save/retry/publication request bodies and all permission checks are unchanged.
Shared buttons/touch targets are at least 44px, labels/statuses remain textual,
and reduced-motion support is retained.

## Review coverage and evidence

`scripts/ui-audit.mjs before|after` uses guarded synthetic accounts and actual
Chrome-rendered pages. Before-change coverage: **240 route/viewport combinations**,
zero horizontal overflow or unlabelled form controls; login, recovery and verify
lacked h1 headings (corrected). This structural scan is supplemented by visual
inspection, representative screenshots and workflow browser tests; it is not a
claim of full assistive-technology conformance.

Public routes: Home, How It Works, Plans and all five category detail routes,
Fees, Registration, Login, Contact, FAQs, About, Team, Events, Announcements,
Terms, Privacy, Disclosures, Eligibility, Recovery, Verify and Password Setup.
Every navigation screen in Member, Staff, Finance and Admin is visited at all
four widths, including assisted registration. Supported record detail, successful
registration, payment review and settings publication are additionally exercised
by the workflow tests.

Before/after screenshots and machine-readable route inventories are in
`docs/ui-review/before` and `docs/ui-review/after`. Only synthetic portal records
are pictured. No login password or invitation URL is captured.

## Remaining dependencies

Approved team biographies, events, announcements and testimonials are absent;
no content is invented. Legal Terms sections on live plan offers, contributions
and provisional fees, Privacy's prototype-security statement/retention/rights,
and all regulatory disclosures need management/legal approval. Original wording
is retained as draft evidence. Published plan terms, savings reconciliation,
refunds, penalties, withdrawals, returns and unfinished workflows are unchanged.
Public live fee publication requires an approved public API; contact the office
or consult an authenticated recorded obligation meanwhile.

Unconnected routes remain unavailable: Member plans, plan details, applications,
contributions, profile/security, notifications and support; Staff members,
member-record, requests, payments, support and announcements; Finance verification,
reconciliation, ledger, reports and audit; Admin staff, roles, audit,
announcements and CMS. New task links do not grant backend permissions.

## Validation results

- Frontend: **89 passed**, zero failures (12 files). This includes the five
  new usability checks for relevant category links, correct application steps,
  mobile-menu Escape/focus return, the logo home destination and an honest
  missing-content help route. TypeScript `--noEmit` passed.
- Full browser suite on isolated PostgreSQL: **30 passed, zero failed,
  3 skipped**, original command exit **0**. The skips are opt-in Mailpit delivery,
  expiry and SMTP-failure tests; they were not enabled by this UI task.
- Browser coverage includes all four roles' login/reload/logout/session revocation,
  direct protected URLs, expiry, cross-member/privilege denial, searchable and
  paginated member records, public and assisted submissions, generic duplicates,
  safe retries, payment/approval gates, fee currency and frozen history,
  unpublished plans, settings draft isolation/publication/effective dates and
  concurrent edit conflict. New keyboard cases verify skip links, actual category
  details, public Escape/focus return and modal portal focus containment.
- Frontend production client/server Docker builds passed. The last build includes
  the final heading hierarchy adjustments; the subsequent rendered-route scan
  checks these additions. Git whitespace check passed.
- No backend pytest rerun was needed for this frontend-only change. Backend,
  database migrations, API contracts, session service and financial rules have
  no source changes. The browser suite exercises the existing backend/PostgreSQL
  workflow using only synthetic data.

Final rendered-page audit: **268 checks across 67 route paths**, each at
**360, 390, 768 and 1440px**, exit **0**. Zero document-level horizontal
overflows, unlabelled form controls or missing h1 headings. **4,852 flat-surface
text samples** met the scan's 4.5:1 normal / 3:1 large-text thresholds. Canvas
colour resolution and ancestor-background compositing were used; this does not
test image contrast, complex backgrounds or all accessibility success criteria.
In addition to navigation screens, the after scan includes Staff member-record,
the portal entry redirect and all five legacy Member account-route redirects.
The exact path/viewport inventory is [audit.json](ui-review/after/audit.json).
There are 16 before and 28 after screenshots (including eight synthetic workflow
images). Representative images were visually inspected after capture.

Human screen-reader use, keyboard-only financial operations with a real staff
reviewer, non-text/image contrast, 200–400% zoom and a broader browser/device
matrix are not claimed. Automated accessibility checks are limited structural,
focus and flat-surface text checks, not WCAG certification. Existing frontend
dependency/build-tool warnings remain. The isolated UI preview is at
`http://127.0.0.1:13010`; normal application images/containers are not activated
with this change. No push or merge was performed.

## Representative screenshots

| Screen                   | Before                                                     | After                                                    |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| Home, mobile (full page) | [Before](ui-review/before/home-390.png)                    | [After](ui-review/after/home-390.png)                    |
| Home, desktop            | [Before](ui-review/before/home-1440.png)                   | [After viewport](ui-review/after/home-1440-viewport.png) |
| Admin settings, mobile   | [Before](ui-review/before/portal-admin-settings-390.png)   | [After](ui-review/after/portal-admin-settings-390.png)   |
| Registration, mobile     | [Before](ui-review/before/register-390.png)                | [After](ui-review/after/register-390.png)                |
| Member overview, mobile  | [Before](ui-review/before/portal-member-dashboard-390.png) | [After](ui-review/after/portal-member-dashboard-390.png) |

Additional synthetic workflow evidence: [populated member](ui-review/after/workflow-member-overview-mobile.png),
[registration confirmation](ui-review/after/workflow-registration-confirmation-mobile.png),
[payment review](ui-review/after/workflow-membership-review-mobile.png),
[assisted application review](ui-review/after/workflow-assisted-review-mobile.png).

During the initial browser run, five cases failed: an obsolete mobile-close
locator interrupted the next fresh-fixture test, a transient connection reset
affected the simulated lost-response draft test, an ambiguous assisted-action
locator exposed duplicate labels, and the new category-detail assertion exposed
the missing outlet above. The locator, label and routing issues were corrected
before a fresh isolated rerun. Diagnostic output from the connection reset
included a disposable session cookie: that session was immediately revoked,
local diagnostic headers redacted, and a reporter added to prevent private
headers/setup URLs from appearing in subsequent output. The failed-run database
was discarded with only its own disposable project. No normal session was used.
The second full run had 29 passes, three skips and one remaining plan-history
test failure caused by counting the new navigation disclosure as plan history.
Scoping that assertion to `main` resolved it. The final fresh full run passed
30/30 enabled cases with the three Mailpit cases skipped. No failure was hidden
by retries or a swallowed shell exit code.

Final infrastructure metadata checks showed the normal backend, frontend,
PostgreSQL and Mailpit healthy. Their containers were not restarted by this UI
task. The existing manual settings rehearsal remains available. The isolated UI
stack is left running at 13010 for review; its credentials were generated for
automated checks, not published for manual use. It uses disposable tmpfs data,
so screenshots/documentation are the retained evidence across a host restart.
