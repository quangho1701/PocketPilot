from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, and_
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class BudgetCategory(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "budget_categories"

    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    mapping_group: Mapped[str] = mapped_column(String(20), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint(
            "mapping_group IN ('needs', 'wants', 'savings')",
            name="ck_budget_categories_mapping_group",
        ),
        # Global default categories: each slug can exist only once.
        Index(
            "uq_budget_categories_default_slug",
            "slug",
            unique=True,
            postgresql_where=and_(
                user_id.is_(None),
            ),
            sqlite_where=and_(
                user_id.is_(None),
            ),
        ),
        # Custom categories: the same slug can be used by different users,
        # but not twice by the same user.
        Index(
            "uq_budget_categories_user_slug",
            "user_id",
            "slug",
            unique=True,
            postgresql_where=and_(
                user_id.is_not(None),
            ),
            sqlite_where=and_(
                user_id.is_not(None),
            ),
        ),
        Index("idx_budget_categories_user_default", "user_id", "is_default"),
        Index("idx_budget_categories_mapping_group", "mapping_group"),
    )