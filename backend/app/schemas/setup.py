from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)


PositiveVND = Annotated[StrictInt, Field(gt=0)]
NonNegativeVND = Annotated[StrictInt, Field(ge=0)]


class RecurringExpenseSetup(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=100)
    monthly_amount: PositiveVND


class PrimaryGoalSetup(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    goal_type: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    target_amount: PositiveVND
    current_amount: NonNegativeVND = 0
    target_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_progress(self) -> PrimaryGoalSetup:
        if self.current_amount > self.target_amount:
            raise ValueError("current_amount must not exceed target_amount")
        return self


class FinancialSetupPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    currency: Literal["VND"]
    monthly_income: PositiveVND
    income_frequency: Literal["weekly", "biweekly", "monthly"]
    recurring_expenses: list[RecurringExpenseSetup] = Field(
        default_factory=list, max_length=50
    )
    primary_goal: PrimaryGoalSetup
    savings_priority: Literal["minimal", "balanced", "aggressive"] = "balanced"
    focus_categories: list[str] = Field(default_factory=list, max_length=50)
    financial_situation_notes: Optional[str] = Field(default=None, max_length=2000)
    setup_version: Literal[1] = 1

    @field_validator("focus_categories")
    @classmethod
    def normalize_focus_categories(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values:
            item = value.strip()
            if not item:
                raise ValueError("focus categories must not be blank")
            if len(item) > 100:
                raise ValueError("focus categories must be at most 100 characters")
            if item not in seen:
                normalized.append(item)
                seen.add(item)
        return normalized

    @field_validator("financial_situation_notes")
    @classmethod
    def empty_notes_are_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None


class FinancialSetupResponse(BaseModel):
    status: Literal["not_started", "completed"]
    completed_at: Optional[datetime] = None
    data: Optional[FinancialSetupPayload] = None
