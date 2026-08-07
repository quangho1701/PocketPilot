from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.user_decision import DecisionType


# --- Request schemas ---


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: Optional[str] = None


class MessageDecisionRequest(BaseModel):
    user_decision: DecisionType


# --- Response schemas ---


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    recommendation: Optional[DecisionType]
    reasoning: Optional[str]
    item_description: Optional[str]
    amount: Optional[float]
    category: Optional[str]
    decision_id: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatResponse(BaseModel):
    conversation_id: str
    message: ChatMessageResponse


class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
