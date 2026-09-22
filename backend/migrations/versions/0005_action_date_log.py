"""Preserve milestone history and place CVS CR in Development."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_actions",
        sa.Column("date_log", sa.JSON(), nullable=False, server_default="[]"),
    )
    move_cvs_actions(2, 1)


def move_cvs_actions(old_phase: int, new_phase: int) -> None:
    actions = sa.table(
        "project_actions",
        sa.column("ph", sa.Integer),
        sa.column("tab", sa.String),
        sa.column("act", sa.String),
        sa.column("is_custom", sa.Boolean),
    )
    op.execute(
        actions.update()
        .where(
            actions.c.ph == old_phase,
            actions.c.tab == "CVS CR",
            actions.c.act.in_(
                [
                    "Identify if applicable or not",
                    "Input CR number for CVS on Windchill",
                ]
            ),
            actions.c.is_custom.is_(False),
        )
        .values(ph=new_phase)
    )


def downgrade() -> None:
    move_cvs_actions(1, 2)
    op.drop_column("project_actions", "date_log")
