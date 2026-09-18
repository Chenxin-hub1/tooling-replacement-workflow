from pydantic import BaseModel, ConfigDict


class TeamMemberBase(BaseModel):
    function: str
    name: str
    email: str | None = None


class TeamMemberCreate(TeamMemberBase):
    pass


class TeamMemberResponse(TeamMemberBase):
    id: int
    project_id: str

    model_config = ConfigDict(from_attributes=True)
