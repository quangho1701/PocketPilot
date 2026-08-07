# Owner: Ha
# Business logic for Personalized Budget Planning + Goal Simulation
from __future__ import annotations

import json
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.budget_allocation import BudgetAllocation
from app.services.budget_strategies import (
    CustomStrategy,
    FiftyThirtyTwentyStrategy,
    ZeroBasedStrategy,
)
from app.utils.bedrock import bedrock_client


def _calculate_goal_savings(goals: list[dict], target_income: float) -> float:
    if not goals:
        return 0.0

    contribution = 0.0
    for goal in goals:
        if goal.get("status") == "completed":
            continue

        target_amount = float(goal.get("target_amount", 0.0))
        current_amount = float(goal.get("current_amount", 0.0))
        remaining = max(target_amount - current_amount, 0.0)
        if remaining <= 0:
            continue

        priority = int(goal.get("priority", 99))
        multiplier = 1.0 if priority <= 2 else 0.5
        monthly_need = remaining / 12.0
        contribution += monthly_need * multiplier

    return min(contribution, target_income * 0.5)


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_budget(self, user_id: str) -> dict:
        query = (
            select(Budget)
            .where(Budget.user_id == user_id)
            .order_by(Budget.year.desc(), Budget.month.desc())
        )
        result = await self.db.execute(query)
        budget = result.scalars().first()
        if not budget:
            return {}
        return self._serialize_budget(budget)

    async def create_budget(self, user_id: str, data: dict) -> dict:
        existing_query = (
            select(Budget)
            .where(
                Budget.user_id == user_id,
                Budget.month == int(data["month"]),
                Budget.year == int(data["year"]),
            )
            .order_by(Budget.created_at.desc())
        )
        existing_budget = None
        if hasattr(self.db, "execute"):
            existing_result = await self.db.execute(existing_query)
            existing_budget = existing_result.scalars().first()

        if existing_budget is None:
            budget = Budget(
                user_id=user_id,
                month=int(data["month"]),
                year=int(data["year"]),
                total_income=float(data.get("total_income", 0.0)),
                planned_savings=float(data.get("planned_savings", 0.0)),
                status=str(data.get("status", "draft")),
            )
        else:
            budget = existing_budget
            budget.total_income = float(data.get("total_income", budget.total_income))
            budget.planned_savings = float(data.get("planned_savings", budget.planned_savings))
            budget.status = str(data.get("status", budget.status))

        for allocation in list(budget.allocations):
            await self.db.delete(allocation)

        budget.allocations.clear()

        allocations_payload = data.get("allocations", [])
        for allocation_data in allocations_payload:
            allocation = BudgetAllocation(
                category_id=str(allocation_data["category_id"]),
                allocated_amount=float(allocation_data.get("allocated_amount", 0.0)),
            )
            budget.allocations.append(allocation)
            await self.db.add(allocation)

        if existing_budget is None:
            await self.db.add(budget)
        await self.db.flush()
        await self.db.commit()
        return self._serialize_budget(budget)

    async def generate_proposal(self, user_id: str, strategy_name: str, context: dict) -> dict:
        strategies = {
            "50_30_20": FiftyThirtyTwentyStrategy(),
            "zero_based": ZeroBasedStrategy(),
            "custom": CustomStrategy(),
        }

        strategy = strategies.get(strategy_name, FiftyThirtyTwentyStrategy())
        proposal = await strategy.generate(context)
        goals = context.get("goals", [])
        goal_savings = _calculate_goal_savings(goals, float(context.get("total_income", 0.0)))

        proposal["user_id"] = user_id
        proposal["goals"] = goals
        proposal["planned_savings"] = round(max(proposal.get("planned_savings", 0.0), goal_savings), 2)
        return proposal

    async def generate_ai_personalized_proposal(self, user_id: str, context: dict) -> dict:
        prompt = self._build_ai_prompt(context)
        try:
            raw = await bedrock_client.invoke_with_prompt(prompt, temperature=0.2)
            parsed = self._parse_ai_response(raw)
            if parsed:
                parsed["user_id"] = user_id
                return parsed
        except Exception:
            pass

        fallback = await self.generate_proposal(user_id, "50_30_20", context)
        fallback["reasoning"] = "AI unavailable; used deterministic fallback."
        fallback["confidence"] = 0.4
        return fallback

    def _build_ai_prompt(self, context: dict) -> str:
        recent_spending = context.get("recent_spending", [])
        goals = context.get("goals", [])
        preferences = context.get("preferences", {})
        insights = context.get("insights", [])
        income = float(context.get("total_income", 0.0))

        return (
            "You are generating a JSON budget proposal. "
            "Return strict JSON with keys: total_income, planned_savings, allocations, strategy, reasoning, confidence. "
            f"Income: {income}. Recent spending: {recent_spending}. "
            f"Goals: {goals}. Preferences: {preferences}. Insights: {insights}. "
            "Use only the provided context and keep allocations within the income after planned savings."
        )

    def _parse_ai_response(self, raw: str) -> dict | None:
        try:
            text = raw.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\s*", "", text)
                text = re.sub(r"\s*```$", "", text)
            payload = json.loads(text)
            if not isinstance(payload, dict):
                return None
            return {
                "total_income": float(payload.get("total_income", 0.0)),
                "planned_savings": float(payload.get("planned_savings", 0.0)),
                "allocations": [
                    {
                        "category_id": item.get("category_id", "misc"),
                        "amount": float(item.get("amount", 0.0)),
                        "reason": item.get("reason"),
                    }
                    for item in payload.get("allocations", [])
                ],
                "strategy": str(payload.get("strategy", "ai_personalized")),
                "reasoning": str(payload.get("reasoning", "")),
                "confidence": float(payload.get("confidence", 0.5)),
            }
        except Exception:
            return None

    async def approve_proposal(self, user_id: str, proposal: dict, month: int, year: int) -> dict:
        valid, errors = await self.validate_proposal(proposal)
        if not valid:
            raise ValueError("; ".join(errors))

        payload = {
            "month": month,
            "year": year,
            "total_income": proposal.get("total_income", 0.0),
            "planned_savings": proposal.get("planned_savings", 0.0),
            "status": "active",
            "allocations": [
                {
                    "category_id": item.get("category_id", "misc"),
                    "allocated_amount": item.get("amount", 0.0),
                }
                for item in proposal.get("allocations", [])
            ],
        }
        return await self.create_budget(user_id, payload)

    async def validate_proposal(self, proposal: dict) -> tuple[bool, list[str]]:
        errors: list[str] = []
        total_income = float(proposal.get("total_income", 0.0))
        planned_savings = float(proposal.get("planned_savings", 0.0))
        allocations = proposal.get("allocations", [])

        if total_income < 0:
            errors.append("total income cannot be negative")
        if planned_savings < 0:
            errors.append("planned savings cannot be negative")

        allocation_total = sum(float(item.get("amount", 0.0)) for item in allocations)
        if allocation_total < 0:
            errors.append("allocation total cannot be negative")
        if allocation_total > total_income:
            errors.append("allocation total exceeds income")

        if planned_savings > total_income:
            errors.append("planned savings exceed income")

        expected_available = total_income - planned_savings
        if abs(expected_available - allocation_total) > 0.01:
            errors.append("allocation total does not match available income")

        return len(errors) == 0, errors

    async def analyze_dynamic_adjustments(self, user_id: str, month: int, year: int, context: dict) -> dict:
        budget = await self.get_budget_for_month(user_id, month, year)
        if not budget:
            return {"user_id": user_id, "month": month, "year": year, "discrepancies": [], "adjustments": []}

        days_elapsed = max(int(context.get("days_elapsed", 0)), 0)
        days_in_month = max(int(context.get("days_in_month", 30)), 1)
        actual_spending = context.get("actual_spending", [])
        recent_behavior = context.get("recent_behavior", {})
        overspend_streak = max(int(recent_behavior.get("overspend_streak", 0)), 0)

        discrepancies: list[dict] = []
        adjustments: list[dict] = []
        allocations = list(budget.get("allocations", []))

        for allocation in allocations:
            category_id = str(allocation.get("category_id", "misc"))
            allocated_amount = float(allocation.get("allocated_amount", 0.0))
            actual_amount = 0.0
            for entry in actual_spending:
                if str(entry.get("category_id", "misc")) == category_id:
                    actual_amount = float(entry.get("amount", 0.0))
                    break

            expected_rate = allocated_amount / max(days_in_month, 1)
            expected_so_far = expected_rate * min(days_elapsed, days_in_month)
            delta = actual_amount - expected_so_far
            remaining_allocation = max(allocated_amount - actual_amount, 0.0)
            is_material = delta > max(allocated_amount * 0.1, 50.0)
            is_repeated = overspend_streak >= 2 and actual_amount > expected_so_far
            is_large = actual_amount > max(allocated_amount * 0.5, 150.0)
            if is_material or is_repeated or is_large:
                discrepancies.append(
                    {
                        "category_id": category_id,
                        "allocated_amount": round(allocated_amount, 2),
                        "actual_amount": round(actual_amount, 2),
                        "expected_so_far": round(expected_so_far, 2),
                        "delta": round(delta, 2),
                        "remaining_allocation": round(remaining_allocation, 2),
                        "reason": "trajectory ahead of plan" if is_material else "repeated overspending" if is_repeated else "large expense spike",
                    }
                )

                source_candidates = [
                    item
                    for item in allocations
                    if str(item.get("category_id", "misc")) != category_id and float(item.get("allocated_amount", 0.0)) > 0
                ]
                if source_candidates:
                    source = source_candidates[0]
                    source_category = str(source.get("category_id", "misc"))
                    source_remaining = max(float(source.get("allocated_amount", 0.0)) - 0.0, 0.0)
                    adjustment_amount = min(source_remaining, max(abs(delta) * 0.5, 25.0))
                    if adjustment_amount > 0:
                        adjustments.append(
                            {
                                "category_id": source_category,
                                "reduction_amount": round(adjustment_amount, 2),
                                "from_category": source_category,
                                "to_category": "savings",
                                "reason": "rebalance to protect savings goal",
                            }
                        )

        return {
            "user_id": user_id,
            "month": month,
            "year": year,
            "discrepancies": discrepancies,
            "adjustments": adjustments,
        }

    async def get_budget_for_month(self, user_id: str, month: int, year: int) -> dict | None:
        query = (
            select(Budget)
            .where(Budget.user_id == user_id, Budget.month == month, Budget.year == year)
            .order_by(Budget.year.desc(), Budget.month.desc())
        )
        result = await self.db.execute(query)
        budget = result.scalars().first()
        if not budget:
            return None
        return self._serialize_budget(budget)

    async def simulate_goal(self, user_id: str, scenario: dict) -> dict:
        target_amount = float(scenario.get("target_amount", 0.0))
        monthly_contribution = float(scenario.get("monthly_contribution", 0.0))
        months = int(scenario.get("months", 1))
        current_savings = float(scenario.get("current_savings", 0.0))

        projected_balance = current_savings + (monthly_contribution * months)
        remaining = max(target_amount - projected_balance, 0.0)
        required_months = 0
        if monthly_contribution > 0:
            required_months = int((max(target_amount - current_savings, 0.0) + monthly_contribution - 1) // monthly_contribution)

        return {
            "user_id": user_id,
            "target_amount": target_amount,
            "monthly_contribution": monthly_contribution,
            "months": months,
            "projected_balance": projected_balance,
            "remaining": remaining,
            "required_months": max(required_months, 0),
        }

    def _serialize_budget(self, budget: Budget) -> dict:
        return {
            "id": budget.id,
            "user_id": budget.user_id,
            "month": budget.month,
            "year": budget.year,
            "total_income": budget.total_income,
            "planned_savings": budget.planned_savings,
            "status": budget.status,
            "allocations": [
                {
                    "id": allocation.id,
                    "budget_id": allocation.budget_id,
                    "category_id": allocation.category_id,
                    "allocated_amount": allocation.allocated_amount,
                    "created_at": allocation.created_at,
                    "updated_at": allocation.updated_at,
                }
                for allocation in budget.allocations
            ],
            "created_at": budget.created_at,
            "updated_at": budget.updated_at,
        }
