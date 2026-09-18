from datetime import date, timedelta
from graphlib import CycleError, TopologicalSorter
from typing import TypedDict

from app.dates import local_today
from app.models.action import ProjectAction
from app.schemas.common import Health, PhaseState
from app.schemas.project import PhaseSummary, ProjectSummary

# Standard Matrix Definition (31 items across Phases 1 to 5)
# Phase 0 ('1. Tool Creation') is closed upon project creation.
# Phase 1 ('2. Development')
# Phase 2 ('3. Internal Approval')
# Phase 3 ('4. Customer Approval')
# Phase 4 ('5. Scrap')
# Phase 5 ('6. Archive')


class StandardAction(TypedDict):
    ph: int
    tab: str
    act: str
    input_type: str
    fn: str
    lead: int | None
    dep: int | None


STANDARD_MATRIX: list[StandardAction] = [
    # Phase 1: Development
    {
        "ph": 1,
        "tab": "CR",
        "act": "Input CR number",
        "input_type": "CR number",
        "fn": "SDE",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "PPAP ID",
        "act": "Input PPAP ID number",
        "input_type": "PPAP ID",
        "fn": "BU Buyer",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "FOT Date",
        "act": "Input Supplier's target date for FOT",
        "input_type": "Date",
        "fn": "SDE",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "PPAP Sample Date",
        "act": "Input Supplier's target date for Samples",
        "input_type": "Date",
        "fn": "SDE",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "PPAP Submission Date",
        "act": "Input Supplier's target date for PPAP submission",
        "input_type": "Date",
        "fn": "SDE",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "Current Coverage",
        "act": "Input date of coverage on current supplier",
        "input_type": "Date",
        "fn": "BU Buyer",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "BPO",
        "act": "Input BPO number",
        "input_type": "BPO number",
        "fn": "SP/BU",
        "lead": 30,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "Change",
        "act": "Identify if External or Internal",
        "input_type": "External / Internal",
        "fn": "PM",
        "lead": 7,
        "dep": None,
    },
    {
        "ph": 1,
        "tab": "SOP",
        "act": "Input date needed by ZF to implement",
        "input_type": "Date",
        "fn": "BU Buyer",
        "lead": 7,
        "dep": None,
    },
    # Phase 2: Internal Approval
    {
        "ph": 2,
        "tab": "CVS CR",
        "act": "Identify if applicable or not",
        "input_type": "Applicable / Not applicable",
        "fn": "ENG",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 2,
        "tab": "CVS CR",
        "act": "Input CR number for CVS on Windchill",
        "input_type": "CR number",
        "fn": "ENG",
        "lead": None,
        "dep": 9,
    },
    {
        "ph": 2,
        "tab": "PPAP Status",
        "act": "Input if Draft, Interim approved, or Full approved",
        "input_type": "Draft / Interim approved / Full approved",
        "fn": "SDE",
        "lead": None,
        "dep": 4,
    },
    {
        "ph": 2,
        "tab": "Pre Grain",
        "act": "Identify if applicable or not",
        "input_type": "Applicable / Not applicable",
        "fn": "SDE",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 2,
        "tab": "Pre Grain",
        "act": "Input pre-grain target date approval",
        "input_type": "Date",
        "fn": "SDE",
        "lead": None,
        "dep": 12,
    },
    {
        "ph": 2,
        "tab": "Core BPW",
        "act": "Input BPW number",
        "input_type": "BPW number",
        "fn": "PM",
        "lead": 175,
        "dep": None,
    },
    {
        "ph": 2,
        "tab": "Core BPW",
        "act": "Input target date for approval",
        "input_type": "Date",
        "fn": "PM",
        "lead": None,
        "dep": 14,
    },
    # Phase 3: Customer Approval
    {
        "ph": 3,
        "tab": "AAR",
        "act": "Identify if applicable or not",
        "input_type": "Applicable / Not applicable",
        "fn": "SDE",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 3,
        "tab": "AAR",
        "act": "Input target date for approval",
        "input_type": "Date",
        "fn": "SDE",
        "lead": None,
        "dep": 16,
    },
    {
        "ph": 3,
        "tab": "OEM BPW",
        "act": "Identify BPW number",
        "input_type": "BPW number",
        "fn": "PM",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 3,
        "tab": "OEM BPW",
        "act": "Input target date for approval",
        "input_type": "Date",
        "fn": "PM",
        "lead": 175,
        "dep": None,
    },
    # Phase 4: Scrap
    {
        "ph": 4,
        "tab": "Old tool disposition",
        "act": "Confirm scrap / return / storage / disposition if required",
        "input_type": "Scrap / Return / Storage / Not required",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 4,
        "tab": "Receive SCR request",
        "act": "Request SCR from supplier to proceed with scrapping tool",
        "input_type": "SCR reference",
        "fn": "SDE",
        "lead": None,
        "dep": 20,
    },
    {
        "ph": 4,
        "tab": "Prepare documentation for scrapping",
        "act": "Review if tool can be scrapped and fill TDA format",
        "input_type": "TDA document link",
        "fn": "SP/BU",
        "lead": None,
        "dep": 21,
    },
    {
        "ph": 4,
        "tab": "TDA Approval",
        "act": "Review tool in the books / approval",
        "input_type": "Approval date",
        "fn": "Accounting",
        "lead": None,
        "dep": 22,
    },
    {
        "ph": 4,
        "tab": "Scrap tool",
        "act": "Confirm if internal scrapping or external scrap",
        "input_type": "Internal / External",
        "fn": "Accounting",
        "lead": None,
        "dep": 23,
    },
    # Phase 5: Archive
    {
        "ph": 5,
        "tab": "Prepare management review",
        "act": "Prepare slides / summary / overdue list",
        "input_type": "Review document link",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 5,
        "tab": "Attend supplier status meeting",
        "act": "Review multiple tooling projects with supplier",
        "input_type": "Meeting date",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 5,
        "tab": "Maintain tooling master list",
        "act": "Update master list / Excel / SharePoint / system",
        "input_type": "Update date",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 5,
        "tab": "Upload / store documents",
        "act": "Save RFQ / quote / PO / PPAP / approvals in required location",
        "input_type": "Folder link",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 5,
        "tab": "Search for historical information",
        "act": "Search old emails / folders / systems for previous tooling data",
        "input_type": "Findings / link",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
    {
        "ph": 5,
        "tab": "Correct data / tracker errors",
        "act": "Correct tool status / ownership / timing / supplier information",
        "input_type": "Correction date",
        "fn": "SP/BU",
        "lead": None,
        "dep": None,
    },
]


def build_actions_for_project(
    project_id: str, team: dict[str, str]
) -> list[ProjectAction]:
    """Given project_id and team mapping, instantiate standard actions from matrix."""
    actions: list[ProjectAction] = []
    for i, m in enumerate(STANDARD_MATRIX):
        act_id = f"{project_id}-{i}"
        dep_id = f"{project_id}-{m['dep']}" if m["dep"] is not None else None
        owner = team.get(m["fn"], "")
        action = ProjectAction(
            id=act_id,
            project_id=project_id,
            ph=m["ph"],
            tab=m["tab"],
            act=m["act"],
            input_type=m["input_type"],
            fn=m["fn"],
            owner=owner,
            dep_id=dep_id,
            lead_default=m["lead"],
            lead=m["lead"],
            due_date=None,
            done_date=None,
            value="",
            comment="",
            link="",
            is_custom=False,
            last_remind_date=None,
        )
        actions.append(action)
    return actions


def schedule_project_actions(
    project_created: date, actions: list[ProjectAction]
) -> None:
    """先验证完整依赖图，再按拓扑顺序排期；输入顺序不影响结果。"""
    actions_by_id = {a.id: a for a in actions}
    if len(actions_by_id) != len(actions):
        raise ValueError("Duplicate action IDs")
    graph = {}
    for action in actions:
        if action.dep_id is not None and action.dep_id not in actions_by_id:
            raise ValueError(f"Unknown predecessor: {action.dep_id}")
        graph[action.id] = (action.dep_id,) if action.dep_id else ()
    try:
        ordered = tuple(TopologicalSorter(graph).static_order())
    except CycleError as exc:
        raise ValueError("Action dependencies contain a cycle") from exc
    # 先计算到临时映射，日期越界时也不会留下半次排期结果。
    dates = {}
    for identifier in ordered:
        action = actions_by_id[identifier]
        if action.lead is None:
            dates[identifier] = action.due_date
            continue
        predecessor = (
            actions_by_id[action.dep_id] if action.dep_id is not None else None
        )
        base = project_created
        if predecessor is not None:
            base = predecessor.done_date or dates[predecessor.id] or project_created
        try:
            dates[identifier] = base + timedelta(days=action.lead)
        except OverflowError as exc:
            raise ValueError(
                "Scheduled date is outside the supported date range"
            ) from exc
    for action in actions:
        action.due_date = dates[action.id]


def compute_action_status(action: ProjectAction, today: date | None = None) -> Health:
    """
    Computes action status:
    - green: completed (done_date is set)
    - red: overdue (today > due_date)
    - yellow: due soon (0 <= due_date - today <= 5 days)
    - gray: not started or no due date
    """
    if action.done_date is not None:
        return "green"
    if action.due_date is None:
        return "gray"
    curr_date = today or local_today()
    dl = (action.due_date - curr_date).days
    if dl < 0:
        return "red"
    if dl <= 5:
        return "yellow"
    return "gray"


def compute_project_summary(
    project_created: date, actions: list[ProjectAction], today: date | None = None
) -> ProjectSummary:
    """Calculates overall and phase-level metrics for a project."""
    curr_date = today or local_today()
    counts = {"green": 0, "yellow": 0, "red": 0, "gray": 0}
    for a in actions:
        counts[compute_action_status(a, curr_date)] += 1

    total = len(actions)
    completed = counts["green"]
    pct = min(99, round(100 * completed / total)) if completed < total else 100
    open_actions = total - completed
    overdue_actions = counts["red"]
    due_soon_actions = counts["yellow"]
    undated_actions = sum(1 for a in actions if not a.done_date and not a.due_date)

    phases = []
    health: Health
    state: PhaseState
    for ph_idx in range(6):
        ph_acts = [a for a in actions if a.ph == ph_idx]
        ph_counts = {
            color: sum(compute_action_status(a, curr_date) == color for a in ph_acts)
            for color in ("green", "red", "yellow", "gray")
        }
        is_complete = (ph_idx == 0 and not ph_acts) or (
            bool(ph_acts) and ph_counts["green"] == len(ph_acts)
        )
        if is_complete:
            health, state = "green", "completed"
        elif ph_counts["red"]:
            health, state = "red", "overdue"
        else:
            health = "yellow" if ph_counts["yellow"] else "gray"
            started = any(a.done_date is not None or bool(a.value) for a in ph_acts)
            state = "in-progress" if started else "planned"
        phases.append(
            PhaseSummary(
                phase=ph_idx,
                status=state,
                health=health,
                total_actions=len(ph_acts),
                completed_actions=ph_counts["green"],
                overdue_actions=ph_counts["red"],
                due_soon_actions=ph_counts["yellow"],
            )
        )

    # Determine active phase (first phase with incomplete actions)
    active_phase = 5
    for ph_idx in range(6):
        if any(a.ph == ph_idx and not a.done_date for a in actions):
            active_phase = ph_idx
            break

    # Determine overall status
    if overdue_actions > 0:
        overall_status = "red"
    elif due_soon_actions > 0:
        overall_status = "yellow"
    elif open_actions == 0:
        overall_status = "green"
    else:
        overall_status = "gray"

    # Next milestone
    open_with_due = [a for a in actions if not a.done_date and a.due_date]
    open_with_due.sort(key=lambda a: (a.due_date or date.max, a.id))
    next_milestone = (
        f"{open_with_due[0].tab} ({open_with_due[0].due_date})"
        if open_with_due
        else None
    )

    # Red flags (overdue actions with owner and days overdue)
    red_flags: list[str] = []
    for a in sorted(actions, key=lambda item: (item.due_date or date.max, item.id)):
        if compute_action_status(a, curr_date) == "red" and a.due_date:
            days_overdue = (curr_date - a.due_date).days
            red_flags.append(
                f"{a.tab} ({a.owner or 'Unassigned'}, {days_overdue} d overdue)"
            )

    return ProjectSummary(
        phase=active_phase,
        overall_status=overall_status,
        pct=pct,
        total_actions=total,
        completed_actions=completed,
        open_actions=open_actions,
        overdue_actions=overdue_actions,
        due_soon_actions=due_soon_actions,
        undated_actions=undated_actions,
        phase_statuses=[p.status for p in phases],
        phase_health=[p.health for p in phases],
        phases=phases,
        next_milestone=next_milestone,
        red_flags=red_flags,
    )


def reassign_team_member(
    actions: list[ProjectAction], function: str, new_owner: str
) -> int:
    """
    Reassign all uncompleted actions of a given function to the new person.
    Completed actions strictly keep their original owner for auditability.
    Returns the count of reassigned actions.
    """
    reassigned = 0
    for a in actions:
        if a.fn == function and a.done_date is None:
            a.owner = new_owner
            reassigned += 1
    return reassigned
