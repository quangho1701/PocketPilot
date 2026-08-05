from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserProfileCreate(BaseModel):
    monthly_income: Optional[float] = None
    income_frequency: Optional[str] = Field(
        default=None, pattern="^(weekly|biweekly|monthly)$"
    )
    risk_tolerance: str = Field(
        default="moderate", pattern="^(conservative|moderate|aggressive)$"
    )
    savings_priority: str = Field(
        default="balanced", pattern="^(minimal|balanced|aggressive)$"
    )
    currency: str = Field(default="USD", max_length=3)
    spending_categories: Optional[dict] = None
    financial_situation_notes: Optional[str] = None


class UserProfileUpdate(BaseModel):
    monthly_income: Optional[float] = None
    income_frequency: Optional[str] = None
    risk_tolerance: Optional[str] = None
    savings_priority: Optional[str] = None
    spending_categories: Optional[dict] = None
    notification_preferences: Optional[dict] = None
    currency: Optional[str] = Field(default=None, max_length=3)
    financial_situation_notes: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: str
    user_id: str
    monthly_income: Optional[float]
    income_frequency: Optional[str]
    risk_tolerance: str
    savings_priority: str
    currency: str
    spending_categories: Optional[dict]
    notification_preferences: Optional[dict]
    behavior_profile: Optional[dict]
    financial_situation_notes: Optional[str] = None
    financial_setup_completed_at: Optional[datetime] = None
    financial_setup_version: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
