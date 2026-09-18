from sqlalchemy import JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    document: Mapped[dict] = mapped_column(JSON, nullable=False)
