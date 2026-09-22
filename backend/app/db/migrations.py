import asyncio
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import MetaData, inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base

# v2 迁移 0003 起，0001 基线之后新增的列在此排除，使 needs_baseline 始终比对
# "Phase-1 基线"结构（0001 全部表、不含 workspaces 与后续增量列）。
BASELINE_EXCLUDED_COLUMNS = {
    ("project_actions", "status"),
    ("project_actions", "orig"),
    ("project_actions", "date_log"),
}


async def needs_baseline(url: str) -> bool:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:

            def check(sync_connection):
                tables = set(inspect(sync_connection).get_table_names())
                if "alembic_version" in tables or not (
                    tables & set(Base.metadata.tables)
                ):
                    return False
                baseline = MetaData()
                for table in Base.metadata.sorted_tables:
                    if table.name != "workspaces":
                        table.to_metadata(baseline)
                for table_name, column_name in BASELINE_EXCLUDED_COLUMNS:
                    column = baseline.tables[table_name].columns[column_name]
                    baseline.tables[table_name]._columns.remove(column)
                if compare_metadata(
                    MigrationContext.configure(sync_connection), baseline
                ):
                    raise RuntimeError(
                        "Unversioned database schema differs from the Phase-1 baseline. Back up and review before migrating."
                    )
                return True

            return await connection.run_sync(check)
    finally:
        await engine.dispose()


def migrate_database(url: str) -> None:
    """接入已验证的旧版结构，随后执行版本化迁移；结构不符时拒绝自动接入。"""
    backend = Path(__file__).resolve().parents[2]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    config.attributes["connection_url_override"] = True
    if asyncio.run(needs_baseline(url)):
        command.stamp(config, "0001")
    command.upgrade(config, "head")
