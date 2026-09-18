from datetime import date, timedelta

import pytest

from app.engine.scheduler import compute_project_summary, schedule_project_actions
from app.models.action import ProjectAction


def action(identifier, predecessor=None, **kwargs):
    return ProjectAction(
        id=identifier,
        project_id="p",
        ph=1,
        tab=identifier,
        act="Test",
        input_type="Date",
        fn="SDE",
        dep_id=predecessor,
        lead=1,
        **kwargs,
    )


def test_reverse_dependency_chain_is_scheduled_in_dependency_order():
    actions = [action(str(i), str(i - 1) if i else None) for i in range(4)]
    schedule_project_actions(date(2026, 9, 1), actions[::-1])
    assert [a.due_date for a in actions] == [
        date(2026, 9, 2) + timedelta(days=i) for i in range(4)
    ]


@pytest.mark.parametrize("kind", ["cycle", "missing", "duplicate"])
def test_invalid_graph_is_rejected_without_partial_rescheduling(kind):
    actions = [action("a"), action("b", "a")]
    if kind == "cycle":
        actions[0].dep_id = "b"
    elif kind == "missing":
        actions[0].dep_id = "unknown"
    else:
        actions[1].id = "a"
    with pytest.raises(ValueError):
        schedule_project_actions(date(2026, 9, 1), actions)
    assert all(a.due_date is None for a in actions)


def test_creation_phase_includes_custom_actions():
    custom = action("custom", due_date=date(2026, 9, 1))
    custom.ph = 0
    summary = compute_project_summary(date(2026, 9, 1), [custom], date(2026, 9, 15))
    assert summary.phase_health[0] == "red"
    assert summary.phase_statuses[0] == "overdue"


def test_partial_completion_distinguishes_in_progress_from_planned():
    first, second = action("a", done_date=date(2026, 9, 1)), action("b")
    summary = compute_project_summary(
        date(2026, 9, 1), [first, second], date(2026, 9, 1)
    )
    assert summary.phase_statuses[1] == "in-progress"
    assert summary.phase_statuses[2] == "planned"


@pytest.mark.parametrize(
    ("days", "expected"),
    [(-1, "red"), (0, "yellow"), (5, "yellow"), (6, "gray"), (None, "gray")],
)
def test_health_boundaries(days, expected):
    from app.engine.scheduler import compute_action_status

    today = date(2026, 9, 15)
    item = action(
        "boundary", due_date=today + timedelta(days=days) if days is not None else None
    )
    assert compute_action_status(item, today) == expected


def test_rounding_does_not_mark_unfinished_project_complete():
    actions = [action(str(i), done_date=date(2026, 9, 1)) for i in range(200)]
    actions.append(action("pending"))
    summary = compute_project_summary(date(2026, 9, 1), actions, date(2026, 9, 1))
    assert summary.pct == 99
    assert summary.overall_status == "gray"


def test_red_flags_are_sorted_by_overdue_severity():
    recent = action("recent", due_date=date(2026, 9, 14))
    older = action("older", due_date=date(2026, 9, 1))
    summary = compute_project_summary(
        date(2026, 9, 1), [recent, older], date(2026, 9, 15)
    )
    assert summary.red_flags[0].startswith("older ")
