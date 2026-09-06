"""enforce one active budget per user and month

Revision ID: 008
Revises: 007
Create Date: 2026-09-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # CockroachDB supports partial unique indexes with PostgreSQL-compatible
    # predicates. Existing duplicates are resolved deterministically first.
    op.execute(
        """
        UPDATE budgets
        SET status = 'archived'
        WHERE status = 'active'
          AND id NOT IN (
            SELECT id FROM (
              SELECT id,
                     row_number() OVER (
                       PARTITION BY user_id, year, month
                       ORDER BY approved_at DESC NULLS LAST, created_at DESC, id DESC
                     ) AS position
              FROM budgets
              WHERE status = 'active'
            ) ranked
            WHERE position = 1
          )
        """
    )
    op.create_index(
        "uq_budgets_active_user_year_month",
        "budgets",
        ["user_id", "year", "month"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_budgets_active_user_year_month", table_name="budgets")
