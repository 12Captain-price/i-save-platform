"""Migration-owned startup and explicit adoption of the original ORM schema.

Run from backend: python -m app.migrations {status,upgrade,baseline}.
Baseline is read-only unless --apply is given and never changes business rows.
"""
import argparse
import re
from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text, UniqueConstraint, MetaData
from sqlalchemy.engine import Engine

from app.database import Base, engine
import app.models  # noqa: F401


INITIAL_REVISION = "0001_initial_schema"
ADOPTION_HEAD = "0008_plan_drafts"
AUTH_TABLES = {"auth_sessions", "user_permissions", "login_throttles", "registration_submissions", "application_events", "savings_interests", "application_submissions", "application_registration_payments", "membership_approvals", "password_setup_invitations", "plan_drafts", "plan_draft_versions"}
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def migration_config(connection=None) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def require_current_schema(database: Engine, *, verify_structure: bool = True) -> None:
    """Read-only startup gate; never create or adopt tables inside the API."""
    heads = set(ScriptDirectory.from_config(migration_config()).get_heads())
    with database.connect() as connection:
        current = set(MigrationContext.configure(connection).get_current_heads())
        tables = set(inspect(connection).get_table_names())
        differences = (
            schema_differences(connection)
            if verify_structure and current == heads and set(Base.metadata.tables).issubset(tables)
            else []
        )
    if current != heads or not set(Base.metadata.tables).issubset(tables):
        raise RuntimeError(
            "Database schema is not at the required Alembic revision. Run "
            "'python -m app.migrations upgrade' from backend. For existing "
            "untracked tables, follow docs/database-operations.md; do not stamp blindly."
        )
    if differences:
        raise RuntimeError(
            "Database schema differs from the expected structure; review migrations before startup: "
            + "; ".join(differences)
        )


def _unique_keys(inspector, table: str) -> set[tuple[str, ...]]:
    # create_all uses unique indexes for unique=True,index=True; the initial
    # migration uses a unique constraint plus a nonunique lookup index.
    return {
        tuple(item["column_names"])
        for item in inspector.get_unique_constraints(table)
    } | {
        tuple(item["column_names"])
        for item in inspector.get_indexes(table)
        if item["unique"]
    }


def schema_differences(connection, *, legacy: bool = False) -> list[str]:
    """Compare the current ORM structure (or its known legacy layout).

    Server defaults may be absent where the ORM supplied Python defaults, or
    match their known original values. Columns, types, nullability, PKs, FKs,
    unique keys and lookup indexes must match. Names of equivalent unique
    constraints may differ.
    """
    inspector = inspect(connection)
    # Freeze the original pre-Alembic enrolment layout for legacy adoption.
    # Revision 0002 then supplies the missing timestamps without losing rows.
    original_metadata = MetaData()
    for table in Base.metadata.sorted_tables:
        if legacy and table.name in AUTH_TABLES:
            continue
        table.to_metadata(original_metadata)
    if legacy:
        for name in ("created_at", "updated_at"):
            original_metadata.tables["member_plans"]._columns.remove(
                original_metadata.tables["member_plans"].columns[name]
            )
    expected_tables = set(original_metadata.tables)
    actual_tables = set(inspector.get_table_names()) - {"alembic_version"}
    differences = []
    if actual_tables != expected_tables:
        differences.append("Table set differs from the original 14-table schema" if legacy else "Table set differs from the expected schema")
    if inspector.get_view_names():
        differences.append("Unexpected views need manual review")

    def include_object(obj, name, kind, reflected, compare_to):
        return kind not in {"index", "unique_constraint"} and name != "alembic_version"

    differences.extend(
        str(item)
        for item in compare_metadata(
            MigrationContext.configure(connection, opts={
                "compare_type": True,
                "compare_server_default": False,
                "include_object": include_object,
            }),
            original_metadata,
        )
    )
    for table in sorted(actual_tables & expected_tables):
        model = original_metadata.tables[table]
        expected_unique = {
            tuple(col.name for col in constraint.columns)
            for constraint in model.constraints
            if isinstance(constraint, UniqueConstraint)
        } | {
            tuple(col.name for col in index.columns)
            for index in model.indexes if index.unique
        }
        if _unique_keys(inspector, table) != expected_unique:
            differences.append(f"{table}: unique keys differ")
        for index in inspector.get_indexes(table):
            options = index.get("dialect_options", {})
            if any(key.endswith("_where") for key in options):
                differences.append(f"{table}: partial indexes need review")
        actual_indexes = {
            tuple(index["column_names"]) for index in inspector.get_indexes(table)
            if not index.get("duplicates_constraint")
        }
        expected_indexes = {
            tuple(col.name for col in index.columns) for index in model.indexes
        }
        if actual_indexes != expected_indexes:
            differences.append(f"{table}: lookup indexes differ")
        actual_pk = tuple(inspector.get_pk_constraint(table)["constrained_columns"])
        if actual_pk != tuple(col.name for col in model.primary_key.columns):
            differences.append(f"{table}: primary key differs")
        if inspector.get_check_constraints(table):
            differences.append(f"{table}: unexpected check constraints")
        for column in inspector.get_columns(table):
            original = model.columns.get(column["name"])
            if original is None:
                continue
            default = column.get("default")
            if original.primary_key and original.autoincrement in {True, "auto"}:
                expected_sequence = f"nextval('{table}_{column['name']}_seq'::regclass)"
                if default is None or str(default) == expected_sequence:
                    continue
            expected_default = original.server_default
            if expected_default is not None:
                allowed = {"now()", "CURRENT_TIMESTAMP"}
            elif original.default is not None and original.default.is_scalar:
                value = original.default.arg
                allowed = {str(value), f"'{value}'"}
                if isinstance(value, bool):
                    allowed = {"true", "1"} if value else {"false", "0"}
            else:
                allowed = set()
            if default is None:
                if expected_default is not None:
                    differences.append(f"{table}.{column['name']}: missing server default")
                continue
            normalised = re.sub(r"::[a-zA-Z ]+(?:\[\])?$", "", str(default))
            if normalised.startswith("(") and normalised.endswith(")"):
                normalised = normalised[1:-1]
            if normalised not in allowed:
                differences.append(f"{table}.{column['name']}: unexpected server default")
    return differences


@contextmanager
def migration_connection(database: Engine):
    with database.connect() as connection:
        # Serialise this CLI's migration/baseline commands across containers.
        postgres = connection.dialect.name == "postgresql"
        if postgres:
            connection.execute(text("SELECT pg_advisory_lock(7341592601)"))
            connection.commit()
        try:
            yield connection
        finally:
            if postgres:
                connection.rollback()
                connection.execute(text("SELECT pg_advisory_unlock(7341592601)"))
                connection.commit()


def upgrade(database: Engine = engine) -> None:
    with migration_connection(database) as connection:
        current = MigrationContext.configure(connection).get_current_heads()
        tables = set(inspect(connection).get_table_names()) - {"alembic_version"}
        connection.commit()
        if not current and tables:
            raise RuntimeError(
                "Existing untracked tables detected. Back up and run "
                "'python -m app.migrations baseline' to inspect; nothing was changed."
            )
        command.upgrade(migration_config(connection), "head")
    require_current_schema(database)


def baseline(database: Engine = engine, *, apply: bool = False) -> None:
    with migration_connection(database) as connection:
        scripts = ScriptDirectory.from_config(migration_config())
        if scripts.get_heads() != [ADOPTION_HEAD]:
            raise RuntimeError("Legacy adoption needs review after additional migrations are introduced")
        if MigrationContext.configure(connection).get_current_heads():
            raise RuntimeError("Database already has migration history; baseline refused")
        differences = schema_differences(connection, legacy=True)
        if differences:
            raise RuntimeError("Baseline refused: " + "; ".join(differences))
        connection.commit()
        if apply:
            command.stamp(migration_config(connection), INITIAL_REVISION)
            print("Recorded initial revision; business tables and rows were not changed.")
        else:
            print("Original schema matches. Read-only check; back up before baseline --apply.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["status", "upgrade", "baseline"])
    parser.add_argument("--apply", action="store_true", help="Explicitly record a verified legacy baseline")
    args = parser.parse_args()
    if args.apply and args.action != "baseline":
        parser.error("--apply is only valid with baseline")
    try:
        if args.action == "status":
            require_current_schema(engine)
            print("Database is at the required Alembic revision.")
        elif args.action == "upgrade":
            upgrade()
        else:
            baseline(apply=args.apply)
    except RuntimeError as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
