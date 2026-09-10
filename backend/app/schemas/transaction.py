from __future__ import annotations

from datetime import date as Date
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.transaction import TransactionSource, TransactionType


Money = Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=2)]


class TransactionCreate(BaseModel):
    amount: Money
    transaction_type: TransactionType = TransactionType.EXPENSE
    merchant: Optional[str] = Field(default=None, max_length=255)
    category_id: Optional[str] = Field(default=None, max_length=80)
    transaction_date: Optional[Date] = None
    currency: str = Field(default="USD", min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    payment_method: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    # Legacy budgeting clients used category/date instead of the normalized
    # transaction model. Keep accepting those payloads during the branch merge.
    category: Optional[str] = Field(default=None, max_length=80)
    date: Optional[Date] = None
    receipt_reference: Optional[str] = Field(default=None, max_length=255)
    suggested_category_id: Optional[str] = Field(default=None, max_length=36)
    category_suggestion_source: Optional[Literal["llm", "rules"]] = None
    category_suggestion_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    category_suggestion_accepted: Optional[bool] = None
    source: TransactionSource = TransactionSource.MANUAL

    @model_validator(mode="after")
    def normalize_legacy_fields(self):
        if self.category_id is None:
            self.category_id = self.category
        if self.transaction_date is None:
            self.transaction_date = self.date
        if self.merchant is None:
            self.merchant = self.description or "Manual transaction"
        if self.description is None:
            self.description = self.merchant
        if not self.category_id:
            raise ValueError("category_id or category is required")
        if self.transaction_date is None:
            raise ValueError("transaction_date or date is required")
        return self


class TransactionUpdate(BaseModel):
    amount: Optional[Money] = None
    transaction_type: Optional[TransactionType] = None
    merchant: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category_id: Optional[str] = Field(default=None, min_length=1, max_length=36)
    transaction_date: Optional[Date] = None
    currency: Optional[str] = Field(
        default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"
    )
    payment_method: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None
    receipt_reference: Optional[str] = Field(default=None, max_length=255)
    suggested_category_id: Optional[str] = Field(default=None, max_length=36)
    category_suggestion_source: Optional[Literal["llm", "rules"]] = None
    category_suggestion_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    category_suggestion_accepted: Optional[bool] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    amount: Decimal
    transaction_type: TransactionType
    merchant: str
    category_id: str
    transaction_date: Date
    currency: str
    payment_method: Optional[str]
    description: Optional[str]
    receipt_reference: Optional[str]
    suggested_category_id: Optional[str]
    category_suggestion_source: Optional[Literal["llm", "rules"]]
    category_suggestion_confidence: Optional[float]
    category_suggestion_accepted: Optional[bool]
    source: TransactionSource


class TransactionFilter(BaseModel):
    transaction_type: Optional[TransactionType] = None
    category_id: Optional[str] = None
    source: Optional[TransactionSource] = None
    merchant: Optional[str] = Field(default=None, max_length=255)
    payment_method: Optional[str] = Field(default=None, max_length=50)
    date_from: Optional[Date] = None
    date_to: Optional[Date] = None
    sort_by: Literal["transaction_date", "amount", "merchant"] = "transaction_date"
    sort_order: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReceiptLineItem(BaseModel):
    description: str
    amount: Optional[Decimal] = Field(default=None, gt=0)


class ReceiptOCRResponse(BaseModel):
    """OCR result shown to the user before a transaction is created."""

    status: Literal["preview"] = "preview"
    filename: str
    content_type: str
    receipt_reference: Optional[str] = None
    merchant: Optional[str] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    transaction_date: Optional[Date] = None
    currency: Optional[str] = Field(
        default=None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$"
    )
    subtotal: Optional[Decimal] = Field(default=None, gt=0)
    tax: Optional[Decimal] = Field(default=None, gt=0)
    items: list[ReceiptLineItem] = Field(default_factory=list)
    raw_text: str
    confidence: Optional[float] = Field(default=None, ge=0, le=100)
    source: TransactionSource = TransactionSource.OCR
    requires_confirmation: bool = True
    suggested_category: Optional["CategoryPrediction"] = None


class CategoryCandidate(BaseModel):
    category_id: str
    category_slug: str
    category_name: str
    confidence: float = Field(ge=0, le=1)
    rationale: Optional[str] = None


class CategoryPrediction(BaseModel):
    """A category suggestion shown for review before a transaction is saved."""

    status: Literal["preview"] = "preview"
    category_id: str
    category_slug: str
    category_name: str
    confidence: float = Field(ge=0, le=1)
    source: Literal["llm", "rules"]
    rationale: str
    normalized_merchant: Optional[str] = None
    alternatives: list[CategoryCandidate] = Field(default_factory=list)
    requires_review: bool = True


class CategorizationRequest(BaseModel):
    merchant: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    transaction_type: TransactionType = TransactionType.EXPENSE
    items: list[ReceiptLineItem] = Field(default_factory=list)


class DashboardCategorySummary(BaseModel):
    category_id: str
    category_name: str
    currency: str = "VND"
    total_amount: Decimal
    transaction_count: int


class DashboardCurrencySummary(BaseModel):
    currency: str
    total_income: Decimal
    total_expense: Decimal
    net_balance: Decimal
    transaction_count: int


class DashboardTrendPoint(BaseModel):
    period: str
    currency: str
    total_income: Decimal
    total_expense: Decimal


class DashboardResponse(BaseModel):
    date_from: Optional[Date]
    date_to: Optional[Date]
    total_income: Decimal
    total_expense: Decimal
    net_balance: Decimal
    transaction_count: int
    category_suggestion_count: int = 0
    category_suggestion_acceptance_rate: Optional[float] = None
    by_category: list[DashboardCategorySummary]
    by_currency: list[DashboardCurrencySummary] = Field(default_factory=list)
    spending_trend: list[DashboardTrendPoint] = Field(default_factory=list)
    recent_transactions: list[TransactionResponse] = Field(default_factory=list)
