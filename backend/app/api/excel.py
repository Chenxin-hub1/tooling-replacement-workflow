from typing import Annotated
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.api.routes import Database, WriteDatabase, save
from app.models import Project
from app.schemas.excel import ImportReport
from app.services.excel import (
    MAX_UPLOAD,
    Mode,
    export_workbook,
    parse_workbook,
    prepare_import,
)

router = APIRouter(prefix="/excel", tags=["Excel"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def parse_upload(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(422, "Upload a .xlsx workbook")
    content = await file.read(MAX_UPLOAD + 1)
    try:
        return await run_in_threadpool(parse_workbook, content)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (ParseError, BadZipFile, KeyError, OSError, InvalidFileException) as exc:
        raise HTTPException(
            422, "The workbook is malformed; save a fresh .xlsx copy and try again"
        ) from exc


@router.post("/preview", response_model=ImportReport)
async def preview_excel(file: UploadFile, db: Database, mode: Mode = "create"):
    data = await parse_upload(file)
    report, _ = await prepare_import(db, data, mode)
    return report


@router.post("/import", response_model=ImportReport)
async def import_excel(file: UploadFile, db: WriteDatabase, mode: Mode = "create"):
    data = await parse_upload(file)
    report, projects = await prepare_import(db, data, mode)
    if not report.valid:
        raise HTTPException(422, report.model_dump())
    for project in projects:
        await db.merge(project)
    await save(db)
    return report


@router.get(
    "/export",
    responses={
        200: {"content": {XLSX: {"schema": {"type": "string", "format": "binary"}}}}
    },
)
async def export_excel(db: Database, project_id: Annotated[str | None, Query()] = None):
    query = select(Project).order_by(Project.id)
    if project_id is not None:
        query = query.where(Project.id == project_id)
    projects = list((await db.scalars(query)).all())
    if project_id and not projects:
        raise HTTPException(404, "Project not found")
    content = await run_in_threadpool(export_workbook, projects)
    return Response(
        content,
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="tooling-workflow.xlsx"'},
    )


@router.get(
    "/template",
    responses={
        200: {"content": {XLSX: {"schema": {"type": "string", "format": "binary"}}}}
    },
)
async def excel_template():
    content = await run_in_threadpool(export_workbook, [])
    return Response(
        content,
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="tooling-template.xlsx"'},
    )
