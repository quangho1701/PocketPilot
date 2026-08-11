from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base, Budget, BudgetAllocation, BudgetCategory, FinancialMemory, MemoryType, User, UserProfile
from app.schemas.budget import BudgetAllocationUpdate
from app.services.budget_service import BudgetService


async def _new_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    session = factory()
    return session, engine


async def _seed_user(session, user_id: str = "user-1"):
    session.add(User(id=user_id, email=f"{user_id}@example.com", name="User"))
    session.add(
        UserProfile(
            user_id=user_id,
            monthly_income=5000,
            income_frequency="monthly",
            savings_priority="balanced",
            currency="USD",
        )
    )
    await session.flush()


def _sum_allocations(budget: dict) -> float:
    return round(sum(float(item["allocated_amount"]) for item in budget["allocations"]), 2)


def test_budget_allocation_update_keeps_category_id_identifier():
    payload = BudgetAllocationUpdate.model_validate(
        {
            "category_id": "5f1fbf58-a436-4baa-87e0-ca2ea66cbf4a",
            "amount": 1250,
        }
    )
    dumped = payload.model_dump(exclude_none=True)

    assert dumped["category_id"] == "5f1fbf58-a436-4baa-87e0-ca2ea66cbf4a"
    assert "category_slug" not in dumped


@pytest.mark.asyncio
async def test_generate_and_approve_budget_lifecycle():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        draft = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="50_30_20",
        )
        assert draft["status"] == "draft"
        assert draft["budgeting_mode"] == "50_30_20"

        active = await service.approve_budget("user-1", draft["id"])
        assert active["status"] == "active"
        assert active["approved_at"] is not None

        replacement = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="zero_based",
        )
        approved_replacement = await service.approve_budget("user-1", replacement["id"])
        assert approved_replacement["status"] == "active"

        active_count = await session.scalar(
            select(func.count())
            .select_from(Budget)
            .where(
                Budget.user_id == "user-1",
                Budget.month == 8,
                Budget.year == 2026,
                Budget.status == "active",
            )
        )
        assert active_count == 1

        archived_count = await session.scalar(
            select(func.count())
            .select_from(Budget)
            .where(
                Budget.user_id == "user-1",
                Budget.month == 8,
                Budget.year == 2026,
                Budget.status == "archived",
            )
        )
        assert archived_count >= 1
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_budget_progress_is_calculated_from_transaction_memories():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        budget = await service.create_budget(
            "user-1",
            {
                "month": 8,
                "year": 2026,
                "total_income": 5000,
                "planned_savings": 1000,
                "status": "active",
                "budgeting_mode": "custom",
                "strategy_source": "manual_edit",
                "allocations": [
                    {"category_slug": "housing", "allocated_amount": 2500},
                    {"category_slug": "groceries", "allocated_amount": 900},
                    {"category_slug": "dining", "allocated_amount": 600},
                ],
            },
        )
        assert budget["status"] == "active"

        session.add_all(
            [
                FinancialMemory(
                    user_id="user-1",
                    memory_type=MemoryType.TRANSACTION,
                    title="Rent",
                    content="Rent payment",
                    amount=2400,
                    category="housing",
                    source="transaction",
                    created_at=datetime(2026, 8, 2, tzinfo=UTC),
                ),
                FinancialMemory(
                    user_id="user-1",
                    memory_type=MemoryType.TRANSACTION,
                    title="Market",
                    content="Groceries",
                    amount=300,
                    category="groceries",
                    source="transaction",
                    created_at=datetime(2026, 8, 9, tzinfo=UTC),
                ),
            ]
        )
        await session.flush()

        progress = await service.get_budget_progress("user-1", 8, 2026)
        assert progress["total_spent"] == 2700
        assert progress["total_allocated"] == 4000
        assert len(progress["categories"]) == 3
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_budget_rejects_invalid_income_allocation_balance():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        with pytest.raises(ValueError, match="allocation total does not match available income"):
            await service.create_budget(
                "user-1",
                {
                    "month": 8,
                    "year": 2026,
                    "total_income": 5000,
                    "planned_savings": 1000,
                    "status": "draft",
                    "budgeting_mode": "custom",
                    "strategy_source": "manual_edit",
                    "allocations": [
                        {"category_slug": "housing", "allocated_amount": 2000},
                        {"category_slug": "groceries", "allocated_amount": 1000},
                    ],
                },
            )
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_custom_category_can_be_created():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        category = await service.create_custom_category(
            "user-1",
            slug="coffee",
            name="Coffee",
            mapping_group="wants",
        )
        assert category.slug == "coffee"

        all_categories = await service.list_categories("user-1")
        assert any(item.slug == "coffee" for item in all_categories)
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_same_slug_allowed_for_different_users_but_not_same_user():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        await _seed_user(session, "user-2")
        service = BudgetService(session)

        first = await service.create_custom_category("user-1", "coffee", "Coffee", "wants")
        second = await service.create_custom_category("user-2", "coffee", "Coffee", "wants")

        assert first.slug == "coffee"
        assert second.slug == "coffee"
        assert first.user_id != second.user_id

        with pytest.raises(ValueError):
            await service.create_custom_category("user-1", "coffee", "Coffee 2", "wants")
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_same_name_allowed_for_different_users():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        await _seed_user(session, "user-2")
        service = BudgetService(session)

        first = await service.create_custom_category("user-1", "coffee", "Daily Drinks", "wants")
        second = await service.create_custom_category("user-2", "tea", "Daily Drinks", "wants")

        assert first.name == second.name
        assert first.slug != second.slug
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_invalid_mapping_group_is_rejected():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        with pytest.raises(ValueError):
            await service.create_custom_category("user-1", "crypto", "Crypto", "speculative")
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_default_category_slugs_remain_unique():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        await service.ensure_default_categories()
        await service.ensure_default_categories()

        rows = await session.execute(
            select(BudgetCategory.slug).where(BudgetCategory.is_default == True)  # noqa: E712
        )
        slugs = list(rows.scalars().all())
        assert len(slugs) == len(set(slugs))
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_budget_resolves_slug_to_category_uuid():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        budget = await service.create_budget(
            "user-1",
            {
                "month": 8,
                "year": 2026,
                "total_income": 5000,
                "planned_savings": 1000,
                "status": "draft",
                "budgeting_mode": "custom",
                "strategy_source": "manual_edit",
                "allocations": [
                    {"category_slug": "housing", "allocated_amount": 2500},
                    {"category_slug": "groceries", "allocated_amount": 1500},
                ],
            },
        )

        assert budget["allocations"]
        for allocation in budget["allocations"]:
            assert allocation["category_id"]
            assert allocation["category_slug"] in {"housing", "groceries"}

        category_ids = {item["category_id"] for item in budget["allocations"]}
        rows = await session.execute(select(BudgetCategory).where(BudgetCategory.id.in_(category_ids)))
        assert len(list(rows.scalars().all())) == len(category_ids)
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_custom_strategy_works_with_user_categories():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)
        await service.create_custom_category("user-1", "gaming", "Gaming", "wants")
        await service.create_custom_category("user-1", "pet_care", "Pet Care", "needs")

        budget = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="custom",
            custom_allocations=[
                {"category_slug": "gaming", "amount": 400},
                {"category_slug": "pet_care", "amount": 600},
                {"category_slug": "housing", "amount": 3000},
            ],
        )

        slugs = {item["category_slug"] for item in budget["allocations"]}
        assert {"gaming", "pet_care", "housing"}.issubset(slugs)
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_fifty_thirty_twenty_uses_user_category_groups():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)
        await service.create_custom_category("user-1", "emergency_fund", "Emergency Fund", "savings")
        await service.create_custom_category("user-1", "gaming", "Gaming", "wants")

        draft = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="50_30_20",
        )

        slugs = {item["category_slug"] for item in draft["allocations"]}
        assert "gaming" in slugs
        # Savings categories are represented by planned_savings in this architecture.
        assert draft["planned_savings"] == pytest.approx(1000.0)
        assert _sum_allocations(draft) == pytest.approx(4000.0)
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_zero_based_incorporates_recurring_expenses_and_balances_income():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)

        session.add_all(
            [
                FinancialMemory(
                    user_id="user-1",
                    memory_type=MemoryType.RECURRING_EXPENSE,
                    title="Rent",
                    content="Recurring rent",
                    amount=1800,
                    category="housing",
                    details={"name": "Rent", "category": "housing", "monthly_amount": 1800},
                    source="financial_setup",
                ),
                FinancialMemory(
                    user_id="user-1",
                    memory_type=MemoryType.RECURRING_EXPENSE,
                    title="Insurance",
                    content="Recurring insurance",
                    amount=300,
                    category="insurance",
                    details={"name": "Insurance", "category": "insurance", "monthly_amount": 300},
                    source="financial_setup",
                ),
                FinancialMemory(
                    user_id="user-1",
                    memory_type=MemoryType.GOAL,
                    title="Emergency Fund",
                    content="Build emergency fund",
                    amount=12000,
                    category="savings",
                    details={
                        "name": "Emergency Fund",
                        "goal_type": "savings",
                        "target_amount": 12000,
                        "current_amount": 6000,
                        "target_date": "2027-08-01",
                        "priority": 1,
                    },
                    source="financial_setup",
                ),
            ]
        )
        await session.flush()

        draft = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="zero_based",
        )

        expected_available = round(float(draft["total_income"]) - float(draft["planned_savings"]), 2)
        assert _sum_allocations(draft) == pytest.approx(expected_available)

        by_slug = {item["category_slug"]: float(item["allocated_amount"]) for item in draft["allocations"]}
        assert by_slug.get("housing", 0.0) >= 1800.0
        assert by_slug.get("insurance", 0.0) >= 300.0
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_allocation_category_ids_are_valid_foreign_keys_after_generation():
    session, engine = await _new_session()
    try:
        await _seed_user(session)
        service = BudgetService(session)
        draft = await service.generate_budget_proposal(
            "user-1",
            month=8,
            year=2026,
            budgeting_mode="zero_based",
        )

        budget_id = draft["id"]
        rows = await session.execute(
            select(BudgetAllocation, BudgetCategory)
            .join(BudgetCategory, BudgetAllocation.category_id == BudgetCategory.id)
            .where(BudgetAllocation.budget_id == budget_id)
        )
        joined = rows.all()
        assert joined
        for allocation, category in joined:
            assert allocation.category_id == category.id
    finally:
        await session.close()
        await engine.dispose()
