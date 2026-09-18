from datetime import UTC, date, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dates import local_today
from app.engine.scheduler import (
    build_actions_for_project,
    compute_action_status,
    compute_project_summary,
    reassign_team_member,
    schedule_project_actions,
)
from app.models import Project, ProjectAction, TeamMember
from app.schemas.action import (
    ActionCreate,
    ActionPredecessor,
    ActionResponse,
    ActionUpdate,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectListItem,
    ProjectResponse,
    ProjectUpdate,
)


async def get_project(db: AsyncSession, project_id: str) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def get_action(project: Project, action_id: str) -> ProjectAction:
    action = next((a for a in project.actions if a.id == action_id), None)
    if action is None:
        raise HTTPException(404, "Action not found in this project")
    return action


def schedule(project: Project) -> None:
    try:
        schedule_project_actions(project.created_at, project.actions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def action_response(
    action: ProjectAction, actions: list[ProjectAction], today: date
) -> ActionResponse:
    result = ActionResponse.model_validate(action)
    result.status = compute_action_status(action, today)
    predecessor = next((a for a in actions if a.id == action.dep_id), None)
    if predecessor is not None:
        result.predecessor = ActionPredecessor.model_validate(predecessor)
    return result


def detail(project: Project) -> ProjectResponse:
    today = local_today()
    result = ProjectResponse.model_validate(project)
    ordered = sorted(
        project.actions,
        key=lambda a: (
            a.ph,
            a.is_custom,
            int(a.id.rsplit("-", 1)[-1])
            if not a.is_custom and a.id.rsplit("-", 1)[-1].isdigit()
            else 0,
            a.id,
        ),
    )
    result.actions = [action_response(a, project.actions, today) for a in ordered]
    result.summary = compute_project_summary(project.created_at, project.actions, today)
    return result


def list_item(project: Project) -> ProjectListItem:
    result = ProjectListItem.model_validate(project)
    result.team = {member.function: member.name for member in project.team_members}
    result.summary = compute_project_summary(project.created_at, project.actions)
    return result


async def create_project(db: AsyncSession, data: ProjectCreate) -> Project:
    project_id = data.id
    if project_id is None:
        prefix = f"TR-{local_today().year}-"
        ids = (
            await db.scalars(select(Project.id).where(Project.id.startswith(prefix)))
        ).all()
        numbers = [
            int(identifier[len(prefix) :])
            for identifier in ids
            if identifier[len(prefix) :].isdigit()
        ]
        project_id = f"{prefix}{max(numbers, default=0) + 1:03d}"
    if await db.get(Project, project_id) is not None:
        raise HTTPException(409, "Project ID already exists")
    values = data.model_dump(exclude={"id", "team", "created_at"})
    project = Project(
        id=project_id, created_at=data.created_at or local_today(), **values
    )
    team: dict[str, str] = {role: name for role, name in (data.team or {}).items()}
    project.team_members = [
        TeamMember(function=role, name=name) for role, name in team.items()
    ]
    project.actions = build_actions_for_project(project_id, team)
    schedule(project)
    db.add(project)
    return project


def update_project(project: Project, data: ProjectUpdate) -> None:
    for key, value in data.model_dump(exclude_unset=True, exclude={"team"}).items():
        setattr(project, key, value)
    # PATCH 的 team 是按角色合并；空字典不删除现有分配。
    if data.team is not None:
        members = {m.function: m for m in project.team_members}
        for role, name in data.team.items():
            if role in members:
                members[role].name = name
            else:
                project.team_members.append(TeamMember(function=role, name=name))
            reassign_team_member(project.actions, role, name)
    touch(project)


def create_action(project: Project, data: ActionCreate) -> ProjectAction:
    if data.dep_id is not None:
        get_action(project, data.dep_id)
    if data.lead is not None and data.due_date is not None:
        raise HTTPException(422, "Set either lead or a manual due_date, not both")
    values = data.model_dump()
    if data.owner is None:
        values["owner"] = next(
            (m.name for m in project.team_members if m.function == data.fn), None
        )
    # 自定义动作使用独立 UUID，不受删除或标准动作数变化影响。
    action = ProjectAction(
        id=f"custom-{uuid4().hex}", project_id=project.id, is_custom=True, **values
    )
    project.actions.append(action)
    schedule(project)
    touch(project)
    return action


def update_action(project: Project, action: ProjectAction, data: ActionUpdate) -> None:
    changes = data.model_dump(exclude_unset=True)
    effective_lead = changes.get("lead", action.lead)
    if "due_date" in changes and effective_lead is not None:
        raise HTTPException(422, "Set lead to null before assigning a manual due_date")
    for key, value in changes.items():
        setattr(action, key, value)
    schedule(project)
    touch(project)


def delete_action(project: Project, action: ProjectAction) -> None:
    if not action.is_custom:
        raise HTTPException(409, "Standard actions cannot be deleted")
    if any(a.dep_id == action.id for a in project.actions):
        raise HTTPException(409, "Action is still referenced by dependent actions")
    project.actions.remove(action)
    touch(project)


def touch(project: Project) -> None:
    project.updated_at = datetime.now(UTC).replace(tzinfo=None)
