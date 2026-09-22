from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.action import ActionResponse
from app.schemas.common import (
    Description,
    Health,
    Identifier,
    Name,
    PhaseState,
    RequestModel,
    Role,
)
from app.schemas.team import TeamMemberResponse


class ProjectBase(BaseModel):
    id: str
    pn: str
    desc: str
    plant: str | None = None
    reason: str | None = None
    cur: str | None = None
    nw: str | None = None
    po: str | None = None
    tag: str | None = None
    too_owner: str | None = None
    cav: str | None = None
    saving: str | None = None
    oem: str | None = None
    tech: str | None = None
    bu: str | None = None
    owner: str | None = None
    created_at: date | None = None


class ProjectCreate(RequestModel):
    id: Identifier | None = Field(
        default=None, max_length=60
    )  # If not provided, auto-generated e.g. TR-YYYY-NNN
    pn: Name
    desc: Description
    plant: str | None = None
    reason: str | None = None
    cur: str | None = None
    nw: str | None = None
    po: str | None = None
    tag: str | None = None
    too_owner: str | None = None
    cav: str | None = None
    saving: str | None = None
    oem: str | None = None
    tech: str | None = None
    bu: str | None = None
    owner: str | None = None
    created_at: date | None = None
    team: dict[Role, Name] | None = (
        None  # e.g. {"BU Buyer": "Carrie Chen", "SDE": "Daniel Wu", ...}
    )


class ProjectUpdate(RequestModel):
    pn: Name | None = None
    desc: Description | None = None
    plant: str | None = None
    reason: str | None = None
    cur: str | None = None
    nw: str | None = None
    po: str | None = None
    tag: str | None = None
    too_owner: str | None = None
    cav: str | None = None
    saving: str | None = None
    oem: str | None = None
    tech: str | None = None
    bu: str | None = None
    owner: str | None = None
    team: dict[Role, Name] | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        for field in ("pn", "desc", "team"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class PhaseSummary(BaseModel):
    phase: int
    status: PhaseState
    health: Health
    total_actions: int
    completed_actions: int
    overdue_actions: int
    due_soon_actions: int


class ProjectSummary(BaseModel):
    phase: int
    overall_status: Health
    pct: int
    total_actions: int
    completed_actions: int
    open_actions: int
    overdue_actions: int
    due_soon_actions: int
    undated_actions: int
    phase_statuses: list[PhaseState] = Field(min_length=4, max_length=4)
    phase_health: list[Health] = Field(min_length=4, max_length=4)
    phases: list[PhaseSummary] = Field(min_length=4, max_length=4)
    next_milestone: str | None = None
    red_flags: list[str] = []


class ProjectResponse(ProjectBase):
    updated_at: datetime | None = None
    team_members: list[TeamMemberResponse] = []
    actions: list[ActionResponse] = []
    summary: ProjectSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class ProjectListItem(ProjectBase):
    updated_at: datetime | None = None
    team: dict[str, str] = {}
    summary: ProjectSummary | None = None

    model_config = ConfigDict(from_attributes=True)
