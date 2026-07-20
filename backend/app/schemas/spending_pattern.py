from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.spending_pattern import PatternStatus, PatternType


class SpendingPatternResponse(BaseModel):
    id: str
    user_id: str
    pattern_type: PatternType
    status: PatternStatus
    category: str
    description: str
    average_amount: Optional[float]
    frequency_days: Optional[int]
    confidence_score: float
    data_points: int
    next_expected_date: Optional[datetime]
    predicted_amount: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SpendingPatternsListResponse(BaseModel):
    patterns: list[SpendingPatternResponse]
    total: int


class PatternFeedResponse(BaseModel):
    """Consumed by the budget service for pattern-aware planning."""

    recurring_expenses: list[SpendingPatternResponse]
    behavioral_patterns: list[SpendingPatternResponse]
    predicted_upcoming: list[dict]
