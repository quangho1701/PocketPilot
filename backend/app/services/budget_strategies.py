from __future__ import annotations

from abc import ABC, abstractmethod


class BudgetProposal(ABC):
    """Base contract for deterministic budget strategies."""

    @abstractmethod
    async def generate(self, context: dict) -> dict:
        raise NotImplementedError


class FiftyThirtyTwentyStrategy(BudgetProposal):
    async def generate(self, context: dict) -> dict:
        income = float(context.get("total_income", 0.0))
        needs = income * 0.5
        wants = income * 0.3
        savings = income * 0.2

        return {
            "strategy": "50_30_20",
            "total_income": income,
            "planned_savings": round(savings, 2),
            "allocations": [
                {"category_id": "needs", "amount": round(needs, 2)},
                {"category_id": "wants", "amount": round(wants, 2)},
            ],
        }


class ZeroBasedStrategy(BudgetProposal):
    async def generate(self, context: dict) -> dict:
        income = float(context.get("total_income", 0.0))
        planned_savings = float(context.get("planned_savings", 0.0))
        discretionary = max(income - planned_savings, 0.0)

        return {
            "strategy": "zero_based",
            "total_income": income,
            "planned_savings": round(planned_savings, 2),
            "allocations": [
                {"category_id": "essentials", "amount": round(discretionary, 2)},
            ],
        }


class CustomStrategy(BudgetProposal):
    async def generate(self, context: dict) -> dict:
        allocations = context.get("allocations", [])
        return {
            "strategy": "custom",
            "total_income": float(context.get("total_income", 0.0)),
            "planned_savings": float(context.get("planned_savings", 0.0)),
            "allocations": [
                {"category_id": item.get("category_id", "custom"), "amount": float(item.get("amount", 0.0))}
                for item in allocations
            ],
        }
