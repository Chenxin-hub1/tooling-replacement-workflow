"""v2 Phase-2：双日期动作增加原始日期列（ISO 日期）。"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_actions",
        sa.Column("orig", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_actions", "orig")
