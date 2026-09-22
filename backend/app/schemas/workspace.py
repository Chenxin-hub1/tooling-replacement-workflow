import json
import math
from datetime import date
from graphlib import CycleError, TopologicalSorter
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    field_validator,
    model_validator,
)

from app.schemas.action import DateHistoryEntry, validate_date_history

DATE_HISTORY = TypeAdapter(list[DateHistoryEntry])


class SnapshotProject(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    created: str
    team: dict[str, str]
    actions: list[dict[str, JsonValue]]

    @field_validator("created")
    @classmethod
    def valid_date(cls, value: str) -> str:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError("Creation date must use YYYY-MM-DD")
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
            if any(key not in action for key in ("lead", "leadDefault", "dep", "done")):
                raise ValueError("Action scheduling fields are missing")
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
                    or not math.isfinite(value)
                    or not 0 <= value <= 36500
                ):
                    raise ValueError(f"Action {key} must be nonnegative or null")
            # v2 Phase-1：凭证状态只接受标准枚举（空串=未开始）。
            status = action.get("status")
            if status is not None and status not in (
                "",
                "initiated",
                "in_progress",
                "approved",
            ):
                raise ValueError(
                    "Action status must be initiated, in_progress or approved"
                )
            # v2 Phase-2：原始日期须为合法 ISO 日期（JSON 中以字符串承载）。
            orig = action.get("orig")
            if orig not in (None, ""):
                if not isinstance(orig, str):
                    raise ValueError("Action orig must be an ISO date string")
                try:
                    date.fromisoformat(orig)
                except ValueError as exc:
                    raise ValueError("Action orig must be an ISO date") from exc
            for key in ("due", "done"):
                value = action.get(key)
                if value not in (None, ""):
                    if not isinstance(value, str):
                        raise ValueError(f"Action {key} must be an ISO date")
                    try:
                        date.fromisoformat(value)
                    except ValueError as exc:
                        raise ValueError(f"Action {key} must be an ISO date") from exc
            history = action.get("origLog", [])
            if not isinstance(history, list):
                raise ValueError("Original date history must be a list")  # noqa: TRY004 — Pydantic 需要 ValueError 返回 422
            for entry in history:
                if not isinstance(entry, dict) or any(
                    not isinstance(entry.get(key), str)
                    for key in ("ts", "by", "from", "to")
                ):
                    raise ValueError("Invalid original date correction record")
                for key in ("from", "to"):
                    if entry[key]:
                        date.fromisoformat(entry[key])
            validate_date_history(
                DATE_HISTORY.validate_python(action.get("dateLog", []), strict=True),
                str(action["value"]),
            )
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

    @model_validator(mode="after")
    def valid_import_source(self):
        source = (self.model_extra or {}).get("importSource")
        if source is not None:
            if not isinstance(source, dict) or not isinstance(
                source.get("filename"), str
            ):
                raise ValueError("Invalid import source")
            for key in ("headers", "values"):
                items = source.get(key)
                if not isinstance(items, list) or any(
                    not isinstance(item, str) for item in items
                ):
                    raise ValueError("Import source columns must be string lists")
        warnings = (self.model_extra or {}).get("importWarnings", [])
        if not isinstance(warnings, list) or any(
            not isinstance(item, str) for item in warnings
        ):
            raise ValueError("Import warnings must be a string list")
        return self


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

    @model_validator(mode="before")
    @classmethod
    def reject_reserved_keys(cls, value):
        # 浏览器使用对象字典，拒绝可改变其原型的键；合法业务文本不受影响。
        pending = [value]
        while pending:
            item = pending.pop()
            if isinstance(item, dict):
                if any(
                    key in {"__proto__", "prototype", "constructor"} for key in item
                ):
                    raise ValueError("Reserved object key in workspace")
                pending.extend(item.values())
            elif isinstance(item, list):
                pending.extend(item)
        return value

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
        for row in self.MATRIX:
            if "lead" not in row or "dep" not in row:
                raise ValueError("Template scheduling fields are missing")
            if type(row.get("ph")) is not int or row["ph"] not in range(6):
                raise ValueError("Invalid template phase")
            for key in ("tab", "fn", "act", "input"):
                if not isinstance(row.get(key), str):
                    raise ValueError(f"Template {key} must be a string")  # noqa: TRY004 — Pydantic 需要 ValueError 返回 422
            for key in ("act", "input", "comment"):
                if key in row and not isinstance(row[key], str):
                    raise ValueError(f"Template {key} must be a string")
            lead = row.get("lead")
            if lead is not None and (type(lead) is not int or not 0 <= lead <= 36500):
                raise ValueError("Template lead must be between 0 and 36500")
        if any(
            name in {"__proto__", "prototype", "constructor"} for name in self.FUNCTIONS
        ):
            raise ValueError("Reserved function name")
        graph = {}
        for index, row in enumerate(self.MATRIX):
            dep = row.get("dep")
            if dep is not None and (
                type(dep) is not int or not 0 <= dep < len(self.MATRIX)
            ):
                raise ValueError("Template predecessor is missing")
            graph[index] = [] if dep is None else [dep]
        try:
            tuple(TopologicalSorter(graph).static_order())
        except CycleError as exc:
            raise ValueError("Template dependencies contain a cycle") from exc
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
