from __future__ import annotations

import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.database import get_db
from app.main import app
from app.models import Base, FinancialMemory, MemoryType, User, UserProfile
from app.schemas.setup import FinancialSetupPayload
from app.services.setup_service import FinancialSetupService


USER_ID = "00000000-0000-4000-8000-000000000001"


def setup_data(
    *, monthly_income: int = 20_000_000, recurring_count: int = 2
) -> dict:
    return {
        "currency": "VND",
        "monthly_income": monthly_income,
        "income_frequency": "monthly",
        "recurring_expenses": [
            {
                "name": f"Chi phí {position}",
                "category": "fixed",
                "monthly_amount": 1_000_000 + position,
            }
            for position in range(recurring_count)
        ],
        "primary_goal": {
            "goal_type": "emergency_fund",
            "name": "Quỹ khẩn cấp",
            "target_amount": 60_000_000,
            "current_amount": 5_000_000,
            "target_date": (date.today() + timedelta(days=30)).isoformat(),
        },
        "savings_priority": "balanced",
        "focus_categories": ["Ăn uống", "Ăn uống", "Di chuyển"],
        "financial_situation_notes": "  ",
        "setup_version": 1,
    }


class FinancialSetupSchemaTests(unittest.TestCase):
    def test_normalizes_optional_values(self) -> None:
        payload = FinancialSetupPayload.model_validate(setup_data())

        self.assertEqual(payload.focus_categories, ["Ăn uống", "Di chuyển"])
        self.assertIsNone(payload.financial_situation_notes)

    def test_rejects_invalid_money_currency_and_progress(self) -> None:
        invalid_cases = []

        wrong_currency = setup_data()
        wrong_currency["currency"] = "USD"
        invalid_cases.append(wrong_currency)

        fractional_income = setup_data()
        fractional_income["monthly_income"] = 1.5
        invalid_cases.append(fractional_income)

        excess_progress = setup_data()
        excess_progress["primary_goal"]["current_amount"] = 70_000_000
        invalid_cases.append(excess_progress)

        for invalid in invalid_cases:
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                FinancialSetupPayload.model_validate(invalid)

    def test_saved_payload_allows_goal_date_to_age(self) -> None:
        persisted = setup_data()
        persisted["primary_goal"]["target_date"] = (
            date.today() - timedelta(days=1)
        ).isoformat()

        payload = FinancialSetupPayload.model_validate(persisted)

        self.assertLess(payload.primary_goal.target_date, date.today())

    def test_static_memory_routes_precede_id_route(self) -> None:
        route_paths = [route.path for route in app.routes]
        dynamic_index = route_paths.index("/api/v1/memory/{memory_id}")

        for static_path in (
            "/api/v1/memory/profile",
            "/api/v1/memory/patterns",
            "/api/v1/memory/decisions",
        ):
            self.assertLess(route_paths.index(static_path), dynamic_index)

        self.assertIn("/api/v1/setup", route_paths)


class FinancialSetupServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session_factory = async_sessionmaker(
            self.engine, expire_on_commit=False
        )

        async def override_get_db():
            async with self.session_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

    async def asyncTearDown(self) -> None:
        app.dependency_overrides.pop(get_db, None)
        await self.engine.dispose()

    async def test_api_get_and_put_contract(self) -> None:
        payload = FinancialSetupPayload.model_validate(setup_data())
        transport = ASGITransport(app=app)

        with patch(
            "app.routers.setup._embed_setup_memories", new_callable=AsyncMock
        ) as embed_memories:
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                initial = await client.get(
                    "/api/v1/setup", params={"user_id": USER_ID}
                )
                saved = await client.put(
                    "/api/v1/setup",
                    params={"user_id": USER_ID},
                    json=payload.model_dump(mode="json"),
                )
                fetched = await client.get(
                    "/api/v1/setup", params={"user_id": USER_ID}
                )

        self.assertEqual(initial.status_code, 200)
        self.assertEqual(
            initial.json(),
            {
                "status": "not_started",
                "completed_at": None,
                "data": None,
            },
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["status"], "completed")
        self.assertEqual(saved.json()["data"], payload.model_dump(mode="json"))
        self.assertEqual(fetched.json()["data"], payload.model_dump(mode="json"))
        embed_memories.assert_awaited_once()

    async def test_get_not_started_then_put_round_trips(self) -> None:
        async with self.session_factory() as session:
            not_started = await FinancialSetupService(session).get_setup(USER_ID)
            self.assertEqual(not_started.status, "not_started")
            self.assertIsNone(not_started.data)

            payload = FinancialSetupPayload.model_validate(setup_data())
            completed, memory_ids = await FinancialSetupService(
                session
            ).replace_setup(USER_ID, payload)
            await session.commit()

        self.assertEqual(completed.status, "completed")
        self.assertEqual(len(memory_ids), 4)

        async with self.session_factory() as session:
            saved = await FinancialSetupService(session).get_setup(USER_ID)
            memories = list(
                (
                    await session.execute(
                        select(FinancialMemory).where(
                            FinancialMemory.user_id == USER_ID,
                            FinancialMemory.source == "financial_setup",
                            FinancialMemory.is_deleted == False,  # noqa: E712
                        )
                    )
                ).scalars()
            )

        self.assertEqual(saved.status, "completed")
        self.assertEqual(
            saved.data.model_dump(mode="json"), payload.model_dump(mode="json")
        )
        self.assertEqual(
            {memory.memory_type.value for memory in memories},
            {"income", "goal", "recurring_expense"},
        )
        goal_memory = next(
            memory for memory in memories if memory.memory_type.value == "goal"
        )
        self.assertEqual(goal_memory.details["current_amount"], 5_000_000)
        self.assertEqual(goal_memory.details["currency"], "VND")

    async def test_repeated_put_replaces_active_memories_idempotently(self) -> None:
        async with self.session_factory() as session:
            service = FinancialSetupService(session)
            await service.replace_setup(
                USER_ID, FinancialSetupPayload.model_validate(setup_data())
            )
            await session.commit()

        replacement = FinancialSetupPayload.model_validate(
            setup_data(monthly_income=25_000_000, recurring_count=1)
        )
        async with self.session_factory() as session:
            await FinancialSetupService(session).replace_setup(USER_ID, replacement)
            await session.commit()

            active_count = await session.scalar(
                select(func.count())
                .select_from(FinancialMemory)
                .where(
                    FinancialMemory.user_id == USER_ID,
                    FinancialMemory.source == "financial_setup",
                    FinancialMemory.is_deleted == False,  # noqa: E712
                )
            )
            deleted_count = await session.scalar(
                select(func.count())
                .select_from(FinancialMemory)
                .where(
                    FinancialMemory.user_id == USER_ID,
                    FinancialMemory.source == "financial_setup",
                    FinancialMemory.is_deleted == True,  # noqa: E712
                )
            )
            user_count = await session.scalar(
                select(func.count()).select_from(User).where(User.id == USER_ID)
            )
            profile_count = await session.scalar(
                select(func.count())
                .select_from(UserProfile)
                .where(UserProfile.user_id == USER_ID)
            )

        self.assertEqual(active_count, 3)
        self.assertEqual(deleted_count, 4)
        self.assertEqual(user_count, 1)
        self.assertEqual(profile_count, 1)

    async def test_setup_owned_data_rejects_generic_mutations(self) -> None:
        payload = FinancialSetupPayload.model_validate(setup_data())
        async with self.session_factory() as session:
            await FinancialSetupService(session).replace_setup(USER_ID, payload)
            await session.commit()
            goal_id = await session.scalar(
                select(FinancialMemory.id).where(
                    FinancialMemory.user_id == USER_ID,
                    FinancialMemory.memory_type == MemoryType.GOAL,
                    FinancialMemory.source == "financial_setup",
                    FinancialMemory.is_deleted == False,  # noqa: E712
                )
            )

        self.assertIsNotNone(goal_id)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            profile_patch = await client.patch(
                "/api/v1/memory/profile",
                params={"user_id": USER_ID},
                json={"currency": "USD"},
            )
            reserved_create = await client.post(
                "/api/v1/memory/",
                params={"user_id": USER_ID},
                json={
                    "memory_type": "goal",
                    "title": "Injected goal",
                    "content": "Must not be accepted",
                    "source": "financial_setup",
                },
            )
            goal_patch = await client.patch(
                f"/api/v1/memory/{goal_id}",
                params={"user_id": USER_ID},
                json={"title": "Corrupted goal"},
            )
            goal_delete = await client.delete(
                f"/api/v1/memory/{goal_id}", params={"user_id": USER_ID}
            )
            setup_after = await client.get(
                "/api/v1/setup", params={"user_id": USER_ID}
            )

        self.assertEqual(profile_patch.status_code, 409)
        self.assertEqual(reserved_create.status_code, 409)
        self.assertEqual(goal_patch.status_code, 409)
        self.assertEqual(goal_delete.status_code, 409)
        self.assertEqual(setup_after.status_code, 200)
        self.assertEqual(setup_after.json()["data"], payload.model_dump(mode="json"))

    async def test_rollback_does_not_mark_setup_completed(self) -> None:
        async with self.session_factory() as session:
            payload = FinancialSetupPayload.model_validate(setup_data())
            await FinancialSetupService(session).replace_setup(USER_ID, payload)
            await session.rollback()

        async with self.session_factory() as session:
            result = await FinancialSetupService(session).get_setup(USER_ID)
            user_count = await session.scalar(
                select(func.count()).select_from(User).where(User.id == USER_ID)
            )

        self.assertEqual(result.status, "not_started")
        self.assertEqual(user_count, 0)
