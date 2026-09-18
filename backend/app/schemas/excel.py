from pydantic import BaseModel, Field

from app.schemas.action import ActionBase, ActionResponse
from app.schemas.common import Description, Identifier, Lead, Name, Phase, Role
from app.schemas.project import ProjectCreate
from app.schemas.team import TeamMemberBase


class ImportProject(ProjectCreate):
    id: Identifier = Field(max_length=60)


class ImportTeam(TeamMemberBase):
    project_id: Identifier
    function: Role
    name: Name


class ImportAction(ActionBase):
    id: Identifier
    project_id: Identifier
    ph: Phase
    tab: Name
    act: Description
    input_type: Name
    fn: Role
    lead: Lead | None = None
    lead_default: Lead | None = None


class ImportIssue(BaseModel):
    sheet: str
    row: int
    message: str


class ImportReport(BaseModel):
    valid: bool
    created_projects: int = 0
    updated_projects: int = 0
    action_rows: int = 0
    errors: list[ImportIssue] = []
    warnings: list[str] = []
    project_ids: list[str] = []


class ActionListItem(ActionResponse):
    project_description: str
    pn: str
    plant: str | None
