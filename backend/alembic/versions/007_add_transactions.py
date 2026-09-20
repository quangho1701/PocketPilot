"""add transactions table

Revision ID: 007
Revises: 006
Create Date: 2026-08-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    transaction_type = postgresql.ENUM(
        "income",
        "expense",
        name="transactiontype",
        create_type=False,
    )
    transaction_source = postgresql.ENUM(
        "manual",
        "ocr",
        name="transactionsource",
        create_type=False,
    )

    transaction_type.create(op.get_bind(), checkfirst=True)
    transaction_source.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "transaction_type",
            transaction_type,
            nullable=False,
        ),
        sa.Column("merchant", sa.String(length=255), nullable=False),
        sa.Column("category_id", sa.String(length=36), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("payment_method", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "source",
            transaction_source,
            nullable=False,
            server_default="manual",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "amount > 0",
            name="ck_transactions_amount_positive",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["budget_categories.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_transactions_user_date",
        "transactions",
        ["user_id", "transaction_date"],
    )
    op.create_index(
        "idx_transactions_user_type",
        "transactions",
        ["user_id", "transaction_type"],
    )
    op.create_index(
        "idx_transactions_user_category",
        "transactions",
        ["user_id", "category_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_transactions_user_category", table_name="transactions")
    op.drop_index("idx_transactions_user_type", table_name="transactions")
    op.drop_index("idx_transactions_user_date", table_name="transactions")
    op.drop_table("transactions")

    bind = op.get_bind()
    sa.Enum(name="transactionsource").drop(bind, checkfirst=True)
    sa.Enum(name="transactiontype").drop(bind, checkfirst=True)
