from collections import Counter
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dates import local_today
from app.db.session import get_db
from app.engine.scheduler import compute_action_status, compute_project_summary
from app.models import Project
from app.schemas.action import ActionCreate, ActionResponse, ActionUpdate
from app.schemas.common import Health
from app.schemas.excel import ActionListItem
from app.schemas.kpi import (
    KpiSummary,
    OverdueOwner,
    OverdueProject,
    OverdueRole,
    PhaseCount,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectListItem,
    ProjectResponse,
    ProjectUpdate,
)
from app.services import projects

router = APIRouter()
Database = Annotated[AsyncSession, Depends(get_db)]


async def write_db(db: Database):
    # SQLite 在读取编号和当前状态之前取得写锁，避免并发编号或转派相互覆盖。
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        await db.execute(text("BEGIN IMMEDIATE"))
    yield db


WriteDatabase = Annotated[AsyncSession, Depends(write_db)]


async def save(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "The change conflicts with existing data") from exc


@router.post(
    "/projects", response_model=ProjectResponse, status_code=201, tags=["Projects"]
)
async def create_project(data: ProjectCreate, db: WriteDatabase):
    project = await projects.create_project(db, data)
    await save(db)
    return projects.detail(project)


@router.get("/projects", response_model=list[ProjectListItem], tags=["Projects"])
async def list_projects(
    db: Database,
    plant: str | None = None,
    bu: str | None = None,
    status: Health | None = None,
):
    query = select(Project).order_by(Project.id)
    if plant is not None:
        query = query.where(Project.plant == plant)
    if bu is not None:
        query = query.where(Project.bu == bu)
    items = [projects.list_item(p) for p in (await db.scalars(query)).all()]
    return [
        item
        for item in items
        if status is None
        or (item.summary is not None and item.summary.overall_status == status)
    ]


@router.get("/projects/{project_id}", response_model=ProjectResponse, tags=["Projects"])
async def get_project(project_id: str, db: Database):
    return projects.detail(await projects.get_project(db, project_id))


@router.patch(
    "/projects/{project_id}", response_model=ProjectResponse, tags=["Projects"]
)
async def update_project(project_id: str, data: ProjectUpdate, db: WriteDatabase):
    project = await projects.get_project(db, project_id)
    projects.update_project(project, data)
    await save(db)
    return projects.detail(project)


@router.post(
    "/projects/{project_id}/actions",
    response_model=ActionResponse,
    status_code=201,
    tags=["Actions"],
)
async def create_action(project_id: str, data: ActionCreate, db: WriteDatabase):
    project = await projects.get_project(db, project_id)
    action = projects.create_action(project, data)
    await save(db)
    return projects.action_response(action, project.actions, local_today())


@router.patch(
    "/projects/{project_id}/actions/{action_id}",
    response_model=ActionResponse,
    tags=["Actions"],
)
async def update_action(
    project_id: str, action_id: str, data: ActionUpdate, db: WriteDatabase
):
    project = await projects.get_project(db, project_id)
    action = projects.get_action(project, action_id)
    projects.update_action(project, action, data)
    await save(db)
    return projects.action_response(action, project.actions, local_today())


@router.delete(
    "/projects/{project_id}/actions/{action_id}", status_code=204, tags=["Actions"]
)
async def delete_action(project_id: str, action_id: str, db: WriteDatabase):
    project = await projects.get_project(db, project_id)
    projects.delete_action(project, projects.get_action(project, action_id))
    await save(db)
    return Response(status_code=204)


@router.get("/kpi/summary", response_model=KpiSummary, tags=["KPI"])
async def kpi_summary(db: Database):
    all_projects = (await db.scalars(select(Project).order_by(Project.id))).all()
    summaries = [
        compute_project_summary(project.created_at, project.actions)
        for project in all_projects
    ]
    today = local_today()
    roles = Counter(
        a.fn
        for project in all_projects
        for a in project.actions
        if compute_action_status(a, today) == "red"
    )
    owners = Counter(
        a.owner or "Unassigned"
        for project in all_projects
        for a in project.actions
        if compute_action_status(a, today) == "red"
    )
    phases = Counter(summary.phase for summary in summaries)
    overdue_projects = [
        OverdueProject(project_id=p.id, overdue_actions=s.overdue_actions)
        for p, s in zip(all_projects, summaries)
        if s.overdue_actions
    ]
    overdue_projects.sort(key=lambda item: (-item.overdue_actions, item.project_id))
    return KpiSummary(
        total_projects=len(all_projects),
        completed_projects=sum(s.open_actions == 0 for s in summaries),
        total_actions=sum(s.total_actions for s in summaries),
        completed_actions=sum(s.completed_actions for s in summaries),
        overdue_actions=sum(s.overdue_actions for s in summaries),
        due_soon_actions=sum(s.due_soon_actions for s in summaries),
        phase_distribution=[PhaseCount(phase=i, projects=phases[i]) for i in range(4)],
        overdue_by_function=[
            OverdueRole(function=role, overdue_actions=count)
            for role, count in sorted(roles.items())
        ],
        overdue_by_project=overdue_projects,
        overdue_by_owner=[
            OverdueOwner(owner=owner, overdue_actions=count)
            for owner, count in sorted(
                owners.items(), key=lambda item: (-item[1], item[0])
            )
        ],
    )


@router.get("/actions", response_model=list[ActionListItem], tags=["Actions"])
async def list_actions(
    db: Database, owner: str | None = None, status: Health | None = None
):
    all_projects = (await db.scalars(select(Project).order_by(Project.id))).all()
    today = local_today()
    result = []
    for project in all_projects:
        for action in project.actions:
            response = projects.action_response(action, project.actions, today)
            if owner is not None and (action.owner or "") != owner:
                continue
            if status is not None and response.status != status:
                continue
            result.append(
                ActionListItem(
                    **response.model_dump(),
                    project_description=project.desc,
                    pn=project.pn,
                    plant=project.plant,
                )
            )
    return sorted(
        result,
        key=lambda action: (
            action.done_date is not None,
            action.due_date or date.max,
            action.id,
        ),
    )
