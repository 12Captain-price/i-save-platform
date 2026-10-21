# Redesigned interface activation — 21 October 2026

The redesigned interface is the normal local frontend at http://localhost:3000. Existing public routes and `/portal/$role/$screen` use the current public layout and authenticated workspace. There is no old/new interface switch or alternate legacy design route. Unsupported services retain their honest unavailable states.

Only `i-saveprototype-main-frontend-1` was rebuilt/recreated, using the normal Compose files (`compose.yaml` and `compose.mailpit.yaml`). Its existing `AUTH_API_ORIGIN=http://backend:8000` connection is preserved. No disposable account, environment configuration or database was copied into the normal environment. Backend code, permissions, policies and migrations were not changed.

## Obsolete source removal

Repository-wide reference checks confirmed that these ten files formed an unused group, with no references from active routes, tests or other code: `AccountLayout`, `AdminCharts`, `AdminContentManagement`, `AdminScreens`, `DemoProvider`, `FinanceScreens`, `MemberScreens`, `PortalUI`, `StaffScreens` and `lib/portal/demo.ts`. They were removed. The current `AuthenticatedWorkspace`, live data components, public layouts and validated navigation remain. TypeScript and the production build pass after removal.

## Validation

- Frontend suite: **96 passed**, 13 files, exit 0.
- TypeScript `--noEmit`: passed, exit 0.
- Normal frontend production client/server Docker build: passed, exit 0.
- Normal browser smoke checks: **13 passed**. Home, How It Works, goal list/detail, Fees, Contact, Registration and Login render. The current homepage wording is present and the removed illustration captions are absent. Anonymous direct URLs for all four portal roles redirect to login; anonymous session API returns 401.
- Read-only whole-row fingerprints of all **35 normal database tables** matched immediately before and after frontend activation and anonymous browser checks. No records changed during activation. Evidence is in `ui-activation/database-before.json` and `database-after.json`; only counts and aggregate hashes are recorded.

The isolated portal/public audit also passed **268 route/viewport checks**, covering 360, 390, 768 and 1440px and synthetic login for Member, Staff, Finance and Admin. It found zero horizontal overflow, unlabelled controls, missing page headings or text-contrast issues. This audit used the existing preview build of the same active UI; removal of unused modules was separately verified by the new normal production build and TypeScript. It exercises navigation/rendering, not a new full financial-workflow regression run. Earlier workflow-suite results remain documented in `ui-usability-refinement.md` and are not presented as rerun here.

Normal database identity remains `isave`; readiness and the published-contact API both return 200. The normal backend, PostgreSQL and Mailpit containers remained running throughout activation. The separate Settings rehearsal was not changed.

**Private verification completed:** the user confirmed normal Admin login, Organisation overview, Members, Applications, Savings-plan drafts, Organisation settings and logout all passed. Credentials were entered privately; no credentials, tokens or private records were shared. No password reset, bootstrap, synthetic normal account creation or business-record submission was performed for activation.

After that confirmation, `docker compose -p isave-ui-review -f compose.auth-test.yaml -f compose.ui-test.yaml stop frontend backend db` completed with exit 0. Only the three isolated UI preview containers were stopped. No containers or volumes were deleted. The preview database uses tmpfs, so its synthetic runtime data is disposable; stopping it does not preserve that data for reuse. Its retained screenshots/reports remain the evidence. Normal PostgreSQL storage was not touched.

Final checks confirmed the normal frontend, backend, PostgreSQL and Mailpit all **running and healthy**. Home at port 3000, backend readiness at port 8000 and Mailpit at port 8025 each returned HTTP 200. The separate Settings rehearsal remains running and unchanged. Sanitized container start times and final HTTP statuses are recorded in [final service status](ui-activation/final-service-status.json). The normal backend, database and Mailpit start times confirm they were not restarted by preview shutdown.

No activation failures remain. Native browser-menu 200% zoom and human screen-reader/cross-engine testing remain manual limitations from the homepage validation. This activation did not rerun the full backend or financial-workflow suites; current frontend, read-only normal-browser, isolated layout and user-confirmed normal Admin checks are distinguished above. Unsupported workflows and missing approved policy remain unavailable as documented previously.

## Rollback

The previous normal frontend image is retained locally as `isave-frontend-rollback:pre-ui-20261021`, image `sha256:56e93809a1b3ca8ca4127b453086c8fb79dbb660eab8a2ac30f38125d1881a10`. Source history and the existing working tree are retained; nothing was pushed, merged or publicly deployed.

If a rollback is needed, retag that saved image as `i-saveprototype-main-frontend:latest`, then recreate **only** the normal frontend using `docker compose -p i-saveprototype-main -f compose.yaml -f compose.mailpit.yaml up -d --no-deps --no-build frontend`. Do not rebuild in that rollback command. This restores the prior build without touching accounts or PostgreSQL; it does not add an old-interface choice to the product.
