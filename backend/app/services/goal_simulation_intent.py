from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_memory import FinancialMemory, MemoryType
from app.schemas.goal_simulation import (
    GoalSimulationRequest,
    GoalSimulationResult,
    GoalSimulationScenario,
    ScenarioFrequency,
    ScenarioType,
)

_AMOUNT_PATTERN = re.compile(r"(?:\$|₫)?\s*(\d[\d,._]*)\s*(?:VND|₫)?", re.IGNORECASE)
_DATE_PATTERN = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_RECURRING_PATTERN = re.compile(r"\b(?:every|per|a)\s+(week|month)\b", re.IGNORECASE)
_SAVINGS_PATTERN = re.compile(r"\b(?:save|saving|set aside)\b", re.IGNORECASE)
_EXPENSE_PATTERN = re.compile(r"\b(?:spend|spending|buy|purchase)\b", re.IGNORECASE)
_OFFSET_PATTERN = re.compile(r"\b(?:offset that|make up for that|how much more.*save)\b", re.IGNORECASE)


@dataclass(frozen=True)
class GoalSimulationIntent:
    scenario: GoalSimulationScenario | None
    target_date: date | None
    goal_id: str | None
    clarification: str | None = None

    @property
    def is_simulation(self) -> bool:
        return self.scenario is not None and self.goal_id is not None


class GoalSimulationIntentResolver:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def resolve(
        self,
        user_id: str,
        message: str,
        *,
        previous_simulation_input: dict | None = None,
        previous_simulation_result: dict | None = None,
    ) -> GoalSimulationIntent | None:
        previous_request = self._parse_previous_request(previous_simulation_input)
        if _OFFSET_PATTERN.search(message) and previous_request:
            return GoalSimulationIntent(
                scenario=previous_request.scenario,
                target_date=self._recovery_deadline(
                    previous_request, previous_simulation_result
                ),
                goal_id=previous_request.target_goal_id,
            )

        scenario, target_date, clarification = self._parse_scenario(message)
        if clarification:
            return GoalSimulationIntent(None, target_date, None, clarification)
        if scenario is None:
            return None

        goals = await self._get_active_goals(user_id)
        goal_id, goal_clarification = self._resolve_goal(message, goals)
        if previous_request and goal_id is None and goal_clarification == "Which goal would you like me to simulate?":
            goal_id = previous_request.target_goal_id
            goal_clarification = None
        return GoalSimulationIntent(
            scenario=scenario if goal_id else None,
            target_date=target_date,
            goal_id=goal_id,
            clarification=goal_clarification,
        )

    def _parse_scenario(
        self, message: str
    ) -> tuple[GoalSimulationScenario | None, date | None, str | None]:
        deadline_match = _DATE_PATTERN.search(message)
        deadline = date.fromisoformat(deadline_match.group(1)) if deadline_match else None
        amount_message = _DATE_PATTERN.sub("", message)
        amount_match = _AMOUNT_PATTERN.search(amount_message)
        if not amount_match:
            if _SAVINGS_PATTERN.search(message) or _EXPENSE_PATTERN.search(message):
                return None, None, "What amount would you like to simulate?"
            return None, None, None

        amount = int(re.sub(r"[,_ .]", "", amount_match.group(1)))
        if re.search(r"\bby\s+\w+\b", message, re.IGNORECASE) and deadline is None:
            return None, None, "Please provide the target deadline as a specific date, such as 2027-06-30."

        recurring_match = _RECURRING_PATTERN.search(message)
        if _SAVINGS_PATTERN.search(message):
            return (
                GoalSimulationScenario(
                    scenario_type=ScenarioType.ADDITIONAL_SAVINGS,
                    amount=amount,
                ),
                deadline,
                None,
            )
        if recurring_match and _EXPENSE_PATTERN.search(message):
            frequency = ScenarioFrequency(recurring_match.group(1).lower() + "ly")
            return (
                GoalSimulationScenario(
                    scenario_type=ScenarioType.RECURRING_EXPENSE,
                    amount=amount,
                    frequency=frequency,
                ),
                deadline,
                None,
            )
        if _EXPENSE_PATTERN.search(message):
            return (
                GoalSimulationScenario(
                    scenario_type=ScenarioType.ONE_TIME_EXPENSE,
                    amount=amount,
                ),
                deadline,
                None,
            )
        return None, deadline, None

    @staticmethod
    def _parse_previous_request(data: dict | None) -> GoalSimulationRequest | None:
        if data is None:
            return None
        try:
            return GoalSimulationRequest.model_validate(data)
        except ValueError:
            return None

    @staticmethod
    def _recovery_deadline(
        previous_request: GoalSimulationRequest, previous_result: dict | None
    ) -> date | None:
        if previous_request.target_date:
            return previous_request.target_date
        if previous_result is None:
            return None
        try:
            result = GoalSimulationResult.model_validate(previous_result)
        except ValueError:
            return None
        return result.baseline.projected_completion_date

    async def _get_active_goals(self, user_id: str) -> list[FinancialMemory]:
        result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.GOAL,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        return [
            goal
            for goal in result.scalars().all()
            if str((goal.details or {}).get("status", "active")).lower() == "active"
        ]

    @staticmethod
    def _resolve_goal(message: str, goals: list[FinancialMemory]) -> tuple[str | None, str | None]:
        normalized_message = re.sub(r"[^a-z0-9]+", " ", message.lower()).strip()
        matches = []
        for goal in goals:
            name = str((goal.details or {}).get("name", goal.title))
            normalized_name = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
            if normalized_name and normalized_name in normalized_message:
                matches.append(goal)

        if len(matches) == 1:
            return matches[0].id, None
        if len(matches) > 1:
            return None, "Which goal would you like me to simulate?"
        if len(goals) == 1:
            return goals[0].id, None
        if not goals:
            return None, "I could not find an active financial goal to simulate."
        return None, "Which goal would you like me to simulate?"