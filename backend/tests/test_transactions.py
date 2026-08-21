from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app
from app.models import Base, BudgetCategory, User
from app.models.transaction import TransactionSource, TransactionType
from app.schemas.transaction import TransactionCreate, TransactionFilter, TransactionUpdate
from app.services.transaction_service import TransactionService
from app.utils.auth import get_current_user


async def _new_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return session_factory(), engine


async def _seed_user(session: AsyncSession, user_id: str) -> None:
    session.add(User(id=user_id, email=f"{user_id}@example.com", name=user_id))


async def _seed_default_category(
    session: AsyncSession, slug: str = "food"
) -> BudgetCategory:
    category = BudgetCategory(
        slug=slug,
        name=slug.title(),
        mapping_group="wants",
        is_default=True,
        user_id=None,
        is_active=True,
    )
    session.add(category)
    await session.flush()
    return category


def _transaction_data(category_id: str, **overrides) -> TransactionCreate:
    values = {
        "amount": Decimal("125.50"),
        "transaction_type": TransactionType.EXPENSE,
        "merchant": "Circle K",
        "category_id": category_id,
        "transaction_date": date(2026, 8, 15),
        "currency": "VND",
        "payment_method": "cash",
        "description": "Dinner and snacks",
        "source": TransactionSource.MANUAL,
    }
    values.update(overrides)
    return TransactionCreate(**values)


@pytest.mark.asyncio
async def test_transaction_crud_and_user_isolation():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        await _seed_user(session, "user-2")
        category = await _seed_default_category(session)
        service = TransactionService(session)

        created = await service.create_transaction(
            "user-1", _transaction_data(category.id)
        )
        await session.commit()

        assert created.user_id == "user-1"
        assert created.amount == Decimal("125.50")
        assert created.transaction_type == TransactionType.EXPENSE

        listed = await service.list_transactions("user-1", TransactionFilter())
        assert listed.total == 1
        assert listed.items[0].merchant == "Circle K"

        # A different user must not be able to read, edit, or delete this row.
        assert await service.get_transaction("user-2", created.id) is None
        assert (
            await service.update_transaction(
                "user-2", created.id, TransactionUpdate(merchant="Hacked")
            )
            is None
        )
        assert await service.delete_transaction("user-2", created.id) is False

        updated = await service.update_transaction(
            "user-1", created.id, TransactionUpdate(merchant="Updated Shop")
        )
        await session.commit()
        assert updated is not None
        assert updated.merchant == "Updated Shop"

        assert await service.delete_transaction("user-1", created.id) is True
        await session.commit()
        assert await service.get_transaction("user-1", created.id) is None
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_transaction_filters_and_pagination():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        food = await _seed_default_category(session, "food")
        transport = await _seed_default_category(session, "transport")
        service = TransactionService(session)

        await service.create_transaction(
            "user-1",
            _transaction_data(
                food.id,
                merchant="Circle K",
                transaction_date=date(2026, 8, 10),
            ),
        )
        await service.create_transaction(
            "user-1",
            _transaction_data(
                transport.id,
                merchant="Grab",
                transaction_date=date(2026, 8, 12),
                source=TransactionSource.OCR,
            ),
        )
        await service.create_transaction(
            "user-1",
            _transaction_data(
                food.id,
                merchant="Market",
                transaction_date=date(2026, 8, 20),
            ),
        )
        await session.commit()

        filtered = await service.list_transactions(
            "user-1",
            TransactionFilter(
                category_id=food.id,
                date_from=date(2026, 8, 1),
                date_to=date(2026, 8, 15),
                page=1,
                page_size=1,
            ),
        )

        assert filtered.total == 1
        assert filtered.total_pages == 1
        assert filtered.items[0].merchant == "Circle K"
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_transaction_rejects_unavailable_category():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        await _seed_user(session, "user-2")
        custom_category = BudgetCategory(
            slug="private-food",
            name="Private Food",
            mapping_group="wants",
            is_default=False,
            user_id="user-2",
            is_active=True,
        )
        session.add(custom_category)
        await session.flush()

        with pytest.raises(ValueError, match="Category not found"):
            await TransactionService(session).create_transaction(
                "user-1", _transaction_data(custom_category.id)
            )
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_dashboard_aggregates_income_expense_and_categories():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        food = await _seed_default_category(session, "food")
        transport = await _seed_default_category(session, "transport")
        service = TransactionService(session)

        await service.create_transaction(
            "user-1",
            _transaction_data(
                food.id,
                amount=Decimal("1000.00"),
                transaction_type=TransactionType.INCOME,
                merchant="Salary",
                transaction_date=date(2026, 8, 1),
            ),
        )
        await service.create_transaction(
            "user-1",
            _transaction_data(
                food.id,
                amount=Decimal("125.50"),
                merchant="Circle K",
                transaction_date=date(2026, 8, 10),
            ),
        )
        await service.create_transaction(
            "user-1",
            _transaction_data(
                transport.id,
                amount=Decimal("50.00"),
                merchant="Grab",
                transaction_date=date(2026, 8, 12),
            ),
        )
        await service.create_transaction(
            "user-1",
            _transaction_data(
                food.id,
                amount=Decimal("999.00"),
                merchant="Outside period",
                transaction_date=date(2026, 9, 1),
            ),
        )
        await session.commit()

        dashboard = await service.get_dashboard_data(
            "user-1",
            date_from=date(2026, 8, 1),
            date_to=date(2026, 8, 31),
        )

        assert dashboard.total_income == Decimal("1000.00")
        assert dashboard.total_expense == Decimal("175.50")
        assert dashboard.net_balance == Decimal("824.50")
        assert dashboard.transaction_count == 3
        assert [item.category_name for item in dashboard.by_category] == [
            "Food",
            "Transport",
        ]
        assert dashboard.by_category[0].total_amount == Decimal("125.50")
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_dashboard_route_returns_aggregated_json():
    session, engine = await _new_session()
    try:
        await _seed_user(session, "user-1")
        category = await _seed_default_category(session)
        await TransactionService(session).create_transaction(
            "user-1",
            _transaction_data(
                category.id,
                amount=Decimal("200.00"),
                transaction_date=date(2026, 8, 10),
            ),
        )
        await session.commit()

        async def override_get_db():
            yield session

        async def override_current_user():
            return User(id="user-1", email="user-1@example.com", name="User")

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_current_user
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get(
                    "/api/v1/transactions/dashboard",
                    params={
                        "user_id": "user-1",
                        "date_from": "2026-08-01",
                        "date_to": "2026-08-31",
                    },
                )

            assert response.status_code == 200
            payload = response.json()
            assert payload["total_expense"] == "200.00"
            assert payload["net_balance"] == "-200.00"
            assert payload["transaction_count"] == 1
        finally:
            app.dependency_overrides.clear()
    finally:
        await session.close()
        await engine.dispose()


def test_transaction_schema_rejects_invalid_amount_and_currency():
    with pytest.raises(ValueError):
        _transaction_data("category-1", amount=0)

    with pytest.raises(ValueError):
        _transaction_data("category-1", currency="vnd")
