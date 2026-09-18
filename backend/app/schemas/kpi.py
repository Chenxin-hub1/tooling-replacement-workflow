from pydantic import BaseModel


class PhaseCount(BaseModel):
    phase: int
    projects: int


class OverdueRole(BaseModel):
    function: str
    overdue_actions: int


class OverdueProject(BaseModel):
    project_id: str
    overdue_actions: int


class OverdueOwner(BaseModel):
    owner: str
    overdue_actions: int


class KpiSummary(BaseModel):
    total_projects: int
    completed_projects: int
    total_actions: int
    completed_actions: int
    overdue_actions: int
    due_soon_actions: int
    phase_distribution: list[PhaseCount]
    overdue_by_function: list[OverdueRole]
    overdue_by_project: list[OverdueProject]
    overdue_by_owner: list[OverdueOwner]
