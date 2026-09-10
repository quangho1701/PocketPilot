from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app
from app.models import Base, BudgetCategory, User
from app.models.transaction import TransactionSource
from app.schemas.transaction import ReceiptOCRResponse
from app.services import categorization_service
from app.services.categorization_service import CategorizationService
from app.services.receipt_ocr_service import ReceiptOCRService
from app.utils.auth import get_current_user


async def _new_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return session_factory(), engine


async def _seed_user(session: AsyncSession) -> User:
    user = User(id="user-1", email="user-1@example.com", name="User")
    session.add(user)
    await session.flush()
    return user


@pytest.mark.asyncio
async def test_llm_prediction_is_limited_to_available_categories(monkeypatch):
    session, engine = await _new_session()

    class FakeProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            assert '"merchant": "Starbucks"' in prompt
            return (
                '{"category_slug":"dining","confidence":0.94,'
                '"rationale":"Coffee merchant",'
                '"alternatives":[{"category_slug":"shopping","confidence":0.12}]}'
            )

    monkeypatch.setattr(categorization_service, "llm_client", FakeProvider())

    try:
        await _seed_user(session)
        dining = BudgetCategory(
            slug="dining",
            name="Dining",
            mapping_group="wants",
            is_default=True,
            user_id=None,
            is_active=True,
        )
        shopping = BudgetCategory(
            slug="shopping",
            name="Shopping",
            mapping_group="wants",
            is_default=True,
            user_id=None,
            is_active=True,
        )
        session.add_all([dining, shopping])
        await session.flush()

        prediction = await CategorizationService(session).categorize(
            user_id="user-1",
            merchant="Starbucks",
            description="Iced coffee",
        )

        assert prediction.category_id == dining.id
        assert prediction.category_slug == "dining"
        assert prediction.source == "llm"
        assert prediction.confidence == pytest.approx(0.94)
        assert prediction.alternatives[0].category_id == shopping.id
        assert prediction.requires_review is True
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_successful_llm_prediction_is_cached(monkeypatch):
    session, engine = await _new_session()
    calls = 0

    class FakeProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            nonlocal calls
            calls += 1
            return (
                '{"category_slug":"shopping","confidence":0.9,'
                '"rationale":"Fashion retailer","alternatives":[]}'
        )

    monkeypatch.setattr(categorization_service, "llm_client", FakeProvider())

    try:
        await _seed_user(session)
        shopping = BudgetCategory(
            slug="shopping",
            name="Shopping",
            mapping_group="wants",
            is_default=True,
            user_id=None,
            is_active=True,
        )
        session.add(shopping)
        await session.flush()

        service = CategorizationService(session)
        first = await service.categorize(user_id="user-1", merchant="Chanel")
        second = await service.categorize(user_id="user-1", merchant="Chanel")

        assert first.category_slug == "shopping"
        assert second.category_slug == "shopping"
        assert calls == 1
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_rules_fallback_returns_miscellaneous_for_unknown_merchant(monkeypatch):
    session, engine = await _new_session()

    class BrokenProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            raise RuntimeError("AWS credentials are not configured")

    monkeypatch.setattr(categorization_service, "llm_client", BrokenProvider())

    try:
        await _seed_user(session)
        prediction = await CategorizationService(session).categorize(
            user_id="user-1",
            merchant="Unknown Merchant",
        )

        assert prediction.category_slug == "miscellaneous"
        assert prediction.source == "rules"
        assert prediction.confidence == 0.2
        assert prediction.requires_review is True
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_rules_fallback_recognizes_transport_merchant(monkeypatch):
    session, engine = await _new_session()

    class BrokenProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(categorization_service, "llm_client", BrokenProvider())

    try:
        await _seed_user(session)
        prediction = await CategorizationService(session).categorize(
            user_id="user-1",
            merchant="Grab",
            description="Ride to campus",
        )

        assert prediction.category_slug == "transportation"
        assert prediction.source == "rules"
        assert prediction.confidence > 0
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_categorize_route_returns_reviewable_prediction(monkeypatch):
    session, engine = await _new_session()

    class FakeProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            return (
                '{"category_slug":"transportation","confidence":0.88,'
                '"rationale":"Ride-hailing merchant","alternatives":[]}'
            )

    monkeypatch.setattr(categorization_service, "llm_client", FakeProvider())
    user = await _seed_user(session)

    async def override_get_db():
        yield session

    async def override_current_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/transactions/categorize",
                json={"merchant": "Grab", "description": "Ride to school"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["category_slug"] == "transportation"
        assert payload["source"] == "llm"
        assert payload["requires_review"] is True
        assert payload["category_id"]
    finally:
        app.dependency_overrides.clear()
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_ocr_preview_includes_category_suggestion(monkeypatch):
    session, engine = await _new_session()

    class FakeProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            return (
                '{"category_slug":"dining","confidence":0.91,'
                '"rationale":"Receipt merchant matches dining",'
                '"alternatives":[]}'
            )

    async def fake_scan(self, file_bytes, filename, content_type):
        return ReceiptOCRResponse(
            filename=filename,
            content_type=content_type,
            merchant="Starbucks",
            amount=125000,
            transaction_date=date(2026, 8, 18),
            currency="VND",
            raw_text="STARBUCKS ICED COFFEE",
            source=TransactionSource.OCR,
        )

    monkeypatch.setattr(categorization_service, "llm_client", FakeProvider())
    monkeypatch.setattr(ReceiptOCRService, "scan", fake_scan)
    user = await _seed_user(session)

    async def override_get_db():
        yield session

    async def override_current_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/transactions/ocr",
                files={"file": ("receipt.png", b"fake-image", "image/png")},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["suggested_category"]["category_slug"] == "dining"
        assert payload["requires_confirmation"] is True
    finally:
        app.dependency_overrides.clear()
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("merchant", "description", "expected_slug"),
    [
        ("Walmart", "weekly groceries", "groceries"),
        ("Victoria's Secret", "body care", "personal_care"),
        ("Chanel", "perfume", "personal_care"),
        ("La Canafia", "restaurant dinner", "dining"),
        ("City Power", "electric bill", "utilities"),
    ],
)
async def test_rules_fallback_covers_common_receipt_merchants(
    monkeypatch, merchant, description, expected_slug
):
    session, engine = await _new_session()

    class BrokenProvider:
        async def invoke_with_prompt(self, prompt, **kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(categorization_service, "llm_client", BrokenProvider())

    try:
        await _seed_user(session)
        prediction = await CategorizationService(session).categorize(
            user_id="user-1",
            merchant=merchant,
            description=description,
        )

        assert prediction.category_slug == expected_slug
        assert prediction.source == "rules"
        assert prediction.confidence > 0.2
    finally:
        await session.close()
        await engine.dispose()
