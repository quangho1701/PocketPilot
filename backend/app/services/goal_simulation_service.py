from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.financial_memory import FinancialMemory, MemoryType
from app.schemas.goal_simulation import (
    GoalSimulationGoal,
    GoalSimulationRequest,
    GoalSimulationResult,
)
from app.services.goal_simulation_calculations import simulate_goal


class GoalSimulationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def simulate(
        self,
        user_id: str,
        request: GoalSimulationRequest,
        *,
        as_of_date: date | None = None,
    ) -> GoalSimulationResult:
        projection_date = as_of_date or date.today()
        goal_memory = await self._get_active_goal(user_id, request.target_goal_id)
        budget = await self._get_active_budget(user_id, projection_date)
        goal = self._to_goal(goal_memory)

        result = simulate_goal(
            goal=goal,
            baseline_monthly_contribution=self._as_vnd_amount(
                budget.planned_savings, "planned_savings"
            ),
            scenario=request.scenario,
            as_of_date=projection_date,
            deadline=request.target_date,
        )
        result.assumptions.extend(
            [
                f"Uses planned savings from the active budget for {projection_date:%m/%Y}.",
                "Uses the saved goal's current progress.",
            ]
        )
        return result

    async def _get_active_goal(self, user_id: str, goal_id: str) -> FinancialMemory:
        result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.id == goal_id,
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.GOAL,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        goal = result.scalar_one_or_none()
        if goal is None:
            raise ValueError("active goal not found")

        status = str((goal.details or {}).get("status", "active")).lower()
        if status != "active":
            raise ValueError("goal is not active")
        return goal

    async def _get_active_budget(self, user_id: str, projection_date: date) -> Budget:
        result = await self.db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                Budget.month == projection_date.month,
                Budget.year == projection_date.year,
                Budget.status == "active",
            )
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            raise ValueError("active budget not found for the current month")
        return budget

    def _to_goal(self, memory: FinancialMemory) -> GoalSimulationGoal:
        details = memory.details or {}
        return GoalSimulationGoal(
            id=memory.id,
            title=str(details.get("name", memory.title)),
            current_amount=self._as_vnd_amount(details.get("current_amount", 0), "current_amount"),
            target_amount=self._as_vnd_amount(
                details.get("target_amount", memory.amount), "target_amount"
            ),
            target_date=details.get("target_date"),
        )

    @staticmethod
    def _as_vnd_amount(value: object, field_name: str) -> int:
        try:
            amount = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{field_name} must be a valid USD amount") from exc
        if amount < 0 or not amount.is_integer():
            raise ValueError(f"{field_name} must be a non-negative whole USD amount")
        return int(amount)
