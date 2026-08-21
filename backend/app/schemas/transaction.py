from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.transaction import TransactionSource, TransactionType


Money = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=2)]


class TransactionCreate(BaseModel):
    amount: Money
    transaction_type: TransactionType
    merchant: str = Field(min_length=1, max_length=255)
    category_id: str = Field(min_length=1, max_length=36)
    transaction_date: date
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    payment_method: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    source: TransactionSource = TransactionSource.MANUAL


class TransactionUpdate(BaseModel):
    amount: Optional[Money] = None
    transaction_type: Optional[TransactionType] = None
    merchant: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    transaction_date: Optional[date] = None
    currency: Optional[str] = Field(
        default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"
    )
    payment_method: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    amount: Decimal
    transaction_type: TransactionType
    merchant: str
    category_id: str
    transaction_date: date
    currency: str
    payment_method: Optional[str]
    description: Optional[str]
    source: TransactionSource


class TransactionFilter(BaseModel):
    transaction_type: Optional[TransactionType] = None
    category_id: Optional[str] = None
    source: Optional[TransactionSource] = None
    merchant: Optional[str] = Field(default=None, max_length=255)
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReceiptOCRResponse(BaseModel):
    """OCR result shown to the user before a transaction is created."""

    status: Literal["preview"] = "preview"
    filename: str
    content_type: str
    merchant: Optional[str] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    transaction_date: Optional[date] = None
    currency: Optional[str] = Field(
        default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"
    )
    raw_text: str
    confidence: Optional[float] = Field(default=None, ge=0, le=100)
    source: TransactionSource = TransactionSource.OCR
    requires_confirmation: bool = True


class DashboardCategorySummary(BaseModel):
    category_id: str
    category_name: str
    total_amount: Decimal
    transaction_count: int


class DashboardResponse(BaseModel):
    date_from: Optional[date]
    date_to: Optional[date]
    total_income: Decimal
    total_expense: Decimal
    net_balance: Decimal
    transaction_count: int
    by_category: list[DashboardCategorySummary]
