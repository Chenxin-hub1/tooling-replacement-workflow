from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.db.migrations import migrate_database
from app.db.session import create_database_engine


async def test_fresh_database_migrates_and_restarts(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/fresh.db"
    await run_in_threadpool(migrate_database, url)
    await run_in_threadpool(migrate_database, url)
    engine = create_database_engine(url)
    async with engine.connect() as connection:
        assert (
            await connection.execute(text("SELECT version_num FROM alembic_version"))
        ).scalar() == "0002"
    await engine.dispose()


async def test_legacy_database_is_baselined_without_losing_rows(db_engine):
    async with db_engine.begin() as connection:
        await connection.execute(text("DROP TABLE workspaces"))
        await connection.execute(
            text(
                "INSERT INTO projects(id,pn,desc,created_at,updated_at) VALUES ('legacy','P','Keep','2026-01-01','2026-01-01')"
            )
        )
    await run_in_threadpool(migrate_database, str(db_engine.url))
    async with db_engine.connect() as connection:
        assert (
            await connection.execute(
                text("SELECT desc FROM projects WHERE id='legacy'")
            )
        ).scalar() == "Keep"
        assert (
            await connection.execute(text("SELECT version_num FROM alembic_version"))
        ).scalar() == "0002"


async def test_incompatible_legacy_schema_is_not_stamped(tmp_path):
    import pytest

    url = f"sqlite+aiosqlite:///{tmp_path}/broken.db"
    engine = create_database_engine(url)
    async with engine.begin() as connection:
        await connection.execute(text("CREATE TABLE projects (id TEXT PRIMARY KEY)"))
    with pytest.raises(RuntimeError, match="differs"):
        await run_in_threadpool(migrate_database, url)
    async with engine.connect() as connection:
        assert (
            await connection.execute(
                text("SELECT count(*) FROM sqlite_master WHERE name='alembic_version'")
            )
        ).scalar() == 0
    await engine.dispose()
