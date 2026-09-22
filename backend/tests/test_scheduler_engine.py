from datetime import date

from app.engine.scheduler import (
    STANDARD_MATRIX,
    build_actions_for_project,
    compute_action_status,
    compute_project_summary,
    reassign_team_member,
    schedule_project_actions,
)
from app.models.action import ProjectAction


def test_standard_matrix_definition():
    # Verify standard matrix has 20 items across phases 1 to 3
    assert len(STANDARD_MATRIX) == 20
    phases = {m["ph"] for m in STANDARD_MATRIX}
    assert phases == {1, 2, 3}


def test_build_actions_for_project():
    project_id = "TR-2026-001"
    team = {
        "BU Buyer": "Carrie Chen",
        "SDE": "Daniel Wu",
        "PM": "Tom Becker",
        "ENG": "Priya Nair",
        "SP/BU": "Luis Ortega",
        "Accounting": "Julia Lang",
    }
    actions = build_actions_for_project(project_id, team)
    assert len(actions) == 20
    assert actions[0].project_id == project_id
    assert actions[0].id == "TR-2026-001-0"
    assert actions[0].fn == "SDE"
    assert actions[0].owner == "Daniel Wu"
    assert actions[1].fn == "BU Buyer"
    assert actions[1].owner == "Carrie Chen"


def test_schedule_project_actions_initial():
    project_id = "TR-2026-001"
    project_created = date(2026, 9, 1)
    team = {"BU Buyer": "Carrie Chen", "SDE": "Daniel Wu", "PM": "Tom Becker"}
    actions = build_actions_for_project(project_id, team)

    schedule_project_actions(project_created, actions)

    # Action 0 has lead=7 and dep=None -> due should be 2026-09-08
    assert actions[0].lead == 7
    assert actions[0].due_date == date(2026, 9, 8)

    # Action 6 (BPO) has lead=30 and dep=None -> due should be 2026-10-01
    assert actions[6].tab == "BPO"
    assert actions[6].due_date == date(2026, 10, 1)


def test_schedule_project_actions_cascade_on_completion():
    project_id = "TR-2026-001"
    project_created = date(2026, 9, 1)
    team = {
        "BU Buyer": "Carrie Chen",
        "SDE": "Daniel Wu",
        "PM": "Tom Becker",
        "ENG": "Ken Tanaka",
    }
    actions = build_actions_for_project(project_id, team)
    schedule_project_actions(project_created, actions)

    # Action 10 (CVS CR on Windchill) depends on Action 9 (CVS CR)
    # Action 10 has dep_id="TR-2026-001-9"
    assert actions[10].dep_id == "TR-2026-001-9"
    # Set lead for action 10
    actions[10].lead = 10

    # Before action 9 is done: action 9 has no due date (lead is None), so action 10 base falls back to project_created
    schedule_project_actions(project_created, actions)
    assert actions[10].due_date == date(2026, 9, 11)

    # Now mark Action 9 completed on 2026-09-15
    actions[9].done_date = date(2026, 9, 15)
    schedule_project_actions(project_created, actions)

    # Action 10 baseDate should now be Action 9 done_date (2026-09-15) + lead(10) = 2026-09-25
    assert actions[10].due_date == date(2026, 9, 25)


def test_compute_action_status():
    today = date(2026, 9, 15)

    # Completed -> green
    a_done = ProjectAction(
        id="1",
        project_id="p",
        ph=1,
        tab="T",
        act="A",
        input_type="Date",
        fn="SDE",
        due_date=date(2026, 9, 10),
        done_date=date(2026, 9, 9),
    )
    assert compute_action_status(a_done, today) == "green"

    # Overdue (due < today) -> red
    a_overdue = ProjectAction(
        id="2",
        project_id="p",
        ph=1,
        tab="T",
        act="A",
        input_type="Date",
        fn="SDE",
        due_date=date(2026, 9, 12),
        done_date=None,
    )
    assert compute_action_status(a_overdue, today) == "red"

    # Due soon (0 <= due - today <= 5) -> yellow (e.g. 2026-09-18 is 3 days ahead)
    a_due_soon = ProjectAction(
        id="3",
        project_id="p",
        ph=1,
        tab="T",
        act="A",
        input_type="Date",
        fn="SDE",
        due_date=date(2026, 9, 18),
        done_date=None,
    )
    assert compute_action_status(a_due_soon, today) == "yellow"

    # Not started / far away -> gray
    a_future = ProjectAction(
        id="4",
        project_id="p",
        ph=1,
        tab="T",
        act="A",
        input_type="Date",
        fn="SDE",
        due_date=date(2026, 10, 1),
        done_date=None,
    )
    assert compute_action_status(a_future, today) == "gray"


def test_reassign_team_member():
    project_id = "TR-2026-001"
    team = {"SDE": "Old Person", "PM": "Tom Becker"}
    actions = build_actions_for_project(project_id, team)

    # Find SDE actions
    sde_actions = [a for a in actions if a.fn == "SDE"]
    assert len(sde_actions) > 0
    assert all(a.owner == "Old Person" for a in sde_actions)

    # Mark the first SDE action as done
    sde_actions[0].done_date = date(2026, 9, 5)

    # Reassign SDE to "New Person"
    count = reassign_team_member(actions, "SDE", "New Person")

    # Only unfinished actions should be updated
    assert count == len(sde_actions) - 1
    assert sde_actions[0].owner == "Old Person"  # Completed preserved!
    assert all(a.owner == "New Person" for a in sde_actions[1:])  # Open reassigned!


def test_compute_project_summary():
    project_id = "TR-2026-001"
    project_created = date(2026, 9, 1)
    today = date(2026, 9, 15)
    team = {"BU Buyer": "Carrie Chen", "SDE": "Daniel Wu"}
    actions = build_actions_for_project(project_id, team)
    schedule_project_actions(project_created, actions)

    # Action 0 (due 2026-09-08) is overdue on 2026-09-15
    summary = compute_project_summary(project_created, actions, today)

    assert summary.total_actions == 20
    assert summary.overdue_actions > 0
    assert summary.overall_status == "red"  # Has overdue action
    assert len(summary.red_flags) > 0
    # Phase 0 ('1. Tool Creation') has no matrix actions and is complete
    assert summary.phase_statuses[0] == "completed"
