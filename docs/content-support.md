# Content management and member support

This milestone extends the redesigned application with versioned editorial publishing and recipient-owned support. Existing contacts remain in published Organisation settings; no second contact store is introduced. Financial services, account grants and accepted terms are not edited by content or ticket actions. No promotional campaigns, attachments, SMS, WhatsApp or external sending are enabled.

## Working capabilities and screens

Admin and specifically authorised Staff use **Content management / Announcements**. Separate backend capabilities are `content:read`, `content:draft`, `content:review`, `content:publish` and `content:archive`. Migration 0016 adds canonical Admin grants only; existing grants and overrides remain intact. Finance and Member accounts cannot acquire editorial access through accidental overrides. Operational grants remain assignable through the existing Staff administration screen.

Editorial mutations also require `content:read`; an action-only grant cannot be used to obtain a protected version/history through its response. The final review added and tested this restriction after the full regression run, followed by affected authentication/permission tests and a backend-only rebuild. This timing is reported separately rather than claiming the full suite reran after the restriction.

The final affected run passed **211 tests, 0 failed, 1 skipped** in 51.91 seconds (content/support, PostgreSQL concurrency, authentication and account administration). Its single skip is the SQLite row-lock variant. The normal and disposable backends were rebuilt to this final restriction without changing their databases.

Organisation information, FAQs, team profiles, events and announcements each have an item and immutable numbered snapshots. Incomplete drafts are allowed and show missing decisions. Save creates a private version; submit, request changes, approve, publish and archive append attributed events. Every mutation checks current session/permissions, expected version/event and an idempotency key. Competing edits conflict instead of losing the previous edit. Publication requires a complete approved latest version and explicit timezone-aware effective time. An authorised publisher may publish immediately or schedule it; backdating does not alter the actual audit timestamp. Reasons remain protected.

Public About, FAQ, Team, Events and Announcements screens read only effective publications. A later draft or future publication leaves the currently effective version visible. Archiving the effective version hides the item without resurrecting an older publication. Protected previews/history are not public. Previously hard-coded FAQ cards and the outdated About availability cards have been replaced by published content and honest empty states; they have not been silently approved or seeded. The existing organisation introduction, process guidance, Contact settings and registration workflows remain. Terms/privacy pages retain their explicit management/legal-review warnings; the editor does not establish legal compliance or approve legal policies.

Public media is held in a separate `public_media` table, never registration evidence or public filesystem assets. Only PNG/JPEG up to 2 MiB and 16 megapixels are supported. Original bytes require the existing fail-closed scanner before image parsing. Images are decoded/re-encoded as PNG, stripping names and metadata, with an additional output-size limit. Alternative text and explicit publication-rights/consent evidence are mandatory. Generated names, `nosniff`, controlled content types and publication checks apply to downloads. An unreferenced/draft-only or archived image is not public. HTML and executable/private-token URL schemes are rejected; displayed text is escaped and URLs are not automatically linkified. Normal image upload remains unavailable without a configured, current-signature scanner. The isolated synthetic scanner used in automated tests is not malware assurance or a normal deployment option.

**Support** is available to Members with `support:own`; every read/action is owned by the signed-in account. Office capabilities are separately `support:read`, `support:reply`, `support:internal`, `support:assign` and `support:resolve`. Staff require explicit grants. Search/pagination, explicit authorised assignment, replies, internal notes, Open/In progress/Waiting for member/Resolved status and explicit reopening are supported. Assignment never grants access. Members cannot view internal notes, internal-note history, staff email identities or assignment details. There are no attachments, automatic closures or promised response deadlines. Ticket messages/events are immutable; later replies append rather than overwrite. A stale revision conflicts and exact retries reuse the original result.

Content review and non-internal support events transactionally insert deduplicated notifications through the existing outbox. Public publication does not broadcast to members. Links are reevaluated against the recipient's current access. Email contains generic notification text and approved contacts, without ticket subject/body, documents or private links. Authorised local delivery/retry uses the existing Notification delivery screen and distinguishes Mailpit SMTP acceptance from external or inbox delivery. Failures do not replay publishing or business transactions; uncertain SMTP submission still requires operator review. Internal notes produce no member notice.

## Validation and preservation

Sanitised checkpoints live only in the new `content-support/` folder. Earlier intentionally untracked evidence folders were left untouched. Test databases are `isave_test_content`, `isave_test_content_fast` and disposable per-test databases on **isave-content-rehearsal** PostgreSQL; browser data uses its separate `isave_test_browser`, never normal `isave`.

Initial targeted backend run: **25 passed**. Final targeted content/ownership/concurrency run: **26 passed, 1 skipped, 0 failed**; the skipped SQLite variant cannot prove PostgreSQL row locks, and its PostgreSQL variant passed. Initial full run: **581 passed, 1 failed, 7 skipped**, exit 1. Its health assertion expected development but the rehearsal had APP_ENV=test; this was a harness configuration error. The corrected complete suite passed **583 tests, 0 failed, 8 skipped**, exit **0**, in 368.49 seconds. The original Docker/pytest exit status was retained. All eight skips are SQLite concurrency variants (including two account-link purposes); the corresponding PostgreSQL cases ran. No PostgreSQL lifecycle cases were skipped. See `content-support/validation.json` for commands and counts and `content-support/activation.json` for the independent activation gate.

Frontend: **152 passed, 0 failed**, TypeScript and production build passed. The first new frontend run failed because an isolated test lacked router context; the test harness was corrected and the complete suite passed. Production Docker frontend build also passed.

## Normal local activation — 24 October 2026

Revision **0016_content_support** is active. All normal application writers (frontend, backend and account worker) were stopped for the preservation window; PostgreSQL and normal Mailpit stayed running. A private custom-format backup was stored with user/SYSTEM-only directory access at `C:\Users\HP\isave-backups\content-20261024t081930\pre-0016.dump` (208450 bytes; SHA-256 `da5bf329654e9678748ed418052b5da248c90b916dc285e568e7d588083056d5`). It was independently restored into a separate PostgreSQL instance with no published ports/network, then upgraded and structurally checked before the normal upgrade. The restored volume is retained, with that restore instance stopped.

Original table rows/schema and sequences matched after restore. After both upgrades, all original records, grants and overrides matched; only the explicitly added canonical editorial/support permissions/grants and their catalogue sequence changed. Exactly seven empty workflow tables were added. No synthetic accounts, content, media, tickets, settings, financial records or test clock were copied. Existing contacts and published settings were unchanged. Rollback images and the private backup remain available; no downgrade or history stamping was used.

Backend, frontend and account worker were rebuilt with the existing normal connection. Subsequent read-only checks matched post-migration row/schema/sequence fingerprints; normal pages, anonymous protected-route/API denial, deployed editorial/support labels and readiness passed. Normal withdrawal processing retains its unconfigured policy blockers and real clock. The normal scanner remains unavailable and the isolated scanner is disabled. Email remains local Mailpit capture only. See `content-support/post-deploy.json` for current service checks. The final backend-only permission rebuild was separately checked against the same preserved fingerprints.

Automated real-Chrome rehearsal: **12 checkpoints passed**, no screenshots, videos, traces, tokens or credentials retained. It saved one synthetic announcement, confirmed draft exclusion, explicitly reviewed/published version 1, saved private version 2 and confirmed the public page still showed version 1. One Member ticket, one office internal note and one reply persisted; the Member saw the reply but not the note. Desktop/mobile layout, keyboard focus, anonymous portal denial and logout passed. An initial selector failed before submitting a review event; automation resumed the same draft without resetting accounts or duplicating records. The resumed checks used private short-lived fixture sessions; the initial browser password login had already succeeded. Financial tables remained empty.

Independent database/event inspection confirmed the two versions, three editorial events, one ticket with three events/messages, deduplicated generic notices and revoked browser sessions. One local Mailpit notification was explicitly requested twice: **one capture and one delivery attempt**, with probe logout/replay denial. See `content-support/browser.json` and `content-support/events.json`. The verifier's initial assumption about an absent session-created timestamp was corrected before these checks passed; no workflow records were changed to manufacture a result.

## Short isolated manual rehearsal

**Current environment:** the user authorised a fresh, durable replacement on
25 October 2026. See [persistent replacement instructions](content-support-replacement.md)
and the new `content-support/replacement-20261025/` evidence. The same public
ports now target project `isave-content-replacement-20261025` and its uniquely
named persistent PostgreSQL/Mailpit volumes. The older fixtures/checkpoints
below are historical; this replacement is not restored data.

### Restart checkpoint — 25 October 2026

All five existing content rehearsal containers were found stopped. The inherited
`compose.auth-test.yaml` places PostgreSQL data on tmpfs, which does not preserve
the cluster across container stops. A read-only check of the stopped container
found no cluster `PG_VERSION` marker. No content-rehearsal preservation dump was
located in the private backup directory inventory; the `content-20261024t081930`
backup described above belongs to the normal database, not this synthetic
rehearsal, and must not be substituted for it.

Only the existing rehearsal frontend and test Mailpit were started. PostgreSQL,
backend and account worker were left stopped to avoid automatic empty-cluster
initialisation, migrations or account recreation. The frontend login page and
test inbox return HTTP 200, but authentication remains unavailable without the
rehearsal database/backend. Earlier browser/database validation remains historical
evidence, not proof that its synthetic records survived the stop. Normal services
were unchanged; normal Mailpit was already stopped and was not started as part
of this rehearsal-only request.

Continuing requires a recoverable backup of the actual synthetic rehearsal, or
explicit authorisation for a new synthetic setup using durable storage. Do not
run `up`, start its PostgreSQL entrypoint or reseed accounts under an assumption
that the earlier data still exists. No databases/volumes/accounts were recreated,
deleted or reset during this checkpoint.

Use only **http://127.0.0.1:13070**, with its separate Mailpit **http://127.0.0.1:18025**. The reusable synthetic account identities are `accounts-admin@example.test` and `accounts-member@example.test`. No real account is invited or reset. Use Recovery privately for password setup in this disposable environment: open only the newest matching Mailpit message, keep its link/password out of chat and screenshots, then sign in. The separate account worker processes recovery requests. Normal Mailpit remains on port 8025.

1. As Admin, open Content management. Review the existing **TEST ONLY office announcement**: published version 1 remains public and version 2 is private. Make one clearly labelled private edit, save, and verify the public Announcements page still shows version 1. Review/approve/publish only if intentionally testing that explicit step; no further content or accounts are needed.
2. As Member, open Support and inspect the existing **TEST ONLY manual support follow-up** ticket and persisted office reply. Internal notes must not appear. If a manual reply is desired, send one clearly labelled synthetic follow-up; as Admin respond once on that same ticket. Do not repeat completed financial, recovery-security or notification-delivery tests.
3. Finish logged out. Manual operator confirmations are recorded separately from automated/database evidence. The stack stays available for this short rehearsal until authorised closure; do not delete its database or volumes.

## Limitations and unrun checks

Real scanner/signature operations, approved public-media rights, retention/deletion policy, legal wording and production operational sign-off remain dependencies. No retention period or automated purge is invented; immutable history requires a separately reviewed future retention process. Public media is deliberately unavailable in the current scanner-free rehearsal/normal environment. Automated upload tests use synthetic scanner responses and cannot certify real malware detection.

No production/external email, real staff/member actions or public deployment was tested. The browser suite does not certify a screen reader or every assistive device. The editor supports plain text and images, not rich HTML, arbitrary links, attachments or legal-policy approval. History UI currently lists up to 100 saved versions; records are retained beyond that and protected per-version preview remains available. Public listing currently resolves effective items in application memory before paginating; large-content capacity requires monitoring/optimisation. Member ticket conversation history is returned as a whole. Manual operator rehearsal is outstanding until confirmed; automated browser checks are not presented as operator observations.
