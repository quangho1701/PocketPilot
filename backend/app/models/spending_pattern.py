from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PatternType(str, enum.Enum):
    RECURRING = "recurring"
    SEASONAL = "seasonal"
    BEHAVIORAL = "behavioral"
    TREND = "trend"
    CATEGORY_SHIFT = "category_shift"


class PatternStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    TENTATIVE = "tentative"


class SpendingPattern(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "spending_patterns"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    pattern_type: Mapped[PatternType] = mapped_column(SAEnum(PatternType), nullable=False)
    status: Mapped[PatternStatus] = mapped_column(
        SAEnum(PatternStatus), default=PatternStatus.TENTATIVE
    )

    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    average_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    frequency_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5)

    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    time_of_day: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    data_points: Mapped[int] = mapped_column(Integer, default=0)
    pattern_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    next_expected_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    predicted_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    __table_args__ = (
        Index("idx_sp_user_status", "user_id", "status"),
        Index("idx_sp_user_category", "user_id", "category"),
    )
