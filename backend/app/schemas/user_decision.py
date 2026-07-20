from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.user_decision import DecisionOutcome, DecisionType


class DecisionRecord(BaseModel):
    """Sent by the assistant service when a user makes a buy/wait/skip decision."""

    item_description: str
    amount: float
    category: str
    ai_recommendation: DecisionType
    ai_reasoning: str
    user_decision: DecisionType
    context_snapshot: Optional[dict] = None


class DecisionFeedback(BaseModel):
    was_helpful: bool
    user_feedback: Optional[str] = None


class DecisionResponse(BaseModel):
    id: str
    user_id: str
    item_description: str
    amount: float
    category: str
    ai_recommendation: DecisionType
    user_decision: DecisionType
    outcome: DecisionOutcome
    was_helpful: Optional[bool]
    created_at: datetime

    model_config = {"from_attributes": True}


class LearningInsight(BaseModel):
    """Summary of what the learning engine has observed about the user."""

    total_decisions: int
    follow_rate: float
    category_preferences: dict
    behavioral_notes: list[str]
