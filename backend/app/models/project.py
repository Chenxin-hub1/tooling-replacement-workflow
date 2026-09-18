from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.dates import local_today
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.action import ProjectAction
    from app.models.team import TeamMember


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    pn: Mapped[str] = mapped_column(String(128), index=True)
    desc: Mapped[str] = mapped_column(String(255))
    plant: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cur: Mapped[str | None] = mapped_column(String(128), nullable=True)
    nw: Mapped[str | None] = mapped_column(String(128), nullable=True)
    po: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    too_owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cav: Mapped[str | None] = mapped_column(String(64), nullable=True)
    saving: Mapped[str | None] = mapped_column(String(128), nullable=True)
    oem: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tech: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bu: Mapped[str | None] = mapped_column(String(128), nullable=True)
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[date] = mapped_column(Date, default=local_today)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    team_members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    actions: Mapped[list["ProjectAction"]] = relationship(
        "ProjectAction",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProjectAction.id",
    )
