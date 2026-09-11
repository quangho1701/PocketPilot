import json
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app
from app.models import Base, Budget, ChatMessage, FinancialMemory, MemoryType, User
from app.schemas.assistant import ChatRequest
from app.schemas.goal_simulation import (
    GoalSimulationGoal,
    GoalSimulationRequest,
    GoalSimulationScenario,
    ProjectionStatus,
    ScenarioFrequency,
    ScenarioType,
)
from app.services.assistant_service import AssistantService
from app.services.goal_simulation_calculations import simulate_goal
from app.services.goal_simulation_intent import GoalSimulationIntentResolver
from app.services.goal_simulation_service import GoalSimulationService


AS_OF_DATE = date(2026, 9, 4)


def goal(*, current: int = 600, target: int = 3000, target_date: date | None = None):
    return GoalSimulationGoal(
        id="goal-1",
        title="Japan Trip",
        current_amount=current,
        target_amount=target,
        target_date=target_date,
    )


async def new_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return async_sessionmaker(engine, expire_on_commit=False)(), engine


async def seed_goal(session, user_id: str = "user-1", **details):
    if not await session.get(User, user_id):
        session.add(User(id=user_id, email=f"{user_id}@example.com", name="User"))
    goal_details = {
        "name": "Japan Trip",
        "target_amount": 3000,
        "current_amount": 600,
        "status": "active",
        **details,
    }
    memory = FinancialMemory(
        user_id=user_id,
        memory_type=MemoryType.GOAL,
        title=goal_details["name"],
        content=f"Save for {goal_details['name']}",
        amount=goal_details["target_amount"],
        details=goal_details,
        source="financial_setup",
        source_id="primary_goal",
    )
    session.add(memory)
    await session.flush()
    return memory


async def seed_budget(session, user_id: str = "user-1", **values):
    budget_values = {
        "user_id": user_id,
        "month": AS_OF_DATE.month,
        "year": AS_OF_DATE.year,
        "total_income": 5000,
        "planned_savings": 600,
        "status": "active",
    }
    budget_values.update(values)
    budget = Budget(**budget_values)
    session.add(budget)
    await session.flush()
    return budget


def one_time_request(goal_id: str, amount: int = 300) -> GoalSimulationRequest:
    return GoalSimulationRequest(
        target_goal_id=goal_id,
        scenario=GoalSimulationScenario(
            scenario_type=ScenarioType.ONE_TIME_EXPENSE, amount=amount
        ),
    )


def chat_reply() -> str:
    return json.dumps(
        {
            "reply": "Here is your simulation result.",
            "recommendation": None,
            "reasoning": None,
            "item_description": None,
            "amount": None,
            "category": None,
        }
    )


class TestCalculations:
    def test_one_time_expense_delays_month_end_projection(self):
        result = simulate_goal(
            goal=goal(), baseline_monthly_contribution=600,
            scenario=GoalSimulationScenario(scenario_type=ScenarioType.ONE_TIME_EXPENSE, amount=300),
            as_of_date=AS_OF_DATE,
        )
        assert result.baseline.projected_completion_date == date(2026, 12, 31)
        assert result.scenario.projected_completion_date == date(2027, 1, 31)
        assert result.impact.delay_months == 1

    def test_one_time_expense_reports_unfunded_amount(self):
        result = simulate_goal(
            goal=goal(), baseline_monthly_contribution=600,
            scenario=GoalSimulationScenario(scenario_type=ScenarioType.ONE_TIME_EXPENSE, amount=900),
            as_of_date=AS_OF_DATE,
        )
        assert result.impact.unfunded_against_planned_savings == 300
        assert result.trajectory[0].amount == 600
        assert result.warnings

    def test_weekly_recurring_expense_uses_annualized_monthly_equivalent(self):
        result = simulate_goal(
            goal=goal(current=2000, target=10000), baseline_monthly_contribution=1000,
            scenario=GoalSimulationScenario(
                scenario_type=ScenarioType.RECURRING_EXPENSE, amount=100,
                frequency=ScenarioFrequency.WEEKLY,
            ), as_of_date=AS_OF_DATE,
        )
        assert result.scenario.monthly_equivalent == 434
        assert result.scenario.monthly_contribution == 566
        assert result.baseline.projected_completion_date == date(2027, 4, 30)
        assert result.scenario.projected_completion_date == date(2027, 11, 30)

    def test_recurring_expense_that_eliminates_savings_is_insufficient_plan(self):
        result = simulate_goal(
            goal=goal(), baseline_monthly_contribution=500,
            scenario=GoalSimulationScenario(
                scenario_type=ScenarioType.RECURRING_EXPENSE, amount=700,
                frequency=ScenarioFrequency.MONTHLY,
            ), as_of_date=AS_OF_DATE,
        )
        assert result.status == ProjectionStatus.INSUFFICIENT_PLAN
        assert result.scenario.projected_completion_date is None

    def test_additional_savings_can_make_a_zero_baseline_reachable(self):
        result = simulate_goal(
            goal=goal(current=1000, target=2500), baseline_monthly_contribution=0,
            scenario=GoalSimulationScenario(scenario_type=ScenarioType.ADDITIONAL_SAVINGS, amount=500),
            as_of_date=AS_OF_DATE,
        )
        assert result.baseline.status == ProjectionStatus.INSUFFICIENT_PLAN
        assert result.scenario.projected_completion_date == date(2026, 11, 30)

    def test_deadline_assessment_uses_only_contributions_on_or_before_deadline(self):
        result = simulate_goal(
            goal=goal(current=1000, target=3000), baseline_monthly_contribution=800,
            scenario=GoalSimulationScenario(scenario_type=ScenarioType.ONE_TIME_EXPENSE, amount=0),
            as_of_date=AS_OF_DATE, deadline=date(2026, 11, 15),
        )
        assessment = result.target_date_assessment
        assert assessment is not None
        assert assessment.shortfall == 400
        assert assessment.required_additional_monthly_savings == 200

    @pytest.mark.parametrize(
        ("current", "target", "contribution", "expected_status"),
        [(3000, 3000, 600, ProjectionStatus.COMPLETED), (0, 10000, 100, ProjectionStatus.UNSUPPORTED_HORIZON)],
    )
    def test_completed_and_horizon_limited_goals_do_not_create_completion_dates(
        self, current, target, contribution, expected_status
    ):
        result = simulate_goal(
            goal=goal(current=current, target=target), baseline_monthly_contribution=contribution,
            scenario=GoalSimulationScenario(scenario_type=ScenarioType.ONE_TIME_EXPENSE, amount=0),
            as_of_date=AS_OF_DATE,
        )
        assert result.status == expected_status
        assert result.scenario.projected_completion_date is None

    def test_recurring_expense_requires_frequency(self):
        with pytest.raises(ValueError, match="frequency is required"):
            GoalSimulationScenario(scenario_type=ScenarioType.RECURRING_EXPENSE, amount=100)


class TestService:
    @pytest.mark.asyncio
    async def test_service_loads_owned_goal_and_active_budget(self):
        session, engine = await new_session()
        try:
            saved_goal = await seed_goal(session)
            budget = await seed_budget(session)
            result = await GoalSimulationService(session).simulate(
                "user-1", one_time_request(saved_goal.id), as_of_date=AS_OF_DATE
            )
            assert result.goal.id == saved_goal.id
            assert result.baseline.monthly_contribution == 600
            assert any("ngân sách đang hoạt động" in assumption for assumption in result.assumptions)
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_service_rejects_unowned_or_inactive_goal(self):
        session, engine = await new_session()
        try:
            foreign_goal = await seed_goal(session, user_id="user-2")
            await seed_budget(session)
            with pytest.raises(ValueError, match="active goal not found"):
                await GoalSimulationService(session).simulate(
                    "user-1", one_time_request(foreign_goal.id), as_of_date=AS_OF_DATE
                )
            inactive_goal = await seed_goal(session, status="archived")
            with pytest.raises(ValueError, match="goal is not active"):
                await GoalSimulationService(session).simulate(
                    "user-1", one_time_request(inactive_goal.id), as_of_date=AS_OF_DATE
                )
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_service_requires_active_budget_and_preserves_zero_savings_status(self):
        session, engine = await new_session()
        try:
            saved_goal = await seed_goal(session)
            await seed_budget(session, status="draft")
            with pytest.raises(ValueError, match="active budget not found"):
                await GoalSimulationService(session).simulate(
                    "user-1", one_time_request(saved_goal.id), as_of_date=AS_OF_DATE
                )
            await seed_budget(session, planned_savings=0)
            result = await GoalSimulationService(session).simulate(
                "user-1", one_time_request(saved_goal.id), as_of_date=AS_OF_DATE
            )
            assert result.status == ProjectionStatus.INSUFFICIENT_PLAN
        finally:
            await session.close()
            await engine.dispose()


class TestApi:
    @pytest.mark.asyncio
    async def test_endpoint_returns_result_and_not_found_for_unowned_goal(self):
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def override_get_db():
            async with factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        try:
            async with factory() as session:
                saved_goal = await seed_goal(session)
                await seed_budget(session)
                await session.commit()
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/goal-simulations", params={"user_id": "user-1"},
                    json={"target_goal_id": saved_goal.id, "scenario": {"scenario_type": "one_time_expense", "amount": 300}},
                )
                missing = await client.post(
                    "/api/v1/goal-simulations", params={"user_id": "user-1"},
                    json={"target_goal_id": "missing-goal", "scenario": {"scenario_type": "one_time_expense", "amount": 300}},
                )
            assert response.status_code == 200
            assert response.json()["goal"]["id"] == saved_goal.id
            assert missing.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db, None)
            await engine.dispose()


class TestIntent:
    @pytest.mark.asyncio
    async def test_resolves_explicit_goal_weekly_expense_and_additional_savings(self):
        session, engine = await new_session()
        try:
            japan = await seed_goal(session)
            await seed_goal(session, name="Laptop", target_amount=1500, current_amount=400)
            resolver = GoalSimulationIntentResolver(session)
            expense = await resolver.resolve("user-1", "If I spend 300 on clothes for my Japan Trip?")
            weekly = await resolver.resolve("user-1", "What if I spend 50 every week on my Japan Trip?")
            savings = await resolver.resolve("user-1", "What if I save an extra 100 every month for Japan Trip?")
            assert expense is not None and expense.goal_id == japan.id
            assert expense.scenario.scenario_type == ScenarioType.ONE_TIME_EXPENSE
            assert weekly is not None and weekly.scenario.frequency == ScenarioFrequency.WEEKLY
            assert savings is not None and savings.scenario.scenario_type == ScenarioType.ADDITIONAL_SAVINGS
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_resolves_vietnamese_expense_and_savings_prompts(self):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            resolver = GoalSimulationIntentResolver(session)
            expense = await resolver.resolve(
                "user-1", "Nếu mình chi thêm 500.000 ₫ thì mục tiêu thay đổi thế nào?"
            )
            savings = await resolver.resolve(
                "user-1", "Nếu mình để dành thêm 200.000 ₫ mỗi tháng thì mục tiêu thay đổi thế nào?"
            )
            assert expense is not None and expense.is_simulation
            assert expense.scenario.scenario_type == ScenarioType.ONE_TIME_EXPENSE
            assert expense.scenario.amount == 500_000
            assert savings is not None and savings.is_simulation
            assert savings.scenario.scenario_type == ScenarioType.ADDITIONAL_SAVINGS
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_intent_clarifies_ambiguous_goal_and_month_deadline(self):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            await seed_goal(session, name="Laptop", target_amount=1500, current_amount=400)
            resolver = GoalSimulationIntentResolver(session)
            ambiguous = await resolver.resolve("user-1", "What if I spend 300?")
            deadline = await resolver.resolve("user-1", "Will I reach my goal by June if I spend 300?")
            assert ambiguous is not None and ambiguous.clarification == "Bạn muốn mô phỏng mục tiêu nào?"
            assert deadline is not None and deadline.clarification is not None
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_intent_extracts_amount_separately_from_iso_deadline(self):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            intent = await GoalSimulationIntentResolver(session).resolve(
                "user-1", "Will I reach my Japan Trip by 2027-06-30 if I spend 300?"
            )
            assert intent is not None and intent.is_simulation
            assert intent.scenario.amount == 300
            assert intent.target_date == date(2027, 6, 30)
        finally:
            await session.close()
            await engine.dispose()


class TestChat:
    @pytest.mark.asyncio
    async def test_chat_persists_result_and_clarifies_ambiguous_goals(self):
        session, engine = await new_session()
        try:
            japan = await seed_goal(session)
            await seed_budget(session)
            with patch("app.services.assistant_service.llm_client.invoke_model", new_callable=AsyncMock, return_value=chat_reply()) as invoke_model:
                response = await AssistantService(session).chat(
                    "user-1", ChatRequest(message="If I spend 300 on my Japan Trip?")
                )
            assert invoke_model.await_count == 1
            assert response.message.simulation_result is not None
            assert response.message.simulation_result.goal.id == japan.id
            assert response.message.simulation_input["scenario"]["amount"] == 300
            saved = next(item for item in (await session.execute(select(ChatMessage))).scalars() if item.role == "assistant")
            assert saved.simulation_schema_version == 1

            await seed_goal(session, name="Laptop", target_amount=1500, current_amount=400)
            with patch("app.services.assistant_service.llm_client.invoke_model", new_callable=AsyncMock) as invoke_model:
                clarification = await AssistantService(session).chat("user-1", ChatRequest(message="What if I spend 300?"))
            assert clarification.message.content == "Bạn muốn mô phỏng mục tiêu nào?"
            invoke_model.assert_not_awaited()
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_follow_up_can_switch_goal_and_vague_switch_requires_choice(self):
        session, engine = await new_session()
        try:
            japan = await seed_goal(session)
            laptop = await seed_goal(session, name="Máy tính mới", target_amount=1500, current_amount=400)
            previous = one_time_request(japan.id).model_dump(mode="json")
            resolver = GoalSimulationIntentResolver(session)
            explicit = await resolver.resolve("user-1", "Nếu chi 300 thì Máy tính mới bị ảnh hưởng thế nào?", previous_simulation_input=previous)
            vague = await resolver.resolve("user-1", "What if I spend 300 on another goal?", previous_simulation_input=previous)
            assert explicit is not None and explicit.goal_id == laptop.id
            assert vague is not None and vague.goal_id is None
            assert vague.clarification == "Bạn muốn mô phỏng mục tiêu nào?"
        finally:
            await session.close()
            await engine.dispose()


class TestCompletionRegressions:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "message",
        [
            "Should I buy these headphones for 1200000?",
            "Mình có nên mua tai nghe 1,2 triệu không?",
            "Mua cái này bây giờ có hợp lý không?",
        ],
    )
    async def test_purchase_recommendation_prompts_are_not_simulations(self, message):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            assert await GoalSimulationIntentResolver(session).resolve("user-1", message) is None
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("Nếu chi 500k thì mục tiêu thay đổi thế nào?", 500_000),
            ("If I spend 1.2m, how will it affect my goal?", 1_200_000),
            ("Nếu chi 500 nghìn thì mục tiêu thay đổi thế nào?", 500_000),
            ("Nếu chi 1 triệu thì mục tiêu thay đổi thế nào?", 1_000_000),
            ("Nếu chi 1,5 triệu thì mục tiêu thay đổi thế nào?", 1_500_000),
            ("Nếu chi 1.200.000 ₫ thì mục tiêu thay đổi thế nào?", 1_200_000),
        ],
    )
    def test_parses_localized_amount_formats(self, text, expected):
        scenario, _, clarification = GoalSimulationIntentResolver(None)._parse_scenario(text)
        assert clarification is None
        assert scenario is not None and scenario.amount == expected

    @pytest.mark.asyncio
    async def test_completed_goal_is_rejected_consistently(self):
        session, engine = await new_session()
        try:
            completed = await seed_goal(session, status="completed")
            await seed_budget(session)
            with pytest.raises(ValueError, match="goal is not active"):
                await GoalSimulationService(session).simulate(
                    "user-1", one_time_request(completed.id), as_of_date=AS_OF_DATE
                )
            intent = await GoalSimulationIntentResolver(session).resolve(
                "user-1", "Nếu chi 500 nghìn thì mục tiêu thay đổi thế nào?"
            )
            assert intent is not None
            assert intent.clarification == "Chưa có mục tiêu tài chính đang hoạt động để mô phỏng."
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_simulation_persists_when_explanation_llm_fails(self):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            await seed_budget(session)
            with patch(
                "app.services.assistant_service.llm_client.invoke_model",
                new_callable=AsyncMock,
                side_effect=RuntimeError("provider unavailable"),
            ):
                response = await AssistantService(session).chat(
                    "user-1", ChatRequest(message="Nếu chi 500 nghìn thì mục tiêu thay đổi thế nào?")
                )
            assert response.message.simulation_result is not None
            assert response.message.content.startswith("Mình đã tính tác động")
            await session.commit()
            messages = await AssistantService(session).get_messages("user-1", response.conversation_id)
            assert messages is not None
            persisted = next(message for message in messages if message.role == "assistant")
            assert persisted.simulation_result == response.message.simulation_result.model_dump(mode="json")
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_chat_follow_ups_reuse_or_change_goal_and_scenario(self):
        session, engine = await new_session()
        try:
            japan = await seed_goal(session)
            laptop = await seed_goal(session, name="Laptop", target_amount=1500, current_amount=400)
            await seed_budget(session)
            with patch("app.services.assistant_service.llm_client.invoke_model", new_callable=AsyncMock, return_value=chat_reply()):
                first = await AssistantService(session).chat("user-1", ChatRequest(message="What if I spend 500 on my Japan Trip?"))
                changed_amount = await AssistantService(session).chat(
                    "user-1", ChatRequest(message="What if I spend 150 instead?", conversation_id=first.conversation_id)
                )
                changed_goal = await AssistantService(session).chat(
                    "user-1", ChatRequest(message="What if I save an extra 100 every month for my Laptop?", conversation_id=first.conversation_id)
                )
            assert changed_amount.message.simulation_input["target_goal_id"] == japan.id
            assert changed_amount.message.simulation_input["scenario"]["amount"] == 150
            assert changed_goal.message.simulation_input["target_goal_id"] == laptop.id
            assert changed_goal.message.simulation_input["scenario"]["scenario_type"] == "additional_savings"
        finally:
            await session.close()
            await engine.dispose()

    @pytest.mark.asyncio
    async def test_chat_offset_follow_up_uses_prior_baseline_completion_as_deadline(self):
        session, engine = await new_session()
        try:
            await seed_goal(session)
            await seed_budget(session)
            with patch("app.services.assistant_service.llm_client.invoke_model", new_callable=AsyncMock, return_value=chat_reply()):
                first = await AssistantService(session).chat("user-1", ChatRequest(message="What if I spend 300 on my Japan Trip?"))
                offset = await AssistantService(session).chat(
                    "user-1", ChatRequest(message="How can I offset that?", conversation_id=first.conversation_id)
                )
            assessment = offset.message.simulation_result.target_date_assessment
            assert assessment is not None
            assert assessment.deadline == first.message.simulation_result.baseline.projected_completion_date
            assert assessment.required_additional_monthly_savings is not None
        finally:
            await session.close()
            await engine.dispose()
