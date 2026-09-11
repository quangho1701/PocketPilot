from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_memory import (
    FinancialMemory,
    MemoryImportance,
    MemoryType,
)
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.setup import FinancialSetupPayload, FinancialSetupResponse


class FinancialSetupService:
    SOURCE = "financial_setup"

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_setup(self, user_id: str) -> FinancialSetupResponse:
        profile = await self._get_profile(user_id)
        if not profile or profile.financial_setup_completed_at is None:
            return FinancialSetupResponse(
                status="not_started",
                completed_at=None,
                data=None,
            )

        memories = await self._get_active_setup_memories(user_id)
        plan_goals = list((await self.db.execute(select(FinancialMemory).where(
            FinancialMemory.user_id == user_id,
            FinancialMemory.source == "plan",
            FinancialMemory.memory_type == MemoryType.GOAL,
            FinancialMemory.is_deleted == False,  # noqa: E712
        ))).scalars().all())
        memories.extend(plan_goals)
        payload = self._reconstruct_payload(profile, memories)
        return FinancialSetupResponse(
            status="completed",
            completed_at=profile.financial_setup_completed_at,
            data=payload,
        )

    async def replace_setup(
        self, user_id: str, data: FinancialSetupPayload
    ) -> tuple[FinancialSetupResponse, list[str]]:
        """Replace the complete setup in the caller's current DB transaction."""
        await self._ensure_user(user_id)

        profile = await self._get_profile(user_id, for_update=True)
        if profile is None:
            profile = UserProfile(user_id=user_id)
            self.db.add(profile)
            await self.db.flush()

        now = datetime.now(timezone.utc)
        existing_memories = await self._get_active_setup_memories(user_id)
        for memory in existing_memories:
            memory.is_deleted = True
            memory.deleted_at = now

        spending_categories = dict(profile.spending_categories or {})
        spending_categories["focus_categories"] = list(data.focus_categories)

        profile.monthly_income = data.monthly_income
        profile.income_frequency = data.income_frequency
        profile.savings_priority = data.savings_priority
        profile.spending_categories = spending_categories
        profile.currency = data.currency
        profile.financial_situation_notes = data.financial_situation_notes

        memories = self._build_memories(user_id, data)
        self.db.add_all(memories)

        # Flush all core records before setting the completion marker. A failure
        # anywhere above leaves the profile incomplete once the transaction rolls back.
        await self.db.flush()
        profile.financial_setup_version = data.setup_version
        profile.financial_setup_completed_at = now
        await self.db.flush()

        response = FinancialSetupResponse(
            status="completed",
            completed_at=profile.financial_setup_completed_at,
            data=data,
        )
        return response, [memory.id for memory in memories]

    async def _ensure_user(self, user_id: str) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is not None:
            return user

        user = User(
            id=user_id,
            email=f"demo+{user_id}@pocketpilot.local",
            name="Demo User",
        )
        self.db.add(user)
        await self.db.flush()
        return user

    async def _get_profile(
        self, user_id: str, *, for_update: bool = False
    ) -> UserProfile | None:
        statement = select(UserProfile).where(UserProfile.user_id == user_id)
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def _get_active_setup_memories(
        self, user_id: str
    ) -> list[FinancialMemory]:
        result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.source == self.SOURCE,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    def _build_memories(
        self, user_id: str, data: FinancialSetupPayload
    ) -> list[FinancialMemory]:
        income_details = {
            "monthly_income": data.monthly_income,
            "income_frequency": data.income_frequency,
            "currency": data.currency,
        }
        memories = [
            FinancialMemory(
                user_id=user_id,
                memory_type=MemoryType.INCOME,
                title="Thu nhập thực nhận hàng tháng",
                content=(
                    f"Thu nhập thực nhận trung bình là "
                    f"${data.monthly_income:,.2f} per month."
                ),
                amount=data.monthly_income,
                category="income",
                details=income_details,
                importance=MemoryImportance.HIGH,
                source=self.SOURCE,
                source_id="income",
            )
        ]

        for position, goal in enumerate(data.goals):
            goal_id = goal.id or f"goal-{position + 1}"
            goal_details = goal.model_dump(mode="json")
            goal_details.update({"id": goal_id, "currency": data.currency, "position": position, "is_primary": goal_id == data.primary_goal_id})
            memories.append(FinancialMemory(user_id=user_id, memory_type=MemoryType.GOAL, title=goal.name,
                content=f"Financial goal: {goal.name}, target ${goal.target_amount:,.2f}.",
                amount=goal.target_amount, category=goal.goal_type, details=goal_details,
                importance=MemoryImportance.HIGH, source=self.SOURCE, source_id=f"goal:{goal_id}"))

        for position, expense in enumerate(data.recurring_expenses):
            expense_details = expense.model_dump(mode="json")
            expense_details.update(
                {
                    "currency": data.currency,
                    "position": position,
                }
            )
            memories.append(
                FinancialMemory(
                    user_id=user_id,
                    memory_type=MemoryType.RECURRING_EXPENSE,
                    title=expense.name,
                    content=(
                        f"Chi phí cố định {expense.name} khoảng "
                        f"${expense.monthly_amount:,.2f} per month."
                    ),
                    amount=expense.monthly_amount,
                    category=expense.category,
                    details=expense_details,
                    importance=MemoryImportance.MEDIUM,
                    source=self.SOURCE,
                    source_id=f"recurring-{position}",
                )
            )

        return memories

    def _reconstruct_payload(
        self, profile: UserProfile, memories: list[FinancialMemory]
    ) -> FinancialSetupPayload:
        goal_memories = sorted((memory for memory in memories if memory.memory_type == MemoryType.GOAL), key=lambda memory: (memory.details or {}).get("position", 0))
        if (
            profile.monthly_income is None
            or profile.income_frequency is None
        ):
            raise RuntimeError("Completed financial setup data is incomplete")

        recurring_memories = sorted(
            (
                memory
                for memory in memories
                if memory.memory_type == MemoryType.RECURRING_EXPENSE
            ),
            key=lambda memory: (memory.details or {}).get("position", 0),
        )
        recurring_expenses = []
        for memory in recurring_memories:
            details = memory.details or {}
            recurring_expenses.append(
                {
                    "name": details.get("name", memory.title),
                    "category": details.get("category", memory.category),
                    "monthly_amount": details.get("monthly_amount", memory.amount),
                }
            )

        goals = []
        primary_goal_id = None
        for position, memory in enumerate(goal_memories):
            details = memory.details or {}
            goal_id = details.get("id") or (memory.source_id or f"goal-{position + 1}").removeprefix("goal:")
            goals.append({"id": goal_id, "goal_type": details.get("goal_type", memory.category), "name": details.get("name", memory.title),
                          "target_amount": int(details.get("target_amount", memory.amount) or 0), "current_amount": int(details.get("current_amount", 0) or 0), "target_date": details.get("target_date")})
            is_primary = bool(details["is_primary"]) if "is_primary" in details else memory.source_id == "primary_goal"
            if is_primary: primary_goal_id = goal_id
        spending_categories = profile.spending_categories or {}
        focus_categories = spending_categories.get("focus_categories", [])
        if not isinstance(focus_categories, list):
            focus_categories = []

        monthly_income = float(profile.monthly_income)
        if not monthly_income.is_integer():
            raise RuntimeError("Completed financial setup income is not an integer")

        return FinancialSetupPayload.model_validate(
            {
                "currency": profile.currency,
                "monthly_income": int(monthly_income),
                "income_frequency": profile.income_frequency,
                "recurring_expenses": recurring_expenses,
                "goals": goals,
                "primary_goal_id": primary_goal_id or (goals[0]["id"] if goals else None),
                "savings_priority": profile.savings_priority,
                "focus_categories": focus_categories,
                "financial_situation_notes": profile.financial_situation_notes,
                "setup_version": profile.financial_setup_version,
            }
        )
