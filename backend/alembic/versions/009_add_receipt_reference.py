"""store the original receipt reference on transactions

Revision ID: 009
Revises: 008
"""

from alembic import op
import sqlalchemy as sa


revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("receipt_reference", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "receipt_reference")
