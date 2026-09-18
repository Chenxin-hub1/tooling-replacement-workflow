import asyncio
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import MetaData, inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base


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
