from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.models import Base


def create_database_engine(url: str, *, echo: bool = False) -> AsyncEngine:
    database_engine = create_async_engine(url, echo=echo)
    if database_engine.dialect.name == "sqlite":

        @event.listens_for(database_engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=10000")
            cursor.close()

    return database_engine


engine = create_database_engine(settings.DATABASE_URL, echo=settings.DEBUG)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def init_db(database_engine: AsyncEngine | None = None) -> None:
    async with (database_engine or engine).begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
