from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Role = Literal["BU Buyer", "SDE", "PM", "ENG", "SP/BU", "Accounting"]
Health = Literal["green", "red", "yellow", "gray"]
PhaseState = Literal["completed", "overdue", "in-progress", "planned"]
Phase = Annotated[int, Field(ge=0, le=5, strict=True)]
Lead = Annotated[int, Field(ge=0, le=36500, strict=True)]
Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]
Identifier = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$",
    ),
]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
