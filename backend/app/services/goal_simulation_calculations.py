from __future__ import annotations

import calendar
import math
from datetime import date, timedelta

from app.schemas.goal_simulation import (
    GoalSimulationGoal,
    GoalSimulationResult,
    GoalSimulationScenario,
    ProjectionOutcome,
    ProjectionStatus,
    ScenarioFrequency,
    ScenarioOutcome,
    ScenarioType,
    SimulationImpact,
    TargetDateAssessment,
    TrajectoryPoint,
)

DEFAULT_PROJECTION_HORIZON_MONTHS = 60


def month_end(value: date) -> date:
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def first_contribution_date(as_of_date: date) -> date:
    current_month_end = month_end(as_of_date)
    if as_of_date < current_month_end:
        return current_month_end
    if as_of_date.month == 12:
        return date(as_of_date.year + 1, 1, 31)
    next_month = date(as_of_date.year, as_of_date.month + 1, 1)
    return month_end(next_month)


def contribution_dates(as_of_date: date, horizon_months: int) -> list[date]:
    if horizon_months < 1:
        raise ValueError("horizon_months must be at least 1")

    result: list[date] = []
    current = first_contribution_date(as_of_date)
    for _ in range(horizon_months):
        result.append(current)
        if current.month == 12:
            current = date(current.year + 1, 1, 31)
        else:
            current = month_end(date(current.year, current.month + 1, 1))
    return result


def normalize_monthly_equivalent(amount: int, frequency: ScenarioFrequency) -> int:
    if frequency == ScenarioFrequency.MONTHLY:
        return amount
    return math.ceil(amount * 52 / 12)


def _project(
    goal: GoalSimulationGoal,
    contribution_amounts: list[int],
    dates: list[date],
) -> tuple[ProjectionOutcome, list[TrajectoryPoint]]:
    if goal.current_amount >= goal.target_amount:
        return (
            ProjectionOutcome(
                status=ProjectionStatus.COMPLETED,
                monthly_contribution=0,
                projected_completion_date=None,
            ),
            [TrajectoryPoint(date=dates[0], amount=goal.current_amount)],
        )

    monthly_contribution = contribution_amounts[-1] if contribution_amounts else 0
    if max(contribution_amounts, default=0) <= 0:
        return (
            ProjectionOutcome(
                status=ProjectionStatus.INSUFFICIENT_PLAN,
                monthly_contribution=max(monthly_contribution, 0),
            ),
            [],
        )

    balance = goal.current_amount
    trajectory: list[TrajectoryPoint] = []
    for contribution_date, contribution in zip(dates, contribution_amounts):
        balance += max(contribution, 0)
        trajectory.append(TrajectoryPoint(date=contribution_date, amount=balance))
        if balance >= goal.target_amount:
            return (
                ProjectionOutcome(
                    status=ProjectionStatus.PROJECTED,
                    monthly_contribution=max(monthly_contribution, 0),
                    projected_completion_date=contribution_date,
                ),
                trajectory,
            )

    return (
        ProjectionOutcome(
            status=ProjectionStatus.UNSUPPORTED_HORIZON,
            monthly_contribution=max(monthly_contribution, 0),
        ),
        trajectory,
    )


def _deadline_assessment(
    goal: GoalSimulationGoal,
    contribution_amounts: list[int],
    dates: list[date],
    deadline: date,
    as_of_date: date,
    outcome: ProjectionOutcome,
) -> TargetDateAssessment:
    if deadline < as_of_date:
        return TargetDateAssessment(
            deadline=deadline,
            achievable=False,
            projected_completion_date=outcome.projected_completion_date,
            shortfall=max(goal.target_amount - goal.current_amount, 0),
        )

    applicable = [amount for contribution_date, amount in zip(dates, contribution_amounts) if contribution_date <= deadline]
    projected_amount = goal.current_amount + sum(max(amount, 0) for amount in applicable)
    shortfall = max(goal.target_amount - projected_amount, 0)
    period_count = len(applicable)
    required = math.ceil(shortfall / period_count) if shortfall > 0 and period_count else None
    return TargetDateAssessment(
        deadline=deadline,
        achievable=shortfall == 0,
        projected_completion_date=outcome.projected_completion_date,
        shortfall=shortfall,
        required_additional_monthly_savings=required,
    )


def _scenario_contributions(
    baseline_contribution: int,
    scenario: GoalSimulationScenario,
    horizon_months: int,
) -> tuple[list[int], int | None, int]:
    contributions = [baseline_contribution] * horizon_months
    monthly_equivalent: int | None = None
    unfunded = 0
    if scenario.scenario_type == ScenarioType.ONE_TIME_EXPENSE:
        contributions[0] = max(baseline_contribution - scenario.amount, 0)
        unfunded = max(scenario.amount - baseline_contribution, 0)
    elif scenario.scenario_type == ScenarioType.RECURRING_EXPENSE:
        if scenario.frequency is None:
            raise ValueError("recurring_expense scenarios require frequency")
        monthly_equivalent = normalize_monthly_equivalent(scenario.amount, scenario.frequency)
        contributions = [max(baseline_contribution - monthly_equivalent, 0)] * horizon_months
    elif scenario.scenario_type == ScenarioType.ADDITIONAL_SAVINGS:
        contributions = [baseline_contribution + scenario.amount] * horizon_months
    return contributions, monthly_equivalent, unfunded


def _month_distance(start: date, end: date) -> int:
    return abs((end.year - start.year) * 12 + end.month - start.month)


def simulate_goal(
    *,
    goal: GoalSimulationGoal,
    baseline_monthly_contribution: int,
    scenario: GoalSimulationScenario,
    as_of_date: date,
    deadline: date | None = None,
    horizon_months: int = DEFAULT_PROJECTION_HORIZON_MONTHS,
) -> GoalSimulationResult:
    if baseline_monthly_contribution < 0:
        raise ValueError("baseline_monthly_contribution cannot be negative")

    dates = contribution_dates(as_of_date, horizon_months)
    baseline_amounts = [baseline_monthly_contribution] * horizon_months
    scenario_amounts, monthly_equivalent, unfunded = _scenario_contributions(
        baseline_monthly_contribution, scenario, horizon_months
    )
    baseline, baseline_trajectory = _project(goal, baseline_amounts, dates)
    scenario_projection, scenario_trajectory = _project(goal, scenario_amounts, dates)
    scenario_outcome = ScenarioOutcome(
        **scenario_projection.model_dump(),
        scenario_type=scenario.scenario_type,
        amount=scenario.amount,
        frequency=scenario.frequency,
        monthly_equivalent=monthly_equivalent,
    )

    impact = SimulationImpact(unfunded_against_planned_savings=unfunded)
    if baseline.projected_completion_date and scenario_projection.projected_completion_date:
        impact.completion_date_change_days = (
            scenario_projection.projected_completion_date - baseline.projected_completion_date
        ).days
        months = _month_distance(
            baseline.projected_completion_date, scenario_projection.projected_completion_date
        )
        if impact.completion_date_change_days > 0:
            impact.delay_months = months
        elif impact.completion_date_change_days < 0:
            impact.acceleration_months = months

    effective_deadline = deadline or goal.target_date
    target_date_assessment = None
    if effective_deadline:
        target_date_assessment = _deadline_assessment(
            goal,
            scenario_amounts,
            dates,
            effective_deadline,
            as_of_date,
            scenario_projection,
        )
        impact.amount_short = target_date_assessment.shortfall

    warnings: list[str] = []
    if unfunded:
        warnings.append("The one-time expense exceeds this month's planned savings.")
    if scenario.scenario_type == ScenarioType.ADDITIONAL_SAVINGS and scenario.amount:
        warnings.append("Additional savings require a corresponding reduction in spending.")
    if scenario.scenario_type == ScenarioType.RECURRING_EXPENSE and monthly_equivalent:
        warnings.append("Weekly expenses are converted using 52 weeks per year.")

    return GoalSimulationResult(
        status=scenario_projection.status,
        goal=goal,
        baseline=baseline,
        scenario=scenario_outcome,
        impact=impact,
        target_date_assessment=target_date_assessment,
        assumptions=["Planned savings are added at the end of each month."],
        warnings=warnings,
        trajectory=scenario_trajectory or baseline_trajectory,
    )
