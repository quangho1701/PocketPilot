from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base, FinancialMemory, MemoryType, User, UserProfile
from app.services.budget_service import BudgetService
from app.schemas.setup import FinancialSetupPayload


async def session_with_setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)()
    session.add(User(id="plan-user", email="plan@example.com", name="Plan"))
    session.add(UserProfile(user_id="plan-user", monthly_income=10_000_000, income_frequency="monthly", savings_priority="balanced", currency="VND"))
    session.add(FinancialMemory(user_id="plan-user", memory_type=MemoryType.GOAL, title="Japan Vacation", content="Save for Japan", amount=30_000_000, category="travel", details={"goal_type":"travel","target_amount":30_000_000,"current_amount":2_000_000,"target_date":"2027-03-01"}, source="financial_setup", source_id="primary_goal"))
    await session.flush()
    return session, engine


def test_setup_contract_accepts_multiple_or_no_goals():
    base = {"currency":"VND","monthly_income":10_000_000,"income_frequency":"monthly","recurring_expenses":[],"savings_priority":"balanced","focus_categories":[],"financial_situation_notes":None,"setup_version":1}
    empty = FinancialSetupPayload.model_validate({**base, "goals":[], "primary_goal_id":None})
    assert empty.primary_goal is None
    multiple = FinancialSetupPayload.model_validate({**base, "goals":[
        {"id":"trip","goal_type":"travel","name":"Japan","target_amount":30_000_000,"current_amount":0,"target_date":None},
        {"id":"laptop","goal_type":"other","name":"Laptop","target_amount":20_000_000,"current_amount":1_000_000,"target_date":None}], "primary_goal_id":"laptop"})
    assert len(multiple.goals) == 2
    assert multiple.primary_goal.name == "Laptop"


@pytest.mark.asyncio
async def test_draft_goal_confirmation_and_goal_management():
    session, engine = await session_with_setup()
    try:
        service = BudgetService(session)
        drafts = await service.get_draft_goals("plan-user")
        assert [goal["name"] for goal in drafts] == ["Japan Vacation"]
        confirmed = await service.confirm_draft_goals("plan-user", drafts)
        assert len(confirmed) == 1
        assert await service.get_draft_goals("plan-user") == []
        added = await service.create_plan_goal("plan-user", {"name":"New Laptop","target_amount":20_000_000,"current_amount":0,"target_date":None,"goal_type":"other"})
        changed = await service.update_plan_goal("plan-user", added["id"], {"target_amount":22_000_000})
        assert changed["target_amount"] == 22_000_000
    finally:
        await session.close(); await engine.dispose()


@pytest.mark.asyncio
async def test_active_category_edit_and_future_default():
    session, engine = await session_with_setup()
    try:
        service = BudgetService(session)
        await service.ensure_default_categories()
        category = (await service.list_categories("plan-user"))[0]
        draft = await service.create_budget("plan-user", {"month":9,"year":2026,"total_income":10_000_000,"planned_savings":2_000_000,"status":"draft","allocations":[{"category_id":category.id,"allocated_amount":8_000_000}]})
        active = await service.approve_budget("plan-user", draft["id"])
        allocation = active["allocations"][0]
        new_amount = max(allocation["allocated_amount"] - 100_000, 0)
        updated = await service.update_category_allocation("plan-user", active["id"], allocation["category_id"], new_amount, True)
        assert next(row for row in updated["allocations"] if row["category_id"] == allocation["category_id"])["allocated_amount"] == new_amount
        detail = await service.get_category_detail("plan-user", active["id"], allocation["category_id"])
        assert detail["apply_to_future"] is True
        assert detail["allocation"]["allocated_amount"] == new_amount
        future = await service.generate_budget_proposal("plan-user", 10, 2026, "50_30_20")
        preferred = next(row for row in future["allocations"] if row["category_id"] == allocation["category_id"])
        assert preferred["allocated_amount"] == new_amount
    finally:
        await session.close(); await engine.dispose()
