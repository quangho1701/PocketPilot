"""budget foundation

Revision ID: 004
Revises: 003
Create Date: 2026-08-01 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budgets",
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
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("total_income", sa.Float(), nullable=False),
        sa.Column("planned_savings", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )

    op.create_index(
        "idx_budgets_user_year_month",
        "budgets",
        ["user_id", "year", "month"],
        unique=False,
    )

    op.create_table(
        "budget_allocations",
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
        sa.Column("budget_id", sa.String(length=36), nullable=False),
        sa.Column("category_id", sa.String(length=100), nullable=False),
        sa.Column("allocated_amount", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["budget_id"],
            ["budgets.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_index(
        op.f("ix_budget_allocations_budget_id"),
        "budget_allocations",
        ["budget_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_budget_allocations_budget_id"),
        table_name="budget_allocations",
    )
    op.drop_table("budget_allocations")

    op.drop_index(
        "idx_budgets_user_year_month",
        table_name="budgets",
    )
    op.drop_table("budgets")
