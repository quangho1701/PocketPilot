from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class BudgetAllocationCreate(BaseModel):
    category_slug: Optional[str] = Field(default=None, min_length=1, max_length=80)
    category_id: Optional[str] = Field(default=None, min_length=1, max_length=80)
    allocated_amount: float = Field(ge=0)

    @model_validator(mode="after")
    def _require_category_identifier(self):
        if not self.category_slug and not self.category_id:
            raise ValueError("category_slug or category_id is required")
        return self


class BudgetAllocationUpdate(BaseModel):
    category_slug: Optional[str] = Field(default=None, min_length=1, max_length=80)
    category_id: Optional[str] = Field(default=None, min_length=1, max_length=80)
    amount: float = Field(ge=0)

    @model_validator(mode="after")
    def _require_category_identifier(self):
        if not self.category_slug and not self.category_id:
            raise ValueError("category_slug or category_id is required")
        return self


class BudgetAllocationResponse(BaseModel):
    id: str
    budget_id: str
    category_id: str
    category_slug: Optional[str] = None
    allocated_amount: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000)
    total_income: float = Field(ge=0)
    planned_savings: float = Field(ge=0)
    status: str = Field(default="draft", max_length=20)
    budgeting_mode: str = Field(default="50_30_20", max_length=30)
    strategy_source: str = Field(default="deterministic", max_length=30)
    allocations: list[BudgetAllocationCreate] = Field(default_factory=list)


class BudgetResponse(BaseModel):
    id: str
    user_id: str
    month: int
    year: int
    total_income: float
    planned_savings: float
    status: str
    budgeting_mode: str
    strategy_source: str
    approved_at: Optional[datetime]
    allocations: list[BudgetAllocationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetAllocationProposal(BaseModel):
    category_slug: Optional[str] = Field(default=None, min_length=1, max_length=80)
    category_id: Optional[str] = Field(default=None, min_length=1, max_length=80)
    amount: float = Field(ge=0)
    reason: Optional[str] = None

    @model_validator(mode="after")
    def _require_category_identifier(self):
        if not self.category_slug and not self.category_id:
            raise ValueError("category_slug or category_id is required")
        return self


class BudgetProposalPayload(BaseModel):
    total_income: float = Field(ge=0)
    planned_savings: float = Field(ge=0)
    allocations: list[BudgetAllocationProposal] = Field(default_factory=list)
    strategy: str = Field(default="50_30_20")
    reasoning: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class BudgetGenerationRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000)
    budgeting_mode: str = Field(default="50_30_20")
    user_id: Optional[str] = None
    custom_allocations: list[BudgetAllocationUpdate] = Field(default_factory=list)


class BudgetAdjustmentRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000)
    days_elapsed: int = Field(ge=0)
    days_in_month: int = Field(ge=1, le=31)
    actual_spending: list[dict] = Field(default_factory=list)
    recent_behavior: dict = Field(default_factory=dict)


class BudgetProposalGenerateRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000)
    budgeting_mode: Literal["50_30_20", "zero_based", "custom", "ai_personalized"]
    custom_allocations: list[BudgetAllocationUpdate] = Field(default_factory=list)


class BudgetProposalUpdateRequest(BaseModel):
    planned_savings: Optional[float] = Field(default=None, ge=0)
    allocations: Optional[list[BudgetAllocationUpdate]] = None


class BudgetCategoryCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    mapping_group: Literal["needs", "wants", "savings"]


class BudgetCategoryResponse(BaseModel):
    id: str
    slug: str
    name: str
    mapping_group: str
    is_default: bool
    user_id: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetCategoryProgress(BaseModel):
    category_id: str
    category_slug: Optional[str] = None
    allocated_amount: float
    spent_amount: float
    remaining_amount: float
    percentage_used: float
    near_limit: bool


class BudgetProgressResponse(BaseModel):
    budget: BudgetResponse
    total_allocated: float
    total_spent: float
    total_remaining: float
    budget_utilization_percent: float
    savings_progress: float
    categories: list[BudgetCategoryProgress]
