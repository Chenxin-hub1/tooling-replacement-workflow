from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.project import Project


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    function: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="team_members")
