from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScenarioType(str, Enum):
    ONE_TIME_EXPENSE = "one_time_expense"
    RECURRING_EXPENSE = "recurring_expense"
    ADDITIONAL_SAVINGS = "additional_savings"


class ScenarioFrequency(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ProjectionStatus(str, Enum):
    PROJECTED = "projected"
    COMPLETED = "completed"
    INSUFFICIENT_PLAN = "insufficient_plan"
    UNREACHABLE = "unreachable"
    DEADLINE_PASSED = "deadline_passed"
    UNSUPPORTED_HORIZON = "unsupported_horizon"
    UNSUPPORTED = "unsupported"


class GoalSimulationScenario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_type: ScenarioType
    amount: int = Field(ge=0)
    frequency: Optional[ScenarioFrequency] = None

    @model_validator(mode="after")
    def validate_frequency(self) -> "GoalSimulationScenario":
        if self.scenario_type == ScenarioType.RECURRING_EXPENSE and self.frequency is None:
            raise ValueError("frequency is required for recurring_expense scenarios")
        if self.scenario_type != ScenarioType.RECURRING_EXPENSE and self.frequency is not None:
            raise ValueError("frequency is only supported for recurring_expense scenarios")
        return self


class GoalSimulationGoal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    current_amount: int = Field(ge=0)
    target_amount: int = Field(gt=0)
    target_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_progress(self) -> "GoalSimulationGoal":
        if self.current_amount > self.target_amount:
            raise ValueError("current_amount must not exceed target_amount")
        return self


class GoalSimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_goal_id: str = Field(min_length=1, max_length=36)
    scenario: GoalSimulationScenario
    target_date: Optional[date] = None


class TrajectoryPoint(BaseModel):
    date: date
    amount: int = Field(ge=0)


class ProjectionOutcome(BaseModel):
    status: ProjectionStatus
    monthly_contribution: int = Field(ge=0)
    projected_completion_date: Optional[date] = None


class ScenarioOutcome(ProjectionOutcome):
    scenario_type: ScenarioType
    amount: int = Field(ge=0)
    frequency: Optional[ScenarioFrequency] = None
    monthly_equivalent: Optional[int] = Field(default=None, ge=0)


class SimulationImpact(BaseModel):
    completion_date_change_days: Optional[int] = None
    delay_months: int = Field(default=0, ge=0)
    acceleration_months: int = Field(default=0, ge=0)
    amount_short: Optional[int] = Field(default=None, ge=0)
    unfunded_against_planned_savings: int = Field(default=0, ge=0)


class TargetDateAssessment(BaseModel):
    deadline: date
    achievable: bool
    projected_completion_date: Optional[date] = None
    shortfall: int = Field(ge=0)
    required_additional_monthly_savings: Optional[int] = Field(default=None, ge=0)


class GoalSimulationResult(BaseModel):
    schema_version: int = 1
    status: ProjectionStatus
    goal: GoalSimulationGoal
    baseline: ProjectionOutcome
    scenario: ScenarioOutcome
    impact: SimulationImpact
    target_date_assessment: Optional[TargetDateAssessment] = None
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    trajectory: list[TrajectoryPoint] = Field(default_factory=list)