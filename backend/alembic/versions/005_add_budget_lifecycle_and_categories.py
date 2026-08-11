"""add budget lifecycle fields and category taxonomy

Revision ID: 005
Revises: 004
Create Date: 2026-08-07

"""

from typing import Sequence, Union
import uuid

import sqlalchemy as sa

from alembic import op


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_CATEGORIES = [
    ("housing", "Housing", "needs"),
    ("utilities", "Utilities", "needs"),
    ("groceries", "Groceries", "needs"),
    ("dining", "Dining", "wants"),
    ("transportation", "Transportation", "needs"),
    ("shopping", "Shopping", "wants"),
    ("healthcare", "Healthcare", "needs"),
    ("insurance", "Insurance", "needs"),
    ("education", "Education", "needs"),
    ("entertainment", "Entertainment", "wants"),
    ("subscriptions", "Subscriptions", "wants"),
    ("travel", "Travel", "wants"),
    ("savings", "Savings", "savings"),
    ("investments", "Investments", "savings"),
    ("gifts_donations", "Gifts & Donations", "wants"),
    ("personal_care", "Personal Care", "wants"),
    ("pets", "Pets", "needs"),
    ("miscellaneous", "Miscellaneous", "wants"),
]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Budget lifecycle fields
    # ------------------------------------------------------------------

    op.add_column(
        "budgets",
        sa.Column(
            "budgeting_mode",
            sa.String(length=30),
            nullable=False,
            server_default="50_30_20",
        ),
    )

    op.add_column(
        "budgets",
        sa.Column(
            "strategy_source",
            sa.String(length=30),
            nullable=False,
            server_default="deterministic",
        ),
    )

    op.add_column(
        "budgets",
        sa.Column(
            "approved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index(
        "idx_budgets_user_status",
        "budgets",
        ["user_id", "status"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Budget categories
    # ------------------------------------------------------------------

    op.create_table(
        "budget_categories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("mapping_group", sa.String(length=20), nullable=False),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Default categories are shared across all users.
    # Custom categories are scoped to individual users.
    #
    # Partial unique indexes allow:
    #   - exactly one default category for each slug
    #   - each user to have at most one custom category for each slug
    #
    # This also allows a user-specific category to reuse a slug that exists
    # as a system default category.

    op.create_index(
        "uq_budget_categories_default_slug",
        "budget_categories",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("user_id IS NULL"),
    )

    op.create_index(
        "uq_budget_categories_user_slug",
        "budget_categories",
        ["user_id", "slug"],
        unique=True,
        postgresql_where=sa.text("user_id IS NOT NULL"),
    )

    op.create_index(
        "idx_budget_categories_user_default",
        "budget_categories",
        ["user_id", "is_default"],
        unique=False,
    )

    op.create_index(
        "idx_budget_categories_mapping_group",
        "budget_categories",
        ["mapping_group"],
        unique=False,
    )

    op.create_index(
        op.f("ix_budget_categories_user_id"),
        "budget_categories",
        ["user_id"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Seed system default categories
    # ------------------------------------------------------------------

    budget_categories_table = sa.table(
        "budget_categories",
        sa.column("id", sa.String),
        sa.column("slug", sa.String),
        sa.column("name", sa.String),
        sa.column("mapping_group", sa.String),
        sa.column("is_default", sa.Boolean),
        sa.column("user_id", sa.String),
        sa.column("is_active", sa.Boolean),
    )

    op.bulk_insert(
        budget_categories_table,
        [
            {
                "id": str(uuid.uuid4()),
                "slug": slug,
                "name": name,
                "mapping_group": mapping_group,
                "is_default": True,
                "user_id": None,
                "is_active": True,
            }
            for slug, name, mapping_group in DEFAULT_CATEGORIES
        ],
    )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # Budget categories
    # ------------------------------------------------------------------

    op.drop_index(
        op.f("ix_budget_categories_user_id"),
        table_name="budget_categories",
    )

    op.drop_index(
        "idx_budget_categories_mapping_group",
        table_name="budget_categories",
    )

    op.drop_index(
        "idx_budget_categories_user_default",
        table_name="budget_categories",
    )

    op.drop_index(
        "uq_budget_categories_user_slug",
        table_name="budget_categories",
    )

    op.drop_index(
        "uq_budget_categories_default_slug",
        table_name="budget_categories",
    )

    op.drop_table("budget_categories")

    # ------------------------------------------------------------------
    # Budget lifecycle fields
    # ------------------------------------------------------------------

    op.drop_index(
        "idx_budgets_user_status",
        table_name="budgets",
    )

    op.drop_column(
        "budgets",
        "approved_at",
    )

    op.drop_column(
        "budgets",
        "strategy_source",
    )

    op.drop_column(
        "budgets",
        "budgeting_mode",
    )
