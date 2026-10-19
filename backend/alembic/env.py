"""Alembic environment configuration.

Configures the SQLAlchemy URL from the application settings (``DATABASE_URL``
environment variable or ``backend/.env``) and registers all SQLAlchemy model
metadata so ``alembic revision --autogenerate`` can detect schema changes.

Local development uses SQLite by default; staging targets PostgreSQL by setting
``DATABASE_URL`` to a PostgreSQL connection string. No secrets are stored here.
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Import the application settings and models so that Base.metadata is fully
# populated before Alembic inspects it for autogeneration.
from app.config import get_settings  # noqa: E402
from app.database import Base  # noqa: E402

import app.models.application  # noqa: E402,F401
import app.models.audit_event  # noqa: E402,F401
import app.models.consent_record  # noqa: E402,F401
import app.models.contribution  # noqa: E402,F401
import app.models.registration_fee  # noqa: E402,F401
import app.models.member  # noqa: E402,F401
import app.models.member_plan  # noqa: E402,F401
import app.models.permission  # noqa: E402,F401
import app.models.role  # noqa: E402,F401
import app.models.role_permission  # noqa: E402,F401
import app.models.savings_plan  # noqa: E402,F401
import app.models.subscription  # noqa: E402,F401
import app.models.user  # noqa: E402,F401
import app.models.verification  # noqa: E402,F401

settings = get_settings()

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the application-configured database URL unless the Alembic config (or a
# caller such as the test suite) has already set an explicit sqlalchemy.url.
placeholder = "driver://user:pass@localhost/dbname"
configured_url = config.get_main_option("sqlalchemy.url")
if not configured_url or configured_url == placeholder:
    config.set_main_option("sqlalchemy.url", str(settings.database_url))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
