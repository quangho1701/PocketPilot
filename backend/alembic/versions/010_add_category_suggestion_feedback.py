"""store category suggestion feedback on transactions

Revision ID: 010
Revises: 009
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("suggested_category_id", sa.String(length=36), nullable=True))
    op.add_column("transactions", sa.Column("category_suggestion_source", sa.String(length=20), nullable=True))
    op.add_column("transactions", sa.Column("category_suggestion_confidence", sa.Float(), nullable=True))
    op.add_column("transactions", sa.Column("category_suggestion_accepted", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "category_suggestion_accepted")
    op.drop_column("transactions", "category_suggestion_confidence")
    op.drop_column("transactions", "category_suggestion_source")
    op.drop_column("transactions", "suggested_category_id")
