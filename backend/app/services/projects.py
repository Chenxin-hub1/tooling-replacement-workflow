import re
from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dates import local_today
from app.engine.scheduler import (
    STANDARD_MATRIX,
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

# Keep placeholder semantics aligned with Workflow.pending in workflow-core.js.
PENDING_VALUE = re.compile(
    r"(?:pend(?:ing)?(?:\b.*)?|tbd|tbc|n/?a|not applicable|unknown|not started|[-?]+)",
    re.IGNORECASE,
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


def action_value_changes(
    action: ProjectAction,
    proposed: dict[str, Any],
    *,
    source: Literal["edit", "import"] = "edit",
) -> dict[str, Any]:
    """Validate a proposed transition before mutating the action or its history."""
    changes = dict(proposed)
    rule = next(
        (
            row
            for row in STANDARD_MATRIX
            if not action.is_custom
            and (row["tab"], row["act"]) == (action.tab, action.act)
        ),
        None,
    )
    imported_evidence = source == "import" and bool(
        {"value", "status", "done_date"}.intersection(proposed)
    )
    if imported_evidence:
        # 重导只依据本次明确提供的完成证据，旧值相同也不继承历史完成状态。
        approved = bool(
            rule
            and (
                (rule.get("status_input") and changes.get("status") == "approved")
                or (rule.get("closes_on") and changes.get("value") in rule["closes_on"])
            )
        )
        if approved:
            same_approval = bool(
                rule
                and changes.get("value", action.value) == action.value
                and (
                    (rule.get("status_input") and action.status == "approved")
                    or (rule.get("closes_on") and action.value in rule["closes_on"])
                )
            )
            previous_done = (
                action.done_date
                if same_approval
                and action.done_date
                and action.done_date <= local_today()
                else None
            )
            changes["done_date"] = (
                changes.get("done_date") or previous_done or local_today()
            )
        elif rule and (rule.get("status_input") or rule.get("closes_on")):
            changes["done_date"] = None
            if action.status == "approved" and "status" not in changes:
                changes["status"] = "in_progress"
        else:
            changes["done_date"] = changes.get("done_date")
    value = changes.get("value", action.value)
    value_changed = "value" in changes and (value or "") != (action.value or "")
    approval = changes.get("status", action.status)
    done = changes.get("done_date", action.done_date)
    if "done_date" in changes and done and done > local_today():
        raise HTTPException(422, "Actual completion date cannot be in the future")
    parsed = None
    confirms_completion = changes.get("status") == "approved" or bool(
        changes.get("done_date")
    )
    status_changed = "status" in changes and approval != action.status
    validate_value = (
        value_changed
        or confirms_completion
        or (imported_evidence and "value" in proposed)
    )
    if (
        value_changed
        or status_changed
        or "done_date" in changes
        or confirms_completion
        or (
            rule and rule.get("closes_on") and changes.get("value") in rule["closes_on"]
        )
    ):
        text = (value or "").strip()
        choices = action.input_type.split(" / ") if " / " in action.input_type else []
        valid_value = (
            text in choices
            if choices
            else bool(text and not PENDING_VALUE.fullmatch(text))
        )
        if validate_value and text and not valid_value:
            raise HTTPException(422, "Enter a valid value instead of a placeholder")
        if confirms_completion and not valid_value:
            raise HTTPException(422, "A valid value is required to confirm completion")
        if validate_value and value and action.input_type == "Date":
            try:
                parsed = date.fromisoformat(value)
                if parsed.isoformat() != value:
                    raise ValueError("Date must use YYYY-MM-DD")
            except ValueError as exc:
                raise HTTPException(422, "Current date must use YYYY-MM-DD") from exc
        if (
            validate_value
            and value
            and " / " in action.input_type
            and value not in action.input_type.split(" / ")
        ):
            raise HTTPException(422, "Value must be one of the action options")
        if (
            value_changed
            and action.status == "approved"
            and changes.get("status") != "approved"
        ):
            approval = changes["status"] = "in_progress"
        eligible = valid_value
        if rule and rule.get("status_input"):
            eligible = eligible and approval == "approved"
        elif rule and rule.get("closes_on"):
            eligible = value in rule["closes_on"]
        if not eligible and changes.get("done_date"):
            raise HTTPException(
                422,
                "Required value and final approval are needed to complete this action",
            )
        if not eligible or (value_changed and "done_date" not in changes):
            changes["done_date"] = None
        if (
            rule
            and (
                (rule.get("status_input") and changes.get("status") == "approved")
                or (rule.get("closes_on") and changes.get("value") in rule["closes_on"])
            )
            and eligible
            and "done_date" not in proposed
        ):
            changes["done_date"] = (
                local_today() if value_changed else done or local_today()
            )
    if rule and rule.get("dual_date") and value_changed:
        if action.orig is None:
            try:
                changes["orig"] = (
                    date.fromisoformat(action.value) if action.value else parsed
                )
            except ValueError:
                changes["orig"] = parsed
        changes["date_log"] = [
            *(action.date_log or []),
            {
                "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                "by": "API",
                "from": action.value or "",
                "to": value or "",
                "source": source,
            },
        ]
    return changes


def update_action(project: Project, action: ProjectAction, data: ActionUpdate) -> None:
    changes = data.model_dump(exclude_unset=True)
    effective_lead = changes.get("lead", action.lead)
    if "due_date" in changes and effective_lead is not None:
        raise HTTPException(422, "Set lead to null before assigning a manual due_date")
    changes = action_value_changes(action, changes)
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
