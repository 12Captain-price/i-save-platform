"""Tests that the Alembic migration can upgrade and downgrade cleanly."""
import os
import tempfile

from alembic import command
from alembic.config import Config


def _alembic_config(database_url: str) -> Config:
    config = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_alembic_upgrade_head_and_downgrade_base():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "migration_test.db")
        database_url = f"sqlite:///{db_path}"
        config = _alembic_config(database_url)

        command.upgrade(config, "head")
        # If we reach here, the migration applied without error.
        assert os.path.exists(db_path)

        command.downgrade(config, "base")
