from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.project import Project


class ProjectAction(Base):
    __tablename__ = "project_actions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    ph: Mapped[int] = mapped_column(Integer, index=True)  # 0 to 5 for phases 1 to 6
    tab: Mapped[str] = mapped_column(String(128))
    act: Mapped[str] = mapped_column(String(255))
    input_type: Mapped[str] = mapped_column(String(128))
    fn: Mapped[str] = mapped_column(String(64))  # Function / role
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dep_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lead_default: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lead: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    done_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )  # v2: initiated / in_progress / approved
    orig: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )  # v2: 双日期动作的原始日期
    date_log: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    last_remind_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="actions")
