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


class GoalSetup(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    goal_type: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    target_amount: PositiveVND
    current_amount: NonNegativeVND = 0
    target_date: Optional[date] = None
    id: Optional[str] = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_progress(self) -> GoalSetup:
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
    goals: list[GoalSetup] = Field(default_factory=list, max_length=50)
    primary_goal_id: Optional[str] = Field(default=None, max_length=80)
    savings_priority: Literal["minimal", "balanced", "aggressive"] = "balanced"
    focus_categories: list[str] = Field(default_factory=list, max_length=50)
    financial_situation_notes: Optional[str] = Field(default=None, max_length=2000)
    setup_version: Literal[1] = 1

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_primary_goal(cls, value):
        if isinstance(value, dict) and "goals" not in value and value.get("primary_goal"):
            value = dict(value)
            legacy = dict(value.pop("primary_goal"))
            legacy.setdefault("id", "primary_goal")
            value["goals"] = [legacy]
            value["primary_goal_id"] = legacy["id"]
        return value

    @model_validator(mode="after")
    def validate_primary_goal(self):
        ids = [goal.id for goal in self.goals if goal.id]
        if len(ids) != len(set(ids)):
            raise ValueError("goal ids must be unique")
        if self.primary_goal_id and self.primary_goal_id not in ids:
            raise ValueError("primary_goal_id must reference a goal")
        if self.goals and not self.primary_goal_id:
            self.primary_goal_id = self.goals[0].id
        return self


    @property
    def primary_goal(self) -> Optional[GoalSetup]:
        if not self.goals:
            return None
        return next((goal for goal in self.goals if goal.id == self.primary_goal_id), self.goals[0])

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


# Compatibility export for integrations that imported the former singular type.
PrimaryGoalSetup = GoalSetup


class FinancialSetupResponse(BaseModel):
    status: Literal["not_started", "completed"]
    completed_at: Optional[datetime] = None
    data: Optional[FinancialSetupPayload] = None
