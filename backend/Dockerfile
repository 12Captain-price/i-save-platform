# Backend image for i-Save (FastAPI + SQLAlchemy + Alembic).
#
# Python 3.12 is used: every pinned dependency in requirements.txt supports it.
# Python 3.15 is deliberately not used — it is not dependency-compatible.
FROM python:3.12-slim

WORKDIR /app/backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# No extra system packages are required: psycopg[binary] ships wheels, so no
# libpq/gcc toolchain is needed in this slim image.
COPY requirements.txt .
RUN pip install --no-cache-dir --no-cache -r requirements.txt

# Application code only. .env, local SQLite databases and test caches are
# excluded by .dockerignore and never enter the image.
COPY app ./app
COPY alembic ./alembic
COPY tests ./tests
COPY alembic.ini .env.example ./

EXPOSE 8000

# Migrate before serving; refuse legacy untracked schemas until explicitly
# inspected and baselined. Never silently stamp or drop an existing database.
CMD ["sh", "-c", "python -m app.migrations upgrade && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
