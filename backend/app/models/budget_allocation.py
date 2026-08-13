from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.budget import Budget


class BudgetAllocation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "budget_allocations"

    budget_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("budgets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("budget_categories.id"),
        nullable=False,
        index=True,
    )
    allocated_amount: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
    )

    budget: Mapped["Budget"] = relationship(back_populates="allocations")
