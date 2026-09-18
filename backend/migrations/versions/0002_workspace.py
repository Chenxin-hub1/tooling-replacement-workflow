"""保存样板完整工作区，不变更已有项目表。"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("workspaces")
