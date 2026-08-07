import pytest

from app.services.budget_service import BudgetService


class FakeScalars:
    def __init__(self, first_item):
        self._first_item = first_item

    def first(self):
        return self._first_item


class FakeResult:
    def __init__(self, first_item):
        self._first_item = first_item

    def scalars(self):
        return FakeScalars(self._first_item)


class FakeSession:
    def __init__(self, budget):
        self.budget = budget

    async def execute(self, *_args, **_kwargs):
        return FakeResult(self.budget)


@pytest.mark.asyncio
async def test_detects_trajectory_discrepancies_and_rebalances():
    budget = type(
        "Budget",
        (),
        {
            "id": "budget-1",
            "user_id": "user-1",
            "month": 8,
            "year": 2026,
            "total_income": 5000,
            "planned_savings": 1000,
            "status": "active",
            "allocations": [
                type("Allocation", (), {"id": "a1", "budget_id": "budget-1", "category_id": "dining", "allocated_amount": 300, "created_at": None, "updated_at": None})(),
                type("Allocation", (), {"id": "a2", "budget_id": "budget-1", "category_id": "entertainment", "allocated_amount": 200, "created_at": None, "updated_at": None})(),
                type("Allocation", (), {"id": "a3", "budget_id": "budget-1", "category_id": "housing", "allocated_amount": 2400, "created_at": None, "updated_at": None})(),
            ],
            "created_at": None,
            "updated_at": None,
        },
    )()

    service = BudgetService(FakeSession(budget))
    result = await service.analyze_dynamic_adjustments(
        "user-1",
        8,
        2026,
        {
            "days_elapsed": 15,
            "days_in_month": 30,
            "actual_spending": [
                {"category_id": "dining", "amount": 360},
                {"category_id": "entertainment", "amount": 90},
            ],
            "recent_behavior": {"overspend_streak": 2},
        },
    )

    assert result["discrepancies"]
    assert any(item["category_id"] == "dining" for item in result["discrepancies"])
    assert result["adjustments"]
    assert any(item["category_id"] == "entertainment" for item in result["adjustments"])
