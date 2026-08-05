"""add financial setup profile and memory fields

Revision ID: 003
Revises: 002
Create Date: 2026-08-05
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column(
            "financial_setup_completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "user_profiles",
        sa.Column("financial_setup_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "financial_memories",
        sa.Column("details", sa.JSON(), nullable=True),
    )
    op.create_index(
        "idx_fm_user_source_not_deleted",
        "financial_memories",
        ["user_id", "source", "is_deleted"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_fm_user_source_not_deleted", table_name="financial_memories"
    )
    op.drop_column("financial_memories", "details")
    op.drop_column("user_profiles", "financial_setup_version")
    op.drop_column("user_profiles", "financial_setup_completed_at")
