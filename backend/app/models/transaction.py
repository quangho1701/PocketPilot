from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Enum as SAEnum, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class TransactionType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionSource(str, enum.Enum):
    MANUAL = "manual"
    OCR = "ocr"


class Transaction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "transactions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(
        SAEnum(
            TransactionType,
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=False,
    )
    merchant: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("budget_categories.id"), nullable=False
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[TransactionSource] = mapped_column(
        SAEnum(
            TransactionSource,
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=False,
        default=TransactionSource.MANUAL,
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        Index("idx_transactions_user_date", "user_id", "transaction_date"),
        Index("idx_transactions_user_type", "user_id", "transaction_type"),
        Index("idx_transactions_user_category", "user_id", "category_id"),
    )
