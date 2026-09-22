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
        ).scalar() == "0005"
    await engine.dispose()


async def test_legacy_database_is_baselined_without_losing_rows(db_engine):
    async with db_engine.begin() as connection:
        await connection.execute(text("DROP TABLE workspaces"))
        # 模拟真实的未版本化 Phase-1 老库：0001 基线不含 v2 的 status/orig 列。
        await connection.execute(text("ALTER TABLE project_actions DROP COLUMN status"))
        await connection.execute(text("ALTER TABLE project_actions DROP COLUMN orig"))
        await connection.execute(
            text("ALTER TABLE project_actions DROP COLUMN date_log")
        )
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
        ).scalar() == "0005"


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


async def test_date_history_migration_preserves_existing_dates_and_completion(
    db_engine,
):
    async with db_engine.begin() as connection:
        await connection.execute(
            text("ALTER TABLE project_actions DROP COLUMN date_log")
        )
        await connection.execute(
            text(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            )
        )
        await connection.execute(text("INSERT INTO alembic_version VALUES ('0004')"))
        await connection.execute(
            text(
                "INSERT INTO projects(id,pn,desc,created_at,updated_at) VALUES ('P','P','Keep','2026-01-01','2026-01-01')"
            )
        )
        await connection.execute(
            text(
                "INSERT INTO project_actions(id,project_id,ph,tab,act,input_type,fn,is_custom,value,orig,done_date) VALUES ('P-2','P',1,'FOT Date','FOT','Date','SDE',0,'2026-11-01','2026-04-01','2026-09-01')"
            )
        )
        for identifier, act, custom in (
            ("P-9", "Identify if applicable or not", False),
            ("P-10", "Input CR number for CVS on Windchill", False),
            ("custom-cvs", "Input CR number for CVS on Windchill", True),
        ):
            await connection.execute(
                text(
                    "INSERT INTO project_actions(id,project_id,ph,tab,act,input_type,fn,is_custom,value,status,done_date,dep_id) VALUES (:id,'P',2,'CVS CR',:act,'CR number','ENG',:custom,'CR-1','approved','2026-09-01','P-2')"
                ),
                {"id": identifier, "act": act, "custom": custom},
            )
    await run_in_threadpool(migrate_database, str(db_engine.url))
    async with db_engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT value,orig,done_date,date_log FROM project_actions WHERE id='P-2'"
                )
            )
        ).one()
        assert tuple(row) == ("2026-11-01", "2026-04-01", "2026-09-01", "[]")
        rows = (
            await connection.execute(
                text(
                    "SELECT id,ph,value,status,done_date,dep_id FROM project_actions WHERE tab='CVS CR' ORDER BY id"
                )
            )
        ).all()
        assert [tuple(row) for row in rows] == [
            ("P-10", 1, "CR-1", "approved", "2026-09-01", "P-2"),
            ("P-9", 1, "CR-1", "approved", "2026-09-01", "P-2"),
            ("custom-cvs", 2, "CR-1", "approved", "2026-09-01", "P-2"),
        ]
