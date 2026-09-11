"""add chat simulation fields

Revision ID: 007
Revises: 006
Create Date: 2026-09-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("simulation_input", sa.JSON(), nullable=True))
    op.add_column("chat_messages", sa.Column("simulation_result", sa.JSON(), nullable=True))
    op.add_column("chat_messages", sa.Column("simulation_schema_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "simulation_schema_version")
    op.drop_column("chat_messages", "simulation_result")
    op.drop_column("chat_messages", "simulation_input")