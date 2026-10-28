# i-Save Backend (Phase 1: Foundation)

Private ClamAV, scoped retention/legal holds and encrypted database/document
backups with isolated restore checks are documented in
[private document operations](../docs/private-document-operations.md). Normal
retention execution and live restore remain disabled; infrastructure keys stay
outside application settings and source code.

Opt-in development invitation capture is documented in
[local Mailpit testing](../docs/local-invitation-email.md). Production sending
remains disabled; no migration is required for the SMTP adapter.

The [fee-gated membership workflow](../docs/membership-activation.md) documents
the agreed US$20 fee gate, separate permissions/actions, activation, next-month
subscription and single-use setup invitations. Email delivery remains unavailable.

Python + FastAPI backend targeting PostgreSQL, with SQLAlchemy ORM and Alembic
migrations. The React/TanStack Start frontend preserves its design and connects
login/logout through a same-origin authentication bridge.

## Local development setup

No PostgreSQL is installed on this workstation, so local development and the
test suite run against a **SQLite file database**. This is explicit and
configurable via `DATABASE_URL` — never a silent substitution. Staging targets
PostgreSQL; point `DATABASE_URL` at a PostgreSQL instance when one is available.

### 1. Create a virtual environment and install dependencies

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
```

### 2. Configure environment

```powershell
copy .env.example .env
# edit .env as needed (DATABASE_URL defaults to a local SQLite file)
```

No real secrets or credentials are stored in the repository. `.env.example`
contains placeholders only.

### 3. Initialise the database schema

```powershell
alembic upgrade head
```

This creates all tables defined by the SQLAlchemy models in the configured
database (local SQLite by default).

For fresh local setup, prefer `python -m app.migrations upgrade`.
The activated normal Docker installation runs migrations only as its dedicated
maintenance identity; API/worker startup has no migration credential. Follow
[database security activation and recovery](../docs/database-security-activation.md)
and retain the purpose-specific Compose overlay for subsequent service starts.
The API never creates tables automatically. Existing untracked schemas must be
backed up and explicitly checked before recording migration history; see
[database operations](../docs/database-operations.md).

### 4. Start the API

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`.

- Health endpoint: `GET /health`
- Database readiness: `GET /ready` (503 if unavailable or migrations are not current)
- API documentation (development only): `GET /docs`, `GET /openapi.json`
- Entity routers are mounted under `/api/v1` (members, users, roles, plans,
  applications, fees, subscriptions, contributions, verifications, audit).

### 5. Run the tests

```powershell
pytest
```

## Database design

Core entities (each with primary key, foreign keys, unique constraints, indexes
and `created_at`/`updated_at` timestamps):

- `roles`, `permissions`, `role_permissions` — roles and permissions
- `users` — staff and member user accounts (password hash stored, never plaintext)
- `members` — registered savings members
- `savings_plans`, `member_plans` — savings plans and enrolments
- `consent_records` — member consent records
- `membership_applications` — membership applications
- `registration_fees` — one-time registration fees
- `subscriptions` — monthly subscription records
- `contributions` — savings contributions
- `payment_verifications` — payment verification / reconciliation records
- `audit_events` — immutable audit log

Registration fees, subscriptions and savings contributions are separate
financial record types. A contribution starts as `Pending verification` and is
not confirmed savings until a verification record marks it `Verified`; pending
contributions are never counted as confirmed savings.

No withdrawal, interest, bonus, penalty or refund policies are implemented.

## Security

- Secrets live in environment variables (`.env`), never in committed source.
- Passwords use bcrypt directly. Revocable bearer sessions store token hashes.
- Private entity APIs require server-side permissions and member ownership;
  plan browsing remains public. Initial administrators use a controlled CLI.
- See [authentication operations](../docs/authentication-operations.md) for setup,
  session contracts, permission defaults and intentionally disabled workflows.
  Frontend login uses the same-origin bridge described in
  [frontend authentication](../docs/frontend-authentication.md).
  Invitations, recovery and public registration remain follow-ups.

## Migration status

Alembic migrations live in `alembic/versions/`. Generate a new migration with:

```powershell
alembic revision --autogenerate -m "describe the change"
python -m app.migrations upgrade
```
