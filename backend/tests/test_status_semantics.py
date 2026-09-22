"""v2 Phase-1：凭证状态与完成语义的矩阵元数据、schema 与工作区校验。"""

from pydantic import ValidationError

from app.engine.scheduler import (
    STANDARD_MATRIX,
    STATUS_ALIAS_SETS,
    STATUS_VALUES,
)
from app.schemas.action import ActionCreate
from app.schemas.workspace import WorkspaceSnapshot


def _snapshot_project(**overrides):
    action = {
        "id": "TR-2026-001-a1",
        "ph": 1,
        "tab": "CR",
        "act": "Input CR number",
        "input": "CR number",
        "fn": "SDE",
        "owner": "Daniel Wu",
        "due": "",
        "value": "CR-25-001",
        "dep": None,
        "lead": 7,
        "leadDefault": 7,
        "done": None,
    }
    action.update(overrides)
    return {
        "id": "TR-2026-001",
        "created": "2026-09-22",
        "team": {"SDE": "Daniel Wu"},
        "actions": [action],
    }


def _workspace(projects):
    return {
        "v": 1,
        "savedAt": "2026-09-22T00:00:00Z",
        "projects": projects,
        "PEOPLE": {},
        "EMAILS": {},
        "ADMINS": [],
        "FUNCTIONS": ["SDE"],
        "TEAM_ROWS": [],
        "REQUIRED_TEAM": [],
        "MATRIX": [],
        "RULES": {
            "before": 7,
            "overdueEvery": 7,
            "escalateAfter": 14,
            "channel": "email",
        },
        "CUSTOM_SEQ": 0,
    }


def test_matrix_status_metadata():
    tracked = {
        (m["ph"], m["tab"], m["act"]): m.get("status_input")
        for m in STANDARD_MATRIX
        if "status_input" in m
    }
    assert tracked == {
        (1, "CR", "Input CR number"): "CR",
        (1, "CVS CR", "Input CR number for CVS on Windchill"): "CR",
        (2, "Pre Grain", "Input pre-grain target date approval"): "STANDARD",
        (2, "Core BPW", "Input BPW number"): "BPW",
        (3, "AAR", "Input target date for approval"): "STANDARD",
    }
    closes = {
        (m["ph"], m["tab"], m["act"]): m.get("closes_on")
        for m in STANDARD_MATRIX
        if "closes_on" in m
    }
    assert closes == {
        (2, "PPAP Status", "Input if Draft, Interim approved, or Full approved"): [
            "Full approved"
        ]
    }


def test_status_alias_sets_cover_every_value():
    assert STATUS_VALUES == ("initiated", "in_progress", "approved")
    for alias_set in STATUS_ALIAS_SETS.values():
        assert set(alias_set) == set(STATUS_VALUES)


def test_action_schema_accepts_status():
    payload = ActionCreate(
        ph=1,
        tab="CR",
        act="Input CR number",
        input_type="CR number",
        fn="SDE",
        status="in_progress",
    )
    assert payload.status == "in_progress"
    try:
        ActionCreate(
            ph=1,
            tab="CR",
            act="Input CR number",
            input_type="CR number",
            fn="SDE",
            status="bogus",  # ty: ignore[invalid-argument-type]
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("invalid status must be rejected")


def test_workspace_snapshot_validates_status():
    ok = WorkspaceSnapshot.model_validate(
        _workspace([_snapshot_project(status="approved")])
    )
    assert ok.projects[0].actions[0]["status"] == "approved"
    WorkspaceSnapshot.model_validate(_workspace([_snapshot_project(status="")]))
    try:
        WorkspaceSnapshot.model_validate(
            _workspace([_snapshot_project(status="finished")])
        )
    except ValidationError as exc:
        assert "status" in str(exc)
    else:
        raise AssertionError("invalid status must be rejected by the snapshot")


def test_matrix_dual_date_metadata():
    dual = {
        (m["ph"], m["tab"], m["act"]) for m in STANDARD_MATRIX if m.get("dual_date")
    }
    assert dual == {
        (1, "FOT Date", "Input Supplier's target date for FOT"),
        (1, "PPAP Sample Date", "Input Supplier's target date for Samples"),
        (
            1,
            "PPAP Submission Date",
            "Input Supplier's target date for PPAP submission",
        ),
        (2, "Pre Grain", "Input pre-grain target date approval"),
        (3, "AAR", "Input target date for approval"),
        (3, "OEM BPW", "Input target date for approval"),
    }


def test_workspace_snapshot_validates_orig():
    WorkspaceSnapshot.model_validate(_workspace([_snapshot_project(orig="2026-04-01")]))
    for bad in (20260401, "04/01/2026", "2026-13-01"):
        try:
            WorkspaceSnapshot.model_validate(_workspace([_snapshot_project(orig=bad)]))
        except ValidationError:
            pass
        else:
            raise AssertionError(f"invalid orig must be rejected: {bad!r}")
