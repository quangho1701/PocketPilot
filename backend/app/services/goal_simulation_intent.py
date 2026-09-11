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

_AMOUNT_PATTERN = re.compile(
    r"(?:\$|₫)?\s*(\d+(?:[.,]\d+)*)\s*(k|m|nghìn|ngàn|triệu|VND|₫)?",
    re.IGNORECASE,
)
_DATE_PATTERN = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_RECURRING_PATTERN = re.compile(r"\b(?:every|per|a)\s+(week|month)\b|mỗi\s+(tuần|tháng)", re.IGNORECASE)
_SAVINGS_PATTERN = re.compile(r"\b(?:save|saving|set aside)\b|để dành|tiết kiệm", re.IGNORECASE)
_EXPENSE_PATTERN = re.compile(r"\b(?:spend|spending|buy|purchase)\b|\bchi\b|\bmua\b", re.IGNORECASE)
_OFFSET_PATTERN = re.compile(r"\b(?:offset that|make up for that|how much more.*save)\b", re.IGNORECASE)
_SIMULATION_CONTEXT_PATTERN = re.compile(
    r"\b(?:if|what if|affect|impact|goal|target|reach|delay|future plan|scenario)\b"
    r"|nếu|mục tiêu|ảnh hưởng|tác động|thay đổi|chậm|bao giờ|khi nào|kế hoạch",
    re.IGNORECASE,
)


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
        if previous_request and goal_id is None and goal_clarification == "Bạn muốn mô phỏng mục tiêu nào?":
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
        if not _SIMULATION_CONTEXT_PATTERN.search(message):
            return None, None, None
        deadline_match = _DATE_PATTERN.search(message)
        deadline = date.fromisoformat(deadline_match.group(1)) if deadline_match else None
        amount_message = _DATE_PATTERN.sub("", message)
        amount_match = _AMOUNT_PATTERN.search(amount_message)
        if not amount_match:
            if _SAVINGS_PATTERN.search(message) or _EXPENSE_PATTERN.search(message):
                return None, None, "Bạn muốn mô phỏng số tiền bao nhiêu?"
            return None, None, None

        amount = self._parse_amount(amount_match.group(1), amount_match.group(2))
        if re.search(r"\bby\s+\w+\b", message, re.IGNORECASE) and deadline is None:
            return None, None, "Vui lòng nhập thời hạn cụ thể, ví dụ 2027-06-30."

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
            frequency_value = recurring_match.group(1) or recurring_match.group(2)
            frequency = ScenarioFrequency.WEEKLY if frequency_value.lower() == "tuần" else ScenarioFrequency.MONTHLY if frequency_value.lower() == "tháng" else ScenarioFrequency(frequency_value.lower() + "ly")
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
    def _parse_amount(raw_number: str, raw_suffix: str | None) -> int:
        suffix = (raw_suffix or "").lower()
        multiplier = 1
        if suffix in {"k", "nghìn", "ngàn"}:
            multiplier = 1_000
        elif suffix in {"m", "triệu"}:
            multiplier = 1_000_000

        if multiplier > 1:
            return int(round(float(raw_number.replace(",", ".")) * multiplier))
        if ("." in raw_number or "," in raw_number) and len(re.split(r"[.,]", raw_number)[-1]) == 3:
            return int(re.sub(r"[.,]", "", raw_number))
        return int(round(float(raw_number.replace(",", "."))))

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
            return None, "Bạn muốn mô phỏng mục tiêu nào?"
        if len(goals) == 1:
            return goals[0].id, None
        if not goals:
            return None, "Chưa có mục tiêu tài chính đang hoạt động để mô phỏng."
        return None, "Bạn muốn mô phỏng mục tiêu nào?"
