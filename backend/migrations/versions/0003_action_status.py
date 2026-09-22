"""v2 Phase-1：凭证动作增加状态列（initiated / in_progress / approved）。"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_actions",
        sa.Column("status", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_actions", "status")
