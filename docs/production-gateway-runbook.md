# Production gateway and launch-mode runbook

## Scope and current status

This change addresses release-readiness findings R1–R3 and the public catalogue part of R10. The goal remains the **full platform**. Launch modes are enforceable safeguards, not an approval or a decision to launch an informational-only website. No normal mode, services, credentials or schema were changed. No external sending or public deployment is enabled.

`compose.staging.yaml` is a standalone hosted profile, **never an overlay on `compose.yaml`**. It is portable to an organisation-controlled Linux Docker host, independent of a developer laptop once its private configuration, DNS, certificates and managed database are supplied. It does not provision those resources. The existing `render.yaml` remains a frontend-only legacy deployment description, not a complete release configuration.

## Trust boundary and routing

Supported chain:

1. Browser connects directly to the Nginx HTTPS gateway. HTTP redirects to the configured canonical HTTPS origin. The gateway checks Host and overwrites client assertions; caller-supplied `Forwarded`, `X-Forwarded-*` and `X-Isave-*` cannot select a client identity.
2. Nginx sends a private secret assertion, HTTPS assertion and its actual TCP peer address to Node SSR. Node validates the secret with a constant-time comparison, validates the address and canonical Host, reconstructs the public HTTPS request URL and removes the secret before SSR handling.
3. The server-only backend transport uses request-scoped async context. It forwards only validated identity and a private assertion to the fixed backend origin. Concurrent requests cannot inherit another client's identity. No shared mutable per-request global state is used.
4. FastAPI validates the private assertions before interpreting HTTPS or client identity. Uvicorn keeps ordinary proxy-header parsing **disabled**. Backend host/scheme use the configured public origin; production automatic slash redirects are disabled. Endpoint permissions, ownership, policy gates and transactions remain in force.

Only gateway ports are published. Node, FastAPI, scanner and workers have no published ports. `/api/v1/` is not a public gateway route; browser APIs use the existing fixed Node bridge. API process/readiness endpoints are private and return no secrets. The frontend `/healthz` endpoint is minimal liveness, not proof that the database, scanner, workers or backup system works.

The private assertion is a service credential, **not a user session**. It does not grant endpoint permissions. Store it outside source/build contexts; rotate gateway, frontend and backend together under a maintenance procedure. Restrict internal networks and operator access. Plain HTTP internal hops are supported only on the controlled private deployment network; use a reviewed encrypted service network/mTLS if spreading them over untrusted hosts.

**Supported ingress limit:** one directly reachable TLS gateway, with one or more Node/API workers sharing one PostgreSQL database and consistent configuration/keys. Do not place an HTTP CDN or load balancer in front and trust its headers automatically: the current TCP peer would become that intermediary. A provider-specific authenticated forwarding/source-IP design is required first. The single Compose host itself is not highly available.

### Rate and request limits

- PostgreSQL atomic upserts remain the authoritative shared login/recovery/registration limits across API processes/replicas. The client key now uses the gateway-observed address instead of the Node container address. Account limits remain independent.
- Existing limits remain ten attempts per fifteen-minute window for the applicable key; successes also count. People behind the same public NAT share that IP budget. Evaluate legitimate office traffic before changing thresholds. Keep host clocks synchronised.
- Nginx adds a per-source-address **API-only** 180 requests/minute coarse limit with burst30 and HTTP429. HTML/assets do not consume this budget: the browser rehearsal caught and corrected an initial asset-budget collision that blocked logout. That edge budget is shared within one Nginx instance, not a distributed multi-gateway limiter. No sticky sessions are needed for the database limiter. See the [official Nginx limiter key semantics](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).
- Nginx caps bodies at9MiB and bounds slow body reception. Node auth/setup/recovery streams are capped at4096bytes. FastAPI independently bounds production auth bodies to4096bytes and other mutation bodies to9MiB; existing evidence/media/support limits still apply below that ceiling.
- Logout is exempt from the coarse API budget so users can revoke a session even after other requests are limited. It still requires the existing origin/session safeguards; exemption grants no financial or account authority.
- Uncertain financial/delivery outcomes must still use the existing workflow-specific retry controls. Gateway retries must never blindly replay mutations.

## Launch modes and public entry-point inventory

Configure **backend/worker `LAUNCH_MODE`** consistently. It is not an Admin business policy. The public availability endpoint is derived from that backend setting; the frontend does not maintain a second policy value.

| Mode | Effect |
| --- | --- |
| `informational` | Public contacts, published content, requirements, effective plan information and availability remain readable. Registration, assisted intake, private uploads, plan applications, campaigns and financial mutations are blocked server-side. Authenticated Admins retain existing permission-checked configuration/content/operations access and protected reads. Other protected operational reads are closed. |
| `applications` | Public/assisted pending intake and evidence replacement/review are available with existing consent, scan, permission and published collection rules. Protected reads and support/notification/preference actions remain permission-checked. Membership approval/activation, fee/payment posting, plan application/activation, savings, subscription generation, withdrawals and campaigns remain blocked. |
| `full` | Removes only the launch-mode gate. Does **not** enable unavailable email, remove permissions, publish policies, configure withdrawals, create payment, override scanning or approve a plan. Existing safeguards remain authoritative. |

Hosted production defaults to `informational` **when no mode is supplied**, as a fail-closed safeguard. Existing development/test installations default to `full`, preserving local behaviour. The normal application's effective mode was not changed. Selecting a mode for hosting requires an explicit operator/owner decision; the full-platform release remains the target.

The backend mutation inventory is in `app/security/launch.py`, with unlisted restricted-mode writes denied. Review new endpoints against this inventory. Operational exceptions are restricted to administrator sessions **and** the original endpoint permissions; they exclude financial processing. `app.subscription_schedule` independently refuses generation outside full mode. Campaign delivery checks the mode in the worker service too.

Explicitly handled public actions:

- Login/logout, setup, recovery/reset and authenticated password change remain reachable through their own security checks; this does not mean external recovery mail works. Production mail remains disabled.
- Campaign unsubscribe POST remains reachable in every mode so existing optional-email links can withdraw consent. GET/prefetch does not change consent. Ordinary promotional preference editing is available in applications/full modes; no consent is seeded.
- `/register` and restricted workspace content show accessible availability/loading/failure/retry panels, while the portal shell keeps logout available. Home links may lead to the truthful unavailable page; they do not bypass it.
- The old anonymous `/api/v1/plans` and `/{id}` catalogue is now permission-protected (`plans:read`). It is retained for authorised legacy administration, not a public product feed. Public `/api/v1/public/plan-offers` remains the only formal offer catalogue, using effective complete published terms. Category cards remain expressions of interest. No plan, publication or accepted snapshot was changed.

## Required configuration

Set non-secret values through the host's protected deployment configuration. Provide secret **file paths**, not secret values in committed files, command arguments, tickets or screenshots. Do not run expanded `docker compose config`, `docker inspect .Config.Env`, Nginx configuration dumps or shell tracing into ordinary logs.

| Value | Requirement |
| --- | --- |
| `STAGING_PROJECT` | Unique project name; never the normal project name. Volumes are project-scoped. |
| `STAGING_DEPLOYMENT_TIER` | Defaults to `staging` for isolated synthetic acceptance. Promotion requires explicit `production`; production API/worker startup refuses reserved synthetic account/application addresses, synthetic member identifiers, fixture audit markers and explicitly labelled published test policies/rates. The guard is read-only and never cleans records automatically. |
| `STAGING_PUBLIC_ORIGIN` | Approved canonical HTTPS origin, optionally including the staging port; no trailing path/query/fragment, localhost or test-domain public links. DNS and TLS certificate must match. |
| `STAGING_LAUNCH_MODE` | Explicit `informational`, `applications` or `full`; safe fallback informational. Owner decision, not inferred from test success. |
| `STAGING_BIND`, HTTP/HTTPS ports | Defaults bind only127.0.0.1 at13081/13443. A hosted operator must explicitly choose interface/80/443 and firewall rules; nothing here exposes the laptop publicly. |
| `STAGING_DATABASE_URL_FILE` | Private PostgreSQL DSN file for the isolated hosted database. Use provider private networking and verified database TLS where applicable. No normal DSN, SQLite, localhost DB, test/rehearsal database or placeholder password. Runtime least-privilege migration/backup identities are a separate readiness task. |
| `STAGING_APPLICATION_KEY_FILE` | Independent random application secret, at least32characters; never the development placeholder. |
| `STAGING_GATEWAY_TOKEN_FILE` | Independent random URL-safe service credential,32–128characters, shared only by gateway/Node/API workers. |
| `STAGING_TLS_CERT_FILE`, `STAGING_TLS_KEY_FILE` | Approved certificate chain and private key files. Certificate renewal/rotation is an infrastructure responsibility. Self-signed certificates are only for the isolated local rehearsal. |
| `STAGING_BACKUP_KEY_FILE` | Private32byte archive key, independently escrowed. Never put key contents in business settings. |
| `STAGING_RESTORE_URL_FILE` | Private DSN for the independent restore target; source-host restore remains refused. Profile requires the file path even while the optional operations service is disabled. |

Backend `APP_ENV=production`, debug off, matching HTTPS setup origin/CORS, real scanner host, synthetic scanning off and external mail/campaigns disabled are set by the profile. Frontend `ISAVE_ENV=production` validates its canonical origin, fixed internal backend route and secret file. Invalid environment names fail rather than silently falling back.

Backend startup validates its private configuration before opening the API. It refuses unsafe defaults, SQLite/test targets, test fixture/clock flags and the known rehearsal clock file, synthetic scanners, Mailpit routing/senders, localhost public URLs and unsupported production sending. The hosted API/operations images exclude rehearsal launchers from exported layers. The frontend context excludes local evidence, scripts and private rehearsal configuration; only Nitro output enters its runtime image. The API image has a non-root runtime and no tests. These checks reduce contamination risk; release data still needs a deliberate inventory so synthetic **records/policies** are never promoted into production.

The production data guard runs in API lifespan and account/operations/scheduled-worker entry points. It rejects known fixture markers, including published settings/plan/rate text labelled TEST ONLY, TEST-ONLY or disposable rehearsal; unpublished experimental drafts are not published policy. It cannot infer whether every otherwise unlabelled record or policy was management-approved. Keep the release inventory and approval gate. If blocked, review privately on an isolated recovery target; do not delete audit history, reset accounts or relabel a live deployment staging as a workaround.

Node uses a shared configuration preload before listening, not only on its first request. Hosted application error logging suppresses raw exceptions/argument objects; local diagnostics remain available. Keep infrastructure logs redacted too. Secret-file permissions must allow the relevant container UID to read its read-only mount while restricting host access; confirm this on Linux instead of assuming Windows ACL behaviour transfers. Never export intermediate rehearsal images/build caches as release artifacts.

## Services, persistence and hosted operation

- Hosted PostgreSQL holds both records and private document bytes. Its durable storage, encryption, backup/PITR and connection limits must be supplied by the operator/provider. This profile does not create a managed database or copy normal data.
- `scanner_signatures` persists real ClamAV definitions. Scanner port3310 is private; outbound signature updates and memory/update headroom are required. Uploads remain unavailable if freshness/health fails.
- `encrypted_archives` persists local encrypted archives for the optional operations worker. Off-site copies, alerts, key recovery and independent restore compatibility still need completion. Local persistence is not off-site protection.
- Account worker is long-lived; production email remains explicitly unavailable. Essential email dispatch is still incomplete. Scheduler, scanner and workers do not expose user interfaces or ports.
- A host scheduler invokes the one-shot subscription service; running the command once does not install a scheduler. Worker heartbeat, queue-age/failure and signature/backup freshness monitoring remain release requirements.
- No production resource provider, certificate purchase, DNS record or external email service was provisioned by this task.

## Deployment sequence — future authorised activation

Run these only on the separately configured staging/hosting target, with private configuration loaded without echo. Never combine this file with normal Compose:

```sh
docker compose -f compose.staging.yaml config --quiet
docker compose -f compose.staging.yaml build backend frontend
# Explicit release job; API startup does not migrate:
docker compose -f compose.staging.yaml --profile maintenance run --rm migrate
docker compose -f compose.staging.yaml up -d
```

Before any existing/normal database migration: separately authorise activation, take the private encrypted backup, independently restore and verify preservation. **No new migration is required for this code change.** It expects the existing0018 schema. No normal migration or restart was performed.

When operations prerequisites are complete:

```sh
docker compose -f compose.staging.yaml --profile operations up -d operations-worker
# Scheduler invocation; unavailable outside full mode:
docker compose -f compose.staging.yaml --profile scheduled run --rm subscription-schedule
```

The default profile has no database/scanner/worker published ports. Confirm the actual host firewall and provider networking rather than assuming the Compose topology is sufficient. The existing operations restore code needs compatibility testing with managed PostgreSQL privileges before provider selection is final.

Changing mode requires controlled recreation of the isolated/hosted backend and relevant workers, not a database edit. Verify `/api/public/availability`, UI state and a negative direct-API check after the change. Keep replicas consistent; do not run mixed launch modes behind one gateway.

Normal activation is separate: deploy matching backend and frontend versions together so the new availability endpoint exists before enabling the new UI. No normal restart is authorised by this runbook or this task. A later hosted promotion must explicitly select production tier and its owner-approved launch mode; staging success does not approve that promotion.

For rollback, disable affected intake/actions, retain prior image digests and restore the previous compatible configuration/images. Do not downgrade financial history or overwrite live PostgreSQL. Restore rehearsals remain isolated; live cutover requires explicit authorisation and reconciliation of later writes.

## Validation and remaining work

Final test counts and preservation checks are recorded in the release-readiness addendum. Automated rehearsal uses a unique PostgreSQL volume and local self-signed HTTPS certificate, minimal synthetic Admin/Member accounts and no Mailpit or external sending. No manual financial flow is repeated.

Final results: full backend704passed/0failed/11skipped; final affected backend268passed/0failed/0skipped; full frontend175passed/0failed/0skipped; final affected frontend59passed/0failed/0skipped. TypeScript and hosted frontend/API/operations builds passed. The full backend run preceded the final production-data guard/configuration expansion, which is covered by the affected run; do not present these counts as additive or as another final full collection. Gateway/browser, replica, saturation and startup results are detailed in [release readiness](release-readiness.md#implementation-validation-and-preservation).

The isolated projects are now stopped with persistent storage retained. All eight normal containers retained identity/start/state; normal Mailpit remains stopped. No normal activation or migration occurred. Detailed rehearsal inputs and logs remain private and excluded from Git/build contexts. Reopening this rehearsal requires its private configuration and an explicit staging tier; do not copy its accounts/policies into a production database.

Passing these tests does **not** establish production readiness. Remaining blockers include approved public/legal copy and collection lifecycle, least-privilege database/audit protection, off-site recovery/key custody/alerts, a production account-email adapter, approved actual operational policies/roles, capacity/accessibility/security scanning and acceptance on the chosen hosted network.

**Next implementation task:** least-privilege database and audit hardening, with separate runtime/migration/backup identities and compatibility tests for the selected managed PostgreSQL/restore target. Keep provider email and recovery infrastructure as explicit following release gates; do not treat launch mode `full` as satisfying them.
