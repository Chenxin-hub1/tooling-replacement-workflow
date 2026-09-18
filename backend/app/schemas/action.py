from datetime import date

from pydantic import BaseModel, ConfigDict

from app.schemas.common import (
    Description,
    Health,
    Identifier,
    Lead,
    Name,
    Phase,
    RequestModel,
    Role,
)


class ActionBase(BaseModel):
    ph: int
    tab: str
    act: str
    input_type: str
    fn: str
    owner: str | None = None
    dep_id: str | None = None
    lead_default: int | None = None
    lead: int | None = None
    due_date: date | None = None
    done_date: date | None = None
    value: str | None = None
    comment: str | None = None
    link: str | None = None
    is_custom: bool = False
    last_remind_date: date | None = None


class ActionCreate(RequestModel):
    ph: Phase
    tab: Name
    act: Description
    input_type: Name
    fn: Role
    owner: Name | None = None
    dep_id: Identifier | None = None
    lead: Lead | None = None
    due_date: date | None = None
    value: str | None = None
    comment: str | None = None
    link: str | None = None


class ActionUpdate(RequestModel):
    owner: Name | None = None
    lead: Lead | None = None
    due_date: date | None = None
    done_date: date | None = None
    value: str | None = None
    comment: str | None = None
    link: str | None = None


class ActionPredecessor(BaseModel):
    id: str
    tab: str
    due_date: date | None
    done_date: date | None

    model_config = ConfigDict(from_attributes=True)


class ActionResponse(ActionBase):
    id: str
    project_id: str
    status: Health | None = None
    predecessor: ActionPredecessor | None = None

    model_config = ConfigDict(from_attributes=True)
