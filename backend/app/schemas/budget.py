from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BudgetAllocationCreate(BaseModel):
    category_id: str = Field(min_length=1, max_length=100)
    allocated_amount: float = Field(ge=0)


class BudgetAllocationResponse(BaseModel):
    id: str
    budget_id: str
    category_id: str
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
    allocations: list[BudgetAllocationCreate] = Field(default_factory=list)


class BudgetResponse(BaseModel):
    id: str
    user_id: str
    month: int
    year: int
    total_income: float
    planned_savings: float
    status: str
    allocations: list[BudgetAllocationResponse]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetSimulationRequest(BaseModel):
    target_amount: float = Field(ge=0)
    monthly_contribution: float = Field(ge=0)
    months: int = Field(ge=1, le=120)
    current_savings: float = Field(ge=0)


class BudgetAllocationProposal(BaseModel):
    category_id: str = Field(min_length=1, max_length=100)
    amount: float = Field(ge=0)
    reason: Optional[str] = None


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


class BudgetAdjustmentRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000)
    days_elapsed: int = Field(ge=0)
    days_in_month: int = Field(ge=1, le=31)
    actual_spending: list[dict] = Field(default_factory=list)
    recent_behavior: dict = Field(default_factory=dict)
