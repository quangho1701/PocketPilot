from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), unique=True, nullable=False
    )

    monthly_income: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    income_frequency: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_tolerance: Mapped[str] = mapped_column(String(20), default="moderate")
    savings_priority: Mapped[str] = mapped_column(String(20), default="balanced")

    spending_categories: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notification_preferences: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    currency: Mapped[str] = mapped_column(String(3), default="USD")
    financial_situation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    behavior_profile: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    last_learning_update: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
