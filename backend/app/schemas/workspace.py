import json
from datetime import date
from graphlib import CycleError, TopologicalSorter
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)


class SnapshotProject(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    created: str
    team: dict[str, str]
    actions: list[dict[str, JsonValue]]

    @field_validator("created")
    @classmethod
    def valid_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value

    @field_validator("actions")
    @classmethod
    def valid_actions(cls, actions: list[dict[str, JsonValue]]):
        ids = [a.get("id") for a in actions]
        if any(not isinstance(i, str) or not i for i in ids):
            raise ValueError("Every action must have a nonempty string ID")
        if len({str(i) for i in ids}) != len(ids):
            raise ValueError("Duplicate action IDs")
        for action in actions:
            if type(action.get("ph")) is not int or action["ph"] not in range(6):
                raise ValueError("Action phase must be between 0 and 5")
            for key in ("tab", "act", "input", "fn", "owner", "due", "value"):
                if not isinstance(action.get(key), str):
                    raise ValueError(f"Action {key} must be a string")  # noqa: TRY004 — Pydantic 校验需转换为 422
            for key in ("lead", "leadDefault"):
                value = action.get(key)
                if value is not None and (
                    not isinstance(value, (int, float))
                    or isinstance(value, bool)
                    or value < 0
                ):
                    raise ValueError(f"Action {key} must be nonnegative or null")
        known = {str(i) for i in ids}
        graph = {}
        for action in actions:
            dep = action.get("dep")
            if dep is not None and (not isinstance(dep, str) or dep not in known):
                raise ValueError("Action predecessor is missing")
            graph[str(action["id"])] = [dep] if dep else []
        try:
            tuple(TopologicalSorter(graph).static_order())
        except CycleError as exc:
            raise ValueError("Action dependencies contain a cycle") from exc
        return actions


class WorkspaceSnapshot(BaseModel):
    model_config = ConfigDict(extra="allow")

    v: Literal[1]
    savedAt: str
    projects: list[SnapshotProject]
    PEOPLE: dict[str, list[str]]
    EMAILS: dict[str, str]
    ADMINS: list[str]
    FUNCTIONS: list[str]
    TEAM_ROWS: list[tuple[str, str]]
    REQUIRED_TEAM: list[str]
    MATRIX: list[dict[str, JsonValue]]
    RULES: dict[str, JsonValue]
    CUSTOM_SEQ: Annotated[int, Field(strict=True, ge=0)]

    @model_validator(mode="after")
    def valid_workspace(self):
        for key, minimum in (("before", 0), ("overdueEvery", 1), ("escalateAfter", 0)):
            value = self.RULES.get(key)
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not minimum <= value <= 36500
            ):
                raise ValueError(f"Invalid reminder interval: {key}")
        if self.RULES.get("channel") not in ("email", "teams", "both"):
            raise ValueError("Invalid reminder channel")
        ids = [p.id for p in self.projects]
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate project IDs")
        if len(json.dumps(self.model_dump()).encode()) > 10 * 1024 * 1024:
            raise ValueError("Workspace exceeds 10 MB")
        return self


class WorkspaceWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Annotated[int, Field(strict=True, ge=0)]
    snapshot: WorkspaceSnapshot


class WorkspaceResponse(BaseModel):
    revision: int
    snapshot: WorkspaceSnapshot | None
