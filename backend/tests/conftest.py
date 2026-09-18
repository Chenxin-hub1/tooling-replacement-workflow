import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.session import create_database_engine, get_db, init_db
from app.main import app


@pytest.fixture
async def db_engine(tmp_path):
    engine = create_database_engine(f"sqlite+aiosqlite:///{tmp_path}/test.db")
    await init_db(engine)
    yield engine
    await engine.dispose()


@pytest.fixture
async def client(db_engine):
    sessions = async_sessionmaker(db_engine, expire_on_commit=False, autoflush=False)

    async def test_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
