"""refine budget category uniqueness and allocation foreign key

Revision ID: 006
Revises: 005
Create Date: 2026-08-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Budget category taxonomy constraint
    # ------------------------------------------------------------------

    op.create_check_constraint(
        "ck_budget_categories_mapping_group",
        "budget_categories",
        "mapping_group IN ('needs', 'wants', 'savings')",
    )

    # ------------------------------------------------------------------
    # Convert existing allocation category slugs to category UUIDs
    # ------------------------------------------------------------------
    #
    # Older budget_allocations rows stored category slugs in category_id.
    # Resolve them to the appropriate budget_categories.id before adding
    # the foreign key constraint.
    #
    # Prefer a user-specific category when available, then fall back to
    # the shared system default category.

    op.execute(
        """
        UPDATE budget_allocations AS ba
        SET category_id = COALESCE(
            (
                SELECT bc.id
                FROM budgets AS b
                JOIN budget_categories AS bc
                  ON bc.slug = ba.category_id
                 AND bc.user_id = b.user_id
                 AND bc.is_default = false
                 AND bc.is_active = true
                WHERE b.id = ba.budget_id
                ORDER BY bc.updated_at DESC NULLS LAST,
                         bc.created_at DESC NULLS LAST
                LIMIT 1
            ),
            (
                SELECT bc.id
                FROM budget_categories AS bc
                WHERE bc.slug = ba.category_id
                  AND bc.is_default = true
                  AND bc.user_id IS NULL
                  AND bc.is_active = true
                ORDER BY bc.updated_at DESC NULLS LAST,
                         bc.created_at DESC NULLS LAST
                LIMIT 1
            ),
            ba.category_id
        )
        WHERE ba.category_id IS NOT NULL
        """
    )

    # ------------------------------------------------------------------
    # Verify every allocation now references a real category
    # ------------------------------------------------------------------

    bind = op.get_bind()

    unresolved = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM budget_allocations AS ba
            LEFT JOIN budget_categories AS bc
              ON bc.id = ba.category_id
            WHERE bc.id IS NULL
            """
        )
    ).scalar_one()

    if unresolved:
        raise RuntimeError(
            "Cannot enforce budget_allocations.category_id FK: "
            f"{unresolved} rows could not be resolved to "
            "budget_categories.id"
        )

    # ------------------------------------------------------------------
    # Change category_id from slug-sized string to UUID-sized string
    # ------------------------------------------------------------------

    op.alter_column(
        "budget_allocations",
        "category_id",
        existing_type=sa.String(length=100),
        type_=sa.String(length=36),
        existing_nullable=False,
    )

    # ------------------------------------------------------------------
    # Add category index and foreign key
    # ------------------------------------------------------------------

    op.create_index(
        "ix_budget_allocations_category_id",
        "budget_allocations",
        ["category_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_budget_allocations_category_id_budget_categories",
        "budget_allocations",
        "budget_categories",
        ["category_id"],
        ["id"],
    )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # Remove category foreign key and index
    # ------------------------------------------------------------------

    op.drop_constraint(
        "fk_budget_allocations_category_id_budget_categories",
        "budget_allocations",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_budget_allocations_category_id",
        table_name="budget_allocations",
    )

    # ------------------------------------------------------------------
    # Convert category UUIDs back to slugs
    # ------------------------------------------------------------------

    op.execute(
        """
        UPDATE budget_allocations AS ba
        SET category_id = bc.slug
        FROM budget_categories AS bc
        WHERE ba.category_id = bc.id
        """
    )

    # ------------------------------------------------------------------
    # Restore original category_id column size
    # ------------------------------------------------------------------

    op.alter_column(
        "budget_allocations",
        "category_id",
        existing_type=sa.String(length=36),
        type_=sa.String(length=100),
        existing_nullable=False,
    )

    # The category uniqueness indexes were created by migration 005,
    # so they remain in place when migration 006 is downgraded.
    #
    # Likewise, the mapping-group constraint belongs to this migration
    # and therefore must be removed here.

    op.drop_constraint(
        "ck_budget_categories_mapping_group",
        "budget_categories",
        type_="check",
    )

