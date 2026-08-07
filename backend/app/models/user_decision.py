from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Boolean, Enum as SAEnum, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DecisionType(str, enum.Enum):
    BUY = "buy"
    WAIT = "wait"
    SKIP = "skip"


class DecisionOutcome(str, enum.Enum):
    FOLLOWED = "followed"
    OVERRIDDEN = "overridden"
    PENDING = "pending"


class UserDecision(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_decisions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )

    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)

    ai_recommendation: Mapped[DecisionType] = mapped_column(
        SAEnum(DecisionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    ai_reasoning: Mapped[str] = mapped_column(Text, nullable=False)

    user_decision: Mapped[DecisionType] = mapped_column(
        SAEnum(DecisionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    outcome: Mapped[DecisionOutcome] = mapped_column(
        SAEnum(DecisionOutcome, values_callable=lambda x: [e.value for e in x]),
        default=DecisionOutcome.PENDING,
    )

    context_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    user_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    was_helpful: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    memory_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("financial_memories.id"), nullable=True
    )

    __table_args__ = (
        Index("idx_ud_user", "user_id"),
        Index("idx_ud_user_category", "user_id", "category"),
        Index("idx_ud_user_outcome", "user_id", "outcome"),
    )
