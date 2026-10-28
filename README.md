# I Saveprototype

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://i-saveprototype.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/df48f85c-5719-4308-8955-d7b3b5c12249).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Docker

The existing normal installation activated database hardening on 27 October
2026. Use [the activation runbook](docs/database-security-activation.md) and
`scripts/normal-compose.ps1` with its private environment file; always include
the role overlay last and name services explicitly. Bare Compose commands below
are for a **fresh, unactivated development installation**, not that normal stack.
Normal migrations use the dedicated maintenance identity, never the API service.
Run regression tests in the standalone isolated test configuration, not normal
PostgreSQL. Do not implicitly start Mailpit or overwrite existing volumes.

The whole stack (frontend, backend, PostgreSQL) runs with Docker Compose — no Node.js or Python needed on the host:

```sh
cp .env.example .env   # optional; the committed .env.example contains placeholders only
docker compose up -d
```

- Frontend (TanStack Start / Nitro SSR): http://localhost:3000
- Backend API (FastAPI): http://127.0.0.1:8000 (bound to localhost only)
- PostgreSQL: 127.0.0.1:5432 (bound to localhost only); data persists in the `i_save_postgres_data` volume

The backend starts only after PostgreSQL passes its health check. No real credentials are committed — secrets live in `.env` (never committed) or compose environment variables.

Backend commands (run against the Compose service):

```sh
# Test suite (runs against SQLite defaults, so DATABASE_URL/SECRET_KEY are unset):
docker compose run --rm backend sh -c 'unset DATABASE_URL SECRET_KEY; pytest -q'

# Apply Alembic migrations to the PostgreSQL service:
docker compose run --rm backend alembic -c alembic.ini upgrade head

# Stop the stack:
docker compose down
```

Local development is unchanged: the existing SQLite setup works without Docker.

The backend now applies Alembic migrations before Docker startup. For an existing
database originally created by API startup without migration history, follow the
[database stabilisation runbook](docs/database-operations.md) before restarting.
The [delivery roadmap](docs/delivery-roadmap.md) tracks the remaining work from
authentication through controlled rollout.
