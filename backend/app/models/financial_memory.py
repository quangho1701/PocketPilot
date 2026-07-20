from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class MemoryType(str, enum.Enum):
    TRANSACTION = "transaction"
    GOAL = "goal"
    INCOME = "income"
    RECURRING_EXPENSE = "recurring_expense"
    NOTE = "note"
    PATTERN = "pattern"
    PREFERENCE = "preference"


class MemoryImportance(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FinancialMemory(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "financial_memories"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    memory_type: Mapped[MemoryType] = mapped_column(SAEnum(MemoryType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    importance: Mapped[MemoryImportance] = mapped_column(
        SAEnum(MemoryImportance), default=MemoryImportance.MEDIUM
    )
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    embedding: Mapped[Optional[MemoryEmbedding]] = relationship(
        back_populates="memory", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_fm_user_type", "user_id", "memory_type"),
        Index("idx_fm_user_category", "user_id", "category"),
        Index("idx_fm_user_not_deleted", "user_id", "is_deleted"),
    )


from app.models.memory_embedding import MemoryEmbedding  # noqa: E402
