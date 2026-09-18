from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.excel import router as excel_router
from app.api.routes import router
from app.api.workspace import router as workspace_router
from app.config import settings
from app.db.migrations import migrate_database
from app.db.session import get_db
from app.static import SPAStaticFiles


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 使用版本化迁移建表；旧版无版本号数据库先验证结构。
    await run_in_threadpool(migrate_database, settings.DATABASE_URL)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Set CORS
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


app.include_router(router, prefix=settings.API_V1_STR)
app.include_router(excel_router, prefix=settings.API_V1_STR)
app.include_router(workspace_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
async def health_check(db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        await db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(503, "Database unavailable") from exc
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": "connected",
    }


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")
