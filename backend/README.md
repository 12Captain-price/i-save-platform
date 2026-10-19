# i-Save Backend (Phase 1: Foundation)

Python + FastAPI backend targeting PostgreSQL, with SQLAlchemy ORM and Alembic
migrations. The existing React/TanStack Start frontend is **untouched**.

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

### 4. Start the API

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`.

- Health endpoint: `GET /health`
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
- Password hashing (bcrypt via passlib) is provided in `app/security/hashing.py`
  and ready for Phase 2 authentication; no server-side auth endpoints exist yet.
- Frontend-only permission checks are not treated as security; authorisation
  is enforced on the backend.

## Migration status

Alembic migrations live in `alembic/versions/`. Generate a new migration with:

```powershell
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```
