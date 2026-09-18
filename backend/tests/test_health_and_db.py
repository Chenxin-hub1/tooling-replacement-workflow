from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker


async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"


async def test_db_init_and_tables(db_engine):
    async with async_sessionmaker(db_engine)() as session:
        tables = (
            (
                await session.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                )
            )
            .scalars()
            .all()
        )
        assert {"projects", "team_members", "project_actions"} <= set(tables)
        assert (await session.execute(text("PRAGMA foreign_keys"))).scalar() == 1
        assert (await session.execute(text("PRAGMA journal_mode"))).scalar() == "wal"


async def test_health_reports_database_failure(client, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.ext.asyncio import AsyncSession

    async def fail(*args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("Unavailable"))

    monkeypatch.setattr(AsyncSession, "execute", fail)
    response = await client.get("/health")
    assert response.status_code == 503
    assert response.json()["detail"] == "Database unavailable"
