import re
from datetime import date, datetime, timedelta
from itertools import pairwise
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class DateHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ts: str = Field(strict=True)
    by: str = Field(strict=True, min_length=1)
    from_date: str = Field(alias="from", strict=True)
    to: str = Field(strict=True)
    source: Literal["edit", "import"]

    @field_validator("ts")
    @classmethod
    def utc_timestamp(cls, value: str) -> str:
        if not re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)",
            value,
        ) or datetime.fromisoformat(value).utcoffset() != timedelta(0):
            raise ValueError("Date history timestamp must be a UTC ISO timestamp")
        return value

    @field_validator("by")
    @classmethod
    def nonblank_actor(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Date history actor must not be blank")
        return value

    @field_validator("from_date", "to")
    @classmethod
    def iso_date_or_empty(cls, value: str) -> str:
        if value and date.fromisoformat(value).isoformat() != value:
            raise ValueError("Date history values must use YYYY-MM-DD")
        return value

    @model_validator(mode="after")
    def changed_date(self):
        if self.from_date == self.to:
            raise ValueError("Date history record must represent a change")
        return self


def validate_date_history(entries: list[DateHistoryEntry], current: str | None) -> None:
    for previous, entry in pairwise(entries):
        if previous.to != entry.from_date:
            raise ValueError("Date history must form a continuous chain")
        if datetime.fromisoformat(previous.ts) > datetime.fromisoformat(entry.ts):
            raise ValueError("Date history timestamps must be chronological")
    if entries and entries[-1].to != (current or ""):
        raise ValueError("Date history must end at the current date")


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
    status: Literal["initiated", "in_progress", "approved"] | None = (
        None  # v2: initiated / in_progress / approved（凭证类动作）
    )
    orig: date | None = None  # v2: 双日期动作的原始日期
    date_log: list[DateHistoryEntry] = Field(default_factory=list)
    comment: str | None = None
    link: str | None = None
    is_custom: bool = False
    last_remind_date: date | None = None

    @model_validator(mode="after")
    def valid_date_history(self):
        validate_date_history(self.date_log, self.value)
        return self


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
    status: Literal["initiated", "in_progress", "approved"] | None = None
    comment: str | None = None
    link: str | None = None


class ActionUpdate(RequestModel):
    owner: Name | None = None
    lead: Lead | None = None
    due_date: date | None = None
    done_date: date | None = None
    value: str | None = None
    status: Literal["initiated", "in_progress", "approved"] | None = None
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
    approval_status: Literal["initiated", "in_progress", "approved"] | None = None

    @model_validator(mode="before")
    @classmethod
    def separate_approval_and_health(cls, value):
        if not isinstance(value, dict) and hasattr(value, "project_id"):
            data = {
                key: getattr(value, key)
                for key in cls.model_fields
                if hasattr(value, key)
            }
            data["approval_status"] = data.pop("status", None)
            return data
        return value

    predecessor: ActionPredecessor | None = None

    model_config = ConfigDict(from_attributes=True)
