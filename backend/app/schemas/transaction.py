from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, StrictInt


class TransactionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    amount: StrictInt = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=255)
    merchant: str | None = Field(default=None, max_length=255)
    date: date


class TransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: int
    category: str
    description: str
    merchant: str | None
    date: date
    created_at: datetime

