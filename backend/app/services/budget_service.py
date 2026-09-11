# Owner: Ha
# Business logic for Personalized Budget Planning
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import UTC, date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget
from app.models.budget_allocation import BudgetAllocation
from app.models.budget_category import BudgetCategory
from app.models.financial_memory import FinancialMemory, MemoryType
from app.models.spending_pattern import PatternStatus, SpendingPattern
from app.models.user_profile import UserProfile
from app.services.budget_strategies import (
    CustomStrategy,
    FiftyThirtyTwentyStrategy,
    ZeroBasedStrategy,
)
from app.utils.bedrock import bedrock_client

logger = logging.getLogger(__name__)

DEFAULT_CATEGORIES = [
    ("housing", "Housing", "needs"),
    ("utilities", "Utilities", "needs"),
    ("groceries", "Groceries", "needs"),
    ("dining", "Dining", "wants"),
    ("transportation", "Transportation", "needs"),
    ("shopping", "Shopping", "wants"),
    ("healthcare", "Healthcare", "needs"),
    ("insurance", "Insurance", "needs"),
    ("education", "Education", "needs"),
    ("entertainment", "Entertainment", "wants"),
    ("subscriptions", "Subscriptions", "wants"),
    ("travel", "Travel", "wants"),
    ("savings", "Savings", "savings"),
    ("investments", "Investments", "savings"),
    ("gifts_donations", "Gifts & Donations", "wants"),
    ("personal_care", "Personal Care", "wants"),
    ("pets", "Pets", "needs"),
    ("miscellaneous", "Miscellaneous", "wants"),
]

VALID_MAPPING_GROUPS = {"needs", "wants", "savings"}


def _calculate_goal_savings(goals: list[dict], target_income: float) -> float:
    """Derive a goal-aware minimum savings floor for budget proposals."""
    if not goals:
        return 0.0

    today = date.today()
    contribution = 0.0
    for goal in goals:
        if goal.get("status") == "completed":
            continue

        target_amount = float(goal.get("target_amount", 0.0))
        current_amount = float(goal.get("current_amount", 0.0))
        remaining = max(target_amount - current_amount, 0.0)
        if remaining <= 0:
            continue

        target_date_str = goal.get("target_date")
        if not target_date_str:
            continue

        try:
            target_date = date.fromisoformat(target_date_str)
        except (TypeError, ValueError):
            continue

        months_remaining = (target_date.year - today.year) * 12 + (target_date.month - today.month)
        if target_date.day > today.day:
            months_remaining += 1
        months_remaining = max(months_remaining, 1)

        priority = int(goal.get("priority", 99))
        multiplier = 1.0 if priority <= 2 else 0.5

        monthly_need = remaining / months_remaining
        contribution += monthly_need * multiplier

    return min(contribution, target_income * 0.5)


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _scalar_or_first(self, query):
        if hasattr(self.db, "scalar"):
            return await self.db.scalar(query)
        result = await self.db.execute(query)
        return result.scalars().first()

    @staticmethod
    def _normalize_slug(value: str) -> str:
        return value.strip().lower().replace(" ", "_")

    @staticmethod
    def _normalize_mapping_group(value: str) -> str:
        return value.strip().lower()

    async def _build_category_maps(
        self, user_id: str
    ) -> tuple[list[BudgetCategory], dict[str, BudgetCategory], dict[str, BudgetCategory], dict[str, list[str]]]:
        categories = await self.list_categories(user_id)

        by_id: dict[str, BudgetCategory] = {category.id: category for category in categories}
        by_slug: dict[str, BudgetCategory] = {}
        grouped: dict[str, list[str]] = {"needs": [], "wants": [], "savings": []}

        for category in categories:
            if category.mapping_group in grouped and category.slug not in grouped[category.mapping_group]:
                grouped[category.mapping_group].append(category.slug)

            existing = by_slug.get(category.slug)
            if existing is None:
                by_slug[category.slug] = category
                continue

            # Prefer user-specific categories when a default and user category share a slug.
            if existing.is_default and not category.is_default:
                by_slug[category.slug] = category

        return categories, by_id, by_slug, grouped

    async def _resolve_allocations(
        self,
        user_id: str,
        allocations: list[dict],
    ) -> list[dict]:
        _, categories_by_id, categories_by_slug, _ = await self._build_category_maps(user_id)

        unresolved: list[str] = []
        resolved: list[dict] = []
        for item in allocations:
            category = None
            raw_category_id = item.get("category_id")
            raw_category_slug = item.get("category_slug")

            if raw_category_id and raw_category_id in categories_by_id:
                category = categories_by_id[raw_category_id]
            elif raw_category_slug:
                normalized_slug = self._normalize_slug(str(raw_category_slug))
                category = categories_by_slug.get(normalized_slug)
            elif raw_category_id:
                # Backward compatibility: historically category_id carried slugs.
                normalized_slug = self._normalize_slug(str(raw_category_id))
                category = categories_by_slug.get(normalized_slug)

            if category is None:
                candidate = raw_category_slug if raw_category_slug is not None else raw_category_id
                unresolved.append(str(candidate))
                continue

            amount = item.get("allocated_amount")
            if amount is None:
                amount = item.get("amount", 0.0)

            resolved.append(
                {
                    "category_id": category.id,
                    "category_slug": category.slug,
                    "allocated_amount": float(amount or 0.0),
                }
            )

        if unresolved:
            raise ValueError(f"unknown category identifiers: {', '.join(sorted(set(unresolved)))}")

        return resolved

    async def ensure_default_categories(self) -> None:
        result = await self.db.execute(
            select(BudgetCategory.slug).where(
                BudgetCategory.is_default.is_(True),
                BudgetCategory.user_id.is_(None),
            )
        )
        existing_slugs = set(result.scalars().all())

        for slug, name, mapping_group in DEFAULT_CATEGORIES:
            if slug not in existing_slugs:
                self.db.add(
                    BudgetCategory(
                        slug=slug,
                        name=name,
                        mapping_group=mapping_group,
                        is_default=True,
                        user_id=None,
                        is_active=True,
                    )
                )
        await self.db.flush()

    async def list_categories(self, user_id: str) -> list[BudgetCategory]:
        await self.ensure_default_categories()
        result = await self.db.execute(
            select(BudgetCategory)
            .where(
                BudgetCategory.is_active == True,  # noqa: E712
                or_(BudgetCategory.is_default == True, BudgetCategory.user_id == user_id),  # noqa: E712
            )
            .order_by(BudgetCategory.is_default.desc(), BudgetCategory.name.asc())
        )
        return list(result.scalars().all())

    async def create_custom_category(
        self, user_id: str, slug: str, name: str, mapping_group: str
    ) -> BudgetCategory:
        await self.ensure_default_categories()
        normalized_slug = self._normalize_slug(slug)
        normalized_group = self._normalize_mapping_group(mapping_group)
        if normalized_group not in VALID_MAPPING_GROUPS:
            raise ValueError("mapping_group must be one of: needs, wants, savings")

        existing = await self.db.scalar(
            select(BudgetCategory).where(
                BudgetCategory.slug == normalized_slug,
                or_(
                    BudgetCategory.user_id == user_id,
                    BudgetCategory.user_id.is_(None),
                ),
            )
        )
        if existing:
            raise ValueError("category slug already exists")

        category = BudgetCategory(
            slug=normalized_slug,
            name=name.strip(),
            mapping_group=normalized_group,
            is_default=False,
            user_id=user_id,
            is_active=True,
        )
        self.db.add(category)
        await self.db.flush()
        return category

    async def get_budget(self, user_id: str) -> dict:
        query = (
            select(Budget)
            .where(Budget.user_id == user_id)
            .order_by(Budget.year.desc(), Budget.month.desc(), Budget.created_at.desc())
        )
        budget = await self._scalar_or_first(query)
        if not budget:
            return {}
        return await self._serialize_budget(budget)

    async def get_budget_for_month(
        self,
        user_id: str,
        month: int,
        year: int,
        *,
        status: str | None = None,
    ) -> dict | None:
        query = select(Budget).where(
            Budget.user_id == user_id,
            Budget.month == month,
            Budget.year == year,
        )
        if status:
            query = query.where(Budget.status == status)
        query = query.order_by(Budget.created_at.desc())
        budget = await self._scalar_or_first(query)
        if not budget:
            return None
        return await self._serialize_budget(budget)

    async def list_budget_months(self, user_id: str) -> list[dict]:
        result = await self.db.execute(
            select(Budget)
            .where(Budget.user_id == user_id)
            .order_by(Budget.year.desc(), Budget.month.desc(), Budget.created_at.desc())
        )
        seen: set[tuple[int, int]] = set()
        rows: list[dict] = []
        for budget in result.scalars().unique().all():
            key = (budget.year, budget.month)
            if key in seen:
                continue
            seen.add(key)
            rows.append(await self._serialize_budget(budget))
        return rows

    async def _archive_active_budget(self, user_id: str, month: int, year: int) -> None:
        result = await self.db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                Budget.month == month,
                Budget.year == year,
                Budget.status == "active",
            )
        )
        active_budgets = list(result.scalars().all())
        for active in active_budgets:
            active.status = "archived"

    async def create_budget(self, user_id: str, data: dict) -> dict:
        await self.ensure_default_categories()

        month = int(data["month"])
        year = int(data["year"])
        status = str(data.get("status", "draft"))
        allocations_payload = data.get("allocations", [])
        resolved_allocations = await self._resolve_allocations(user_id, allocations_payload)

        valid, errors = await self.validate_proposal(
            {
                "total_income": float(data.get("total_income", 0.0)),
                "planned_savings": float(data.get("planned_savings", 0.0)),
                "allocations": [
                    {"amount": float(item.get("allocated_amount", 0.0))}
                    for item in resolved_allocations
                ],
            }
        )
        if not valid:
            raise ValueError("; ".join(errors))

        existing_draft = await self.db.scalar(
            select(Budget)
            .where(
                Budget.user_id == user_id,
                Budget.month == month,
                Budget.year == year,
                Budget.status == "draft",
            )
            .order_by(Budget.created_at.desc())
        )

        if existing_draft is not None and status == "draft":
            budget = existing_draft
            budget.total_income = float(data.get("total_income", budget.total_income))
            budget.planned_savings = float(data.get("planned_savings", budget.planned_savings))
            budget.budgeting_mode = str(data.get("budgeting_mode", budget.budgeting_mode))
            budget.strategy_source = str(data.get("strategy_source", budget.strategy_source))
        else:
            if status == "active":
                await self._archive_active_budget(user_id, month, year)
                await self.db.flush()
            budget = Budget(
                user_id=user_id,
                month=month,
                year=year,
                total_income=float(data.get("total_income", 0.0)),
                planned_savings=float(data.get("planned_savings", 0.0)),
                status=status,
                budgeting_mode=str(data.get("budgeting_mode", "50_30_20")),
                strategy_source=str(data.get("strategy_source", "deterministic")),
                approved_at=datetime.now(UTC) if status == "active" else None,
            )
            self.db.add(budget)
            await self.db.flush()

        if status == "active":
            await self._archive_active_budget(user_id, month, year)
            budget.status = "active"
            budget.approved_at = datetime.now(UTC)

        existing_allocations = await self.db.execute(
            select(BudgetAllocation).where(BudgetAllocation.budget_id == budget.id)
        )
        for allocation in existing_allocations.scalars().all():
            await self.db.delete(allocation)

        for allocation_data in resolved_allocations:
            self.db.add(
                BudgetAllocation(
                    budget_id=budget.id,
                    category_id=str(allocation_data["category_id"]),
                    allocated_amount=float(allocation_data.get("allocated_amount", 0.0)),
                )
            )

        await self.db.flush()
        return await self._serialize_budget(budget)

    async def generate_proposal(self, user_id: str, strategy_name: str, context: dict) -> dict:
        strategies = {
            "50_30_20": FiftyThirtyTwentyStrategy(),
            "zero_based": ZeroBasedStrategy(),
            "custom": CustomStrategy(),
        }

        if strategy_name == "ai_personalized":
            strategy_name = str(context.get("preferred_budget_style", "50_30_20"))
            if strategy_name == "ai_personalized":
                strategy_name = "50_30_20"

        strategy = strategies.get(strategy_name, FiftyThirtyTwentyStrategy())
        proposal = await strategy.generate(context)
        goals = context.get("goals", [])
        goal_savings = _calculate_goal_savings(goals, float(context.get("total_income", 0.0)))

        proposal["user_id"] = user_id
        proposal["goals"] = goals
        original_savings = float(proposal.get("planned_savings", 0.0))
        planned_savings = round(min(max(original_savings, goal_savings), float(context.get("total_income", 0.0))), 2)
        proposal["planned_savings"] = planned_savings
        allocations = proposal.get("allocations", [])
        allocation_total = sum(float(item.get("amount", 0.0)) for item in allocations)
        allocatable = max(float(context.get("total_income", 0.0)) - planned_savings, 0.0)
        if allocations and allocation_total and abs(allocation_total - allocatable) > 0.01:
            scale = allocatable / allocation_total
            for item in allocations:
                item["amount"] = round(float(item.get("amount", 0.0)) * scale, 2)
            correction = round(allocatable - sum(float(item.get("amount", 0.0)) for item in allocations), 2)
            allocations[-1]["amount"] = round(float(allocations[-1].get("amount", 0.0)) + correction, 2)
        return proposal

    async def generate_ai_personalized_proposal(
        self,
        user_id: str,
        context: dict,
        *,
        selected_mode: str,
        initial_only: bool,
    ) -> dict:
        prompt = self._build_ai_prompt(context, selected_mode=selected_mode, initial_only=initial_only)
        try:
            raw = await bedrock_client.invoke_with_prompt(prompt, temperature=0.2)
            parsed = self._parse_ai_response(raw)
            if parsed:
                parsed["user_id"] = user_id
                parsed = await self._enforce_mode_constraints(parsed, selected_mode, context)
                parsed["_strategy_source"] = "ai_personalized"
                return parsed
        except Exception:
            logger.exception("AI personalized budget generation failed for user %s", user_id)

        fallback_mode = selected_mode
        if fallback_mode == "ai_personalized":
            fallback_mode = str(context.get("preferred_budget_style", "50_30_20"))
            if fallback_mode == "ai_personalized":
                fallback_mode = "50_30_20"

        fallback = await self.generate_proposal(user_id, fallback_mode, context)
        fallback["reasoning"] = "AI unavailable; used deterministic fallback for selected budgeting style."
        fallback["confidence"] = 0.4
        fallback["_strategy_source"] = "deterministic_fallback"
        return fallback

    async def build_budget_context(
        self,
        user_id: str,
        month: int,
        year: int,
        budgeting_mode: str,
        *,
        custom_allocations: list[dict] | None = None,
    ) -> dict:
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        _, _, _, category_groups = await self._build_category_maps(user_id)

        total_income = float(profile.monthly_income or 0.0) if profile else 0.0
        planned_savings = 0.0
        if profile and profile.savings_priority == "aggressive":
            planned_savings = total_income * 0.3
        elif profile and profile.savings_priority == "minimal":
            planned_savings = total_income * 0.1
        else:
            planned_savings = total_income * 0.2

        goals_result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.GOAL,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        goals = []
        goal_requirements: list[dict] = []
        weighted_goal_need = 0.0
        today = date.today()
        for memory in goals_result.scalars().all():
            details = dict(memory.details or {})

            target_amount = float(details.get("target_amount", memory.amount or 0.0))
            current_amount = float(details.get("current_amount", 0.0))
            remaining_amount = max(target_amount - current_amount, 0.0)
            status = str(details.get("status", "active"))

            priority_raw = details.get("priority", 3)
            try:
                priority = int(priority_raw)
            except (TypeError, ValueError):
                priority = 3

            target_date_iso = None
            months_remaining: int | None = None
            target_date_value = details.get("target_date")
            if target_date_value:
                try:
                    if isinstance(target_date_value, date):
                        target_date = target_date_value
                    else:
                        target_date = date.fromisoformat(str(target_date_value))
                    target_date_iso = target_date.isoformat()
                    months_remaining = (target_date.year - today.year) * 12 + (target_date.month - today.month)
                    if target_date.day > today.day:
                        months_remaining += 1
                    months_remaining = max(months_remaining, 1)
                except (TypeError, ValueError):
                    target_date_iso = None

            required_monthly_contribution = None
            if remaining_amount > 0 and months_remaining:
                required_monthly_contribution = round(remaining_amount / months_remaining, 2)
                multiplier = 1.0 if priority <= 2 else 0.5
                if status != "completed":
                    weighted_goal_need += required_monthly_contribution * multiplier

            goals.append(
                {
                    "name": details.get("name", memory.title),
                    "target_amount": target_amount,
                    "current_amount": current_amount,
                    "goal_type": details.get("goal_type", memory.category),
                    "target_date": target_date_iso,
                    "priority": priority,
                    "status": status,
                    "remaining_amount": round(remaining_amount, 2),
                    "required_monthly_contribution": required_monthly_contribution,
                }
            )

            goal_requirements.append(
                {
                    "name": details.get("name", memory.title),
                    "goal_type": details.get("goal_type", memory.category),
                    "target_date": target_date_iso,
                    "priority": priority,
                    "status": status,
                    "remaining_amount": round(remaining_amount, 2),
                    "required_monthly_contribution": required_monthly_contribution,
                }
            )

        minimum_goal_savings = round(min(weighted_goal_need, total_income * 0.5), 2)

        recurring_result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.RECURRING_EXPENSE,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        recurring_expenses: list[dict] = []
        recurring_total = 0.0
        for memory in recurring_result.scalars().all():
            details = dict(memory.details or {})
            monthly_amount = float(details.get("monthly_amount", memory.amount or 0.0))
            category_slug = self._normalize_slug(
                str(details.get("category", memory.category or "miscellaneous"))
            )
            recurring_expenses.append(
                {
                    "name": details.get("name", memory.title),
                    "category_slug": category_slug,
                    "monthly_amount": round(monthly_amount, 2),
                    "currency": details.get("currency", profile.currency if profile else "USD"),
                }
            )
            recurring_total += monthly_amount

        three_months_ago = datetime.now(UTC).replace(day=1)
        three_months_ago = datetime(
            year=three_months_ago.year,
            month=max(three_months_ago.month - 3, 1),
            day=1,
            tzinfo=UTC,
        )

        tx_result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.TRANSACTION,
                FinancialMemory.is_deleted == False,  # noqa: E712
                FinancialMemory.created_at >= three_months_ago,
            )
        )
        transactions = list(tx_result.scalars().all())

        spending_by_category: dict[str, float] = defaultdict(float)
        history_months: set[tuple[int, int]] = set()
        for txn in transactions:
            category = txn.category or "miscellaneous"
            spending_by_category[category] += float(txn.amount or 0.0)
            history_months.add((txn.created_at.year, txn.created_at.month))

        pattern_result = await self.db.execute(
            select(SpendingPattern).where(
                SpendingPattern.user_id == user_id,
                SpendingPattern.status.in_([PatternStatus.ACTIVE, PatternStatus.TENTATIVE]),
            )
        )
        patterns = list(pattern_result.scalars().all())

        pattern_signals = [
            {
                "pattern_type": pattern.pattern_type.value,
                "category": pattern.category,
                "description": pattern.description,
                "confidence": round(float(pattern.confidence_score or 0.0), 3),
                "average_amount": round(float(pattern.average_amount), 2)
                if pattern.average_amount is not None
                else None,
                "predicted_amount": round(float(pattern.predicted_amount), 2)
                if pattern.predicted_amount is not None
                else None,
                "frequency_days": pattern.frequency_days,
                "next_expected_date": pattern.next_expected_date.isoformat()
                if pattern.next_expected_date
                else None,
                "day_of_week": pattern.day_of_week,
                "day_of_month": pattern.day_of_month,
                "data_points": int(pattern.data_points or 0),
            }
            for pattern in patterns
        ]

        hard_constraints = {
            "income": {
                "total_income": round(total_income, 2),
                "currency": profile.currency if profile else "USD",
            },
            "recurring_expenses": recurring_expenses,
            "recurring_expenses_total": round(recurring_total, 2),
            "goal_requirements": goal_requirements,
            "minimum_goal_savings": minimum_goal_savings,
            "available_after_savings": round(max(total_income - planned_savings, 0.0), 2),
        }
        behavioral_preferences = {
            "savings_priority": profile.savings_priority if profile else None,
            "behavior_profile": profile.behavior_profile if profile else None,
            "pattern_signals": pattern_signals,
        }

        return {
            "month": month,
            "year": year,
            "budgeting_mode": budgeting_mode,
            "preferred_budget_style": budgeting_mode,
            "category_groups": category_groups,
            "total_income": round(total_income, 2),
            "planned_savings": round(planned_savings, 2),
            "allocations": custom_allocations or [],
            "goals": goals,
            "goal_requirements": goal_requirements,
            "minimum_goal_savings": minimum_goal_savings,
            "recurring_expenses": recurring_expenses,
            "recurring_expenses_total": round(recurring_total, 2),
            "hard_constraints": hard_constraints,
            "behavioral_preferences": behavioral_preferences,
            "preferences": {
                "savings_priority": profile.savings_priority if profile else None,
                "currency": profile.currency if profile else "USD",
            },
            "insights": [profile.behavior_profile] if profile and profile.behavior_profile else [],
            "recent_spending": [
                {"category_id": category, "amount": round(amount, 2)}
                for category, amount in sorted(spending_by_category.items())
            ],
            "spending_patterns": pattern_signals,
            "history_months": len(history_months),
        }

    async def generate_budget_proposal(
        self,
        user_id: str,
        month: int,
        year: int,
        budgeting_mode: str,
        *,
        custom_allocations: list[dict] | None = None,
    ) -> dict:
        if budgeting_mode == "custom" and not custom_allocations:
            raise ValueError("custom budgeting requires at least one allocation")
        context = await self.build_budget_context(
            user_id,
            month,
            year,
            budgeting_mode,
            custom_allocations=custom_allocations,
        )

        if budgeting_mode == "ai_personalized":
            proposal = await self.generate_ai_personalized_proposal(
                user_id,
                context,
                selected_mode=budgeting_mode,
                initial_only=context.get("history_months", 0) < 3,
            )
            source = str(proposal.pop("_strategy_source", "ai_personalized"))
        else:
            proposal = await self.generate_proposal(user_id, budgeting_mode, context)
            source = "deterministic"

        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        preferences = ((profile.spending_categories or {}).get("preferred_budget_allocations", {}) if profile else {})
        if preferences and budgeting_mode != "custom":
            allocations = proposal.get("allocations", [])
            preferred_rows = []
            other_rows = []
            for item in allocations:
                slug = item.get("category_slug") or item.get("category_id")
                if slug in preferences:
                    item["amount"] = float(preferences[slug])
                    preferred_rows.append(item)
                else:
                    other_rows.append(item)
            income = float(proposal.get("total_income", 0))
            preferred_total = sum(float(item.get("amount", 0)) for item in preferred_rows)
            if preferred_total > income:
                raise ValueError("future category preferences exceed income")
            desired_other_total = max(income - float(proposal.get("planned_savings", 0)) - preferred_total, 0)
            other_total = sum(float(item.get("amount", 0)) for item in other_rows)
            if other_rows and other_total > desired_other_total:
                scale = desired_other_total / other_total
                for item in other_rows:
                    item["amount"] = round(float(item.get("amount", 0)) * scale, 2)
                correction = round(desired_other_total - sum(float(item.get("amount", 0)) for item in other_rows), 2)
                other_rows[-1]["amount"] = round(float(other_rows[-1].get("amount", 0)) + correction, 2)
            proposal["planned_savings"] = max(
                income - sum(float(item.get("amount", 0)) for item in allocations),
                0,
            )

        valid, errors = await self.validate_proposal(proposal)
        if not valid:
            raise ValueError("; ".join(errors))

        return await self.create_budget(
            user_id,
            {
                "month": month,
                "year": year,
                "total_income": proposal.get("total_income", 0.0),
                "planned_savings": proposal.get("planned_savings", 0.0),
                "status": "draft",
                "budgeting_mode": budgeting_mode,
                "strategy_source": source,
                "allocations": [
                    {
                        "category_slug": item.get("category_slug", item.get("category_id", "miscellaneous")),
                        "allocated_amount": item.get("amount", 0.0),
                    }
                    for item in proposal.get("allocations", [])
                ],
            },
        )

    async def update_draft_budget(self, user_id: str, budget_id: str, payload: dict) -> dict:
        budget = await self.db.scalar(
            select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
        )
        if not budget:
            raise ValueError("budget not found")
        if budget.status != "draft":
            raise ValueError("only draft budgets can be edited")

        allocations = payload.get("allocations")
        if allocations is not None:
            normalized = await self._resolve_allocations(user_id, allocations)
            allocation_total = sum(float(item["allocated_amount"]) for item in normalized)
            budget.planned_savings = round(float(budget.total_income) - allocation_total, 2)
            existing_allocations = await self.db.execute(
                select(BudgetAllocation).where(BudgetAllocation.budget_id == budget.id)
            )
            for allocation in existing_allocations.scalars().all():
                await self.db.delete(allocation)
            for allocation in normalized:
                self.db.add(
                    BudgetAllocation(
                        budget_id=budget.id,
                        category_id=allocation["category_id"],
                        allocated_amount=allocation["allocated_amount"],
                    )
                )

        elif "planned_savings" in payload and payload["planned_savings"] is not None:
            budget.planned_savings = float(payload["planned_savings"])

        allocation_rows = await self.db.execute(
            select(BudgetAllocation).where(BudgetAllocation.budget_id == budget.id)
        )
        current_allocations = list(allocation_rows.scalars().all())

        valid, errors = await self.validate_proposal(
            {
                "total_income": budget.total_income,
                "planned_savings": budget.planned_savings,
                "allocations": [
                    {"category_id": item.category_id, "amount": item.allocated_amount}
                    for item in current_allocations
                ],
            }
        )
        if not valid:
            raise ValueError("; ".join(errors))

        await self.db.flush()
        return await self._serialize_budget(budget)

    async def update_category_allocation(
        self, user_id: str, budget_id: str, category_id: str, amount: float, apply_to_future: bool
    ) -> dict:
        budget = await self.db.scalar(select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id))
        if not budget:
            raise ValueError("budget not found")
        if budget.status not in {"draft", "active"}:
            raise ValueError("archived budgets cannot be edited")
        allocation = await self.db.scalar(select(BudgetAllocation).where(
            BudgetAllocation.budget_id == budget_id, BudgetAllocation.category_id == category_id
        ))
        if not allocation:
            raise ValueError("category allocation not found")
        other_total = sum(float(row.allocated_amount) for row in budget.allocations if row.category_id != category_id)
        if other_total + amount > float(budget.total_income):
            raise ValueError("allocation total exceeds income")
        allocation.allocated_amount = float(amount)
        budget.planned_savings = round(float(budget.total_income) - other_total - float(amount), 2)

        category = await self.db.scalar(select(BudgetCategory).where(BudgetCategory.id == category_id))
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        if profile and category:
            settings = dict(profile.spending_categories or {})
            preferred = dict(settings.get("preferred_budget_allocations", {}))
            if apply_to_future:
                preferred[category.slug] = float(amount)
            else:
                preferred.pop(category.slug, None)
            settings["preferred_budget_allocations"] = preferred
            profile.spending_categories = settings
        await self.db.flush()
        return await self._serialize_budget(budget)

    async def get_category_detail(self, user_id: str, budget_id: str, category_id: str) -> dict:
        budget = await self.db.scalar(select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id))
        category = await self.db.scalar(select(BudgetCategory).where(BudgetCategory.id == category_id))
        allocation = await self.db.scalar(select(BudgetAllocation).where(
            BudgetAllocation.budget_id == budget_id, BudgetAllocation.category_id == category_id
        ))
        if not budget or not category or not allocation:
            raise ValueError("category detail not found")
        memories = list((await self.db.execute(select(FinancialMemory).where(
            FinancialMemory.user_id == user_id,
            FinancialMemory.memory_type == MemoryType.TRANSACTION,
            FinancialMemory.is_deleted == False,
            FinancialMemory.category == category.slug,
        ))).scalars().all())
        spent: dict[tuple[int, int], float] = defaultdict(float)
        for memory in memories:
            txn_date = memory.created_at.date()
            raw = (memory.details or {}).get("date")
            if raw:
                try: txn_date = date.fromisoformat(str(raw))
                except ValueError: pass
            spent[(txn_date.year, txn_date.month)] += float(memory.amount or 0)
        budgets = list((await self.db.execute(
            select(Budget).where(Budget.user_id == user_id).order_by(Budget.year.desc(), Budget.month.desc())
        )).scalars().unique().all())
        history = []
        seen: set[tuple[int, int]] = set()
        for item in budgets:
            key = (item.year, item.month)
            if key in seen: continue
            matching = next((a for a in item.allocations if a.category_id == category_id), None)
            if matching:
                seen.add(key)
                history.append({"month": item.month, "year": item.year, "allocated_amount": matching.allocated_amount, "spent_amount": spent[key]})
            if len(history) == 12: break
        history.reverse()
        current_spent = spent[(budget.year, budget.month)]
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        preferred = ((profile.spending_categories or {}).get("preferred_budget_allocations", {}) if profile else {})
        budget_data = await self._serialize_budget(budget)
        trailing_keys = []
        cursor_year, cursor_month = budget.year, budget.month
        for _ in range(12):
            trailing_keys.append((cursor_year, cursor_month))
            cursor_month -= 1
            if cursor_month == 0:
                cursor_month = 12; cursor_year -= 1
        return {
            "budget": budget_data,
            "category": category,
            "allocation": next(a for a in budget_data["allocations"] if a["category_id"] == category_id),
            "spent_amount": current_spent,
            "available_budget": max(float(budget.total_income) - sum(float(a.allocated_amount) for a in budget.allocations), 0),
            "average_12_months": round(sum(spent[key] for key in trailing_keys) / 12, 2),
            "apply_to_future": category.slug in preferred,
            "history": history,
        }

    async def get_draft_goals(self, user_id: str) -> list[dict]:
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        setup_goals = list((await self.db.execute(select(FinancialMemory).where(
            FinancialMemory.user_id == user_id, FinancialMemory.memory_type == MemoryType.GOAL,
            FinancialMemory.is_deleted == False,
        ).order_by(FinancialMemory.created_at))).scalars().all())
        if not profile:
            return []
        if (profile.spending_categories or {}).get("plan_goals_confirmed"):
            return []
        result = []
        for position, goal in enumerate(setup_goals):
            details = goal.details or {}
            result.append({"key": details.get("id") or (goal.source_id or f"goal-{position + 1}").removeprefix("goal:"),
                "name": goal.title, "target_amount": float(details.get("target_amount", goal.amount or 0)),
                "current_amount": float(details.get("current_amount", 0)), "target_date": details.get("target_date"),
                "goal_type": details.get("goal_type", goal.category or "other"),
                "is_primary": bool(details.get("is_primary") or goal.source_id == "primary_goal")})
        return result

    async def get_plan_goal_confirmation(self, user_id: str) -> bool:
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        return bool(profile and (profile.spending_categories or {}).get("plan_goals_confirmed"))

    def _goal_dict(self, memory: FinancialMemory, *, primary: bool = False) -> dict:
        details = memory.details or {}
        return {"id": memory.id, "key": details.get("id") or (memory.source_id or memory.id).removeprefix("goal:"), "name": memory.title,
                "target_amount": float(details.get("target_amount", memory.amount or 0)),
                "current_amount": float(details.get("current_amount", 0)), "target_date": details.get("target_date"),
                "goal_type": details.get("goal_type", memory.category or "other"), "is_primary": primary}

    async def list_plan_goals(self, user_id: str) -> list[dict]:
        goals = list((await self.db.execute(select(FinancialMemory).where(
            FinancialMemory.user_id == user_id, FinancialMemory.memory_type == MemoryType.GOAL,
            FinancialMemory.is_deleted == False,
        ).order_by(FinancialMemory.created_at))).scalars().all())
        return [self._goal_dict(g, primary=bool((g.details or {}).get("is_primary") or g.source_id == "primary_goal")) for g in goals]

    async def confirm_draft_goals(self, user_id: str, goals: list[dict]) -> list[dict]:
        memories = list((await self.db.execute(select(FinancialMemory).where(
            FinancialMemory.user_id == user_id, FinancialMemory.memory_type == MemoryType.GOAL,
            FinancialMemory.is_deleted == False))).scalars().all())
        by_key = {self._goal_dict(memory)["key"]: memory for memory in memories}
        submitted = {goal["key"] for goal in goals}
        for memory in memories:
            if self._goal_dict(memory)["key"] not in submitted:
                memory.is_deleted = True; memory.deleted_at = datetime.now(UTC)
        has_primary = any(goal.get("is_primary") for goal in goals)
        for position, goal in enumerate(goals):
            memory = by_key.get(goal["key"])
            if memory is None:
                memory = FinancialMemory(user_id=user_id, memory_type=MemoryType.GOAL, source="plan", source_id=f"goal:{goal['key']}")
                self.db.add(memory)
            memory.title = goal["name"]; memory.content = f"Plan goal: {goal['name']}"; memory.amount = goal["target_amount"]; memory.category = goal["goal_type"]
            memory.details = {**(memory.details or {}), **{k: goal.get(k) for k in ("target_amount", "current_amount", "target_date", "goal_type")},
                              "id": goal["key"], "position": position, "is_primary": bool(goal.get("is_primary") or (not has_primary and position == 0))}
        profile = await self.db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
        if profile:
            settings = dict(profile.spending_categories or {}); settings["plan_goals_confirmed"] = True; profile.spending_categories = settings
        await self.db.flush()
        return await self.list_plan_goals(user_id)

    async def create_plan_goal(self, user_id: str, data: dict) -> dict:
        existing_count = await self.db.scalar(select(func.count()).select_from(FinancialMemory).where(
            FinancialMemory.user_id == user_id, FinancialMemory.memory_type == MemoryType.GOAL,
            FinancialMemory.is_deleted == False))
        details = dict(data)
        details.update({"is_primary": not existing_count, "status": "active"})
        memory = FinancialMemory(user_id=user_id, memory_type=MemoryType.GOAL, title=data["name"],
            content=f"Plan goal: {data['name']}", amount=data["target_amount"], category=data.get("goal_type", "other"),
            details=details, source="plan", source_id=f"plan-{datetime.now(UTC).timestamp()}")
        self.db.add(memory); await self.db.flush(); return self._goal_dict(memory, primary=not existing_count)

    async def update_plan_goal(self, user_id: str, goal_id: str, data: dict) -> dict:
        memory = await self.db.scalar(select(FinancialMemory).where(
            FinancialMemory.id == goal_id, FinancialMemory.user_id == user_id,
            FinancialMemory.memory_type == MemoryType.GOAL, FinancialMemory.is_deleted == False))
        if not memory: raise ValueError("goal not found")
        details = dict(memory.details or {}); details.update(data)
        memory.title = data.get("name", memory.title); memory.amount = data.get("target_amount", memory.amount)
        memory.category = data.get("goal_type", memory.category); memory.details = details
        memory.content = f"Financial goal: {memory.title}"
        await self.db.flush(); return self._goal_dict(memory, primary=memory.source == "financial_setup")

    async def approve_budget(self, user_id: str, budget_id: str) -> dict:
        budget = await self.db.scalar(
            select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
        )
        if not budget:
            raise ValueError("budget not found")
        if budget.status != "draft":
            raise ValueError("only draft budgets can be approved")

        allocation_rows = await self.db.execute(
            select(BudgetAllocation).where(BudgetAllocation.budget_id == budget.id)
        )
        current_allocations = list(allocation_rows.scalars().all())

        valid, errors = await self.validate_proposal(
            {
                "total_income": budget.total_income,
                "planned_savings": budget.planned_savings,
                "allocations": [
                    {"category_id": item.category_id, "amount": item.allocated_amount}
                    for item in current_allocations
                ],
            }
        )
        if not valid:
            raise ValueError("; ".join(errors))

        await self._archive_active_budget(user_id, budget.month, budget.year)
        # Flush archival before activating the replacement so the partial unique
        # index is never transiently violated.
        await self.db.flush()
        budget.status = "active"
        budget.approved_at = datetime.now(UTC)
        await self.db.flush()
        return await self._serialize_budget(budget)

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

    async def get_budget_progress(self, user_id: str, month: int, year: int) -> dict:
        budget_data = await self.get_budget_for_month(user_id, month, year, status="active")
        if not budget_data:
            raise ValueError("active budget not found")

        memory_rows = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.TRANSACTION,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        txns = []
        for transaction in memory_rows.scalars().all():
            transaction_date = transaction.created_at.date()
            raw_date = (transaction.details or {}).get("date")
            if raw_date:
                try:
                    transaction_date = date.fromisoformat(str(raw_date))
                except ValueError:
                    pass
            if transaction_date.month == month and transaction_date.year == year:
                txns.append(transaction)

        spent_by_category: dict[str, float] = defaultdict(float)
        for txn in txns:
            spent_by_category[txn.category or "miscellaneous"] += float(txn.amount or 0.0)

        category_progress = []
        total_allocated = 0.0
        for allocation in budget_data.get("allocations", []):
            category_id = allocation["category_id"]
            category_slug = allocation.get("category_slug", allocation.get("category_id", "miscellaneous"))
            allocated = float(allocation["allocated_amount"])
            spent = float(spent_by_category.get(category_slug, 0.0))
            remaining = max(allocated - spent, 0.0)
            used = (spent / allocated) * 100 if allocated > 0 else 0.0
            category_progress.append(
                {
                    "category_id": category_id,
                    "category_slug": category_slug,
                    "allocated_amount": round(allocated, 2),
                    "spent_amount": round(spent, 2),
                    "remaining_amount": round(remaining, 2),
                    "percentage_used": round(min(used, 999.0), 2),
                    "near_limit": used >= 80.0,
                }
            )
            total_allocated += allocated

        total_spent = sum(spent_by_category.values())
        total_remaining = max(total_allocated - total_spent, 0.0)
        utilization = (total_spent / total_allocated) * 100 if total_allocated > 0 else 0.0
        savings_target = float(budget_data.get("planned_savings", 0.0))
        estimated_savings = max(float(budget_data.get("total_income", 0.0)) - total_spent, 0.0)
        savings_progress = (
            (estimated_savings / savings_target) * 100 if savings_target > 0 else 0.0
        )

        return {
            "budget": budget_data,
            "total_allocated": round(total_allocated, 2),
            "total_spent": round(total_spent, 2),
            "total_remaining": round(total_remaining, 2),
            "budget_utilization_percent": round(min(utilization, 999.0), 2),
            "savings_progress": round(min(savings_progress, 999.0), 2),
            "categories": category_progress,
        }

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
            category_id = str(allocation.get("category_id", ""))
            category_slug = str(
                allocation.get("category_slug", allocation.get("category_id", "miscellaneous"))
            )
            allocated_amount = float(allocation.get("allocated_amount", 0.0))
            actual_amount = 0.0
            for entry in actual_spending:
                entry_slug = str(entry.get("category_slug", entry.get("category_id", "miscellaneous")))
                if entry_slug == category_slug:
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
                        "category_slug": category_slug,
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
                    if str(item.get("category_slug", item.get("category_id", "miscellaneous"))) != category_slug
                    and float(item.get("allocated_amount", 0.0)) > 0
                ]
                if source_candidates:
                    source = source_candidates[0]
                    source_category_id = str(source.get("category_id", ""))
                    source_category_slug = str(source.get("category_slug", source.get("category_id", "miscellaneous")))
                    source_remaining = max(float(source.get("allocated_amount", 0.0)), 0.0)
                    adjustment_amount = min(source_remaining, max(abs(delta) * 0.5, 25.0))
                    if adjustment_amount > 0:
                        adjustments.append(
                            {
                                "category_id": source_category_id,
                                "category_slug": source_category_slug,
                                "reduction_amount": round(adjustment_amount, 2),
                                "from_category": source_category_slug,
                                "to_category": "savings",
                                "reason": "rebalance suggestion only; active budget remains unchanged",
                            }
                        )

        return {
            "user_id": user_id,
            "month": month,
            "year": year,
            "discrepancies": discrepancies,
            "adjustments": adjustments,
        }

    def _build_ai_prompt(self, context: dict, *, selected_mode: str, initial_only: bool) -> str:
        income = float(context.get("total_income", 0.0))
        goals = context.get("goals", [])
        preferences = context.get("preferences", {})
        mode_hint = str(context.get("preferred_budget_style", "50_30_20"))
        if mode_hint == "ai_personalized":
            mode_hint = "50_30_20"

        hard_constraints = context.get("hard_constraints", {})
        if not hard_constraints:
            hard_constraints = {
                "income": {
                    "total_income": income,
                    "currency": preferences.get("currency", "USD"),
                },
                "recurring_expenses": context.get("recurring_expenses", []),
                "recurring_expenses_total": context.get("recurring_expenses_total", 0.0),
                "goal_requirements": context.get("goal_requirements", goals),
                "minimum_goal_savings": context.get("minimum_goal_savings", 0.0),
            }

        behavioral_preferences = context.get("behavioral_preferences", {})
        if not behavioral_preferences:
            behavioral_preferences = {
                "savings_priority": preferences.get("savings_priority"),
                "behavior_profile": context.get("insights", []),
                "pattern_signals": context.get("spending_patterns", []),
            }

        if initial_only:
            history_block = "Historical data is limited. Do not assume spending patterns."
            context_block = {
                "hard_constraints": hard_constraints,
                "behavioral_preferences": behavioral_preferences,
                "budget_style": mode_hint,
            }
        else:
            history_block = "Use recent spending, patterns, and insights when available."
            context_block = {
                "hard_constraints": hard_constraints,
                "behavioral_preferences": behavioral_preferences,
                "budget_style": mode_hint,
                "recent_spending": context.get("recent_spending", []),
                "history_months": context.get("history_months", 0),
            }

        return (
            "You are generating a monthly budget proposal as strict JSON only. "
            "Return keys: total_income, planned_savings, allocations, strategy, reasoning, confidence. "
            "Each allocation item must include category_slug and amount. "
            "Treat hard_constraints as non-negotiable financial guardrails. "
            "Use behavioral_preferences as soft personalization signals only. "
            "Behavior profile is already aggregated from prior decisions; do not assume access to raw decision history. "
            f"Keep the budget philosophy aligned with: {mode_hint}. "
            f"Generation mode requested: {selected_mode}. "
            f"{history_block} "
            f"Context: {json.dumps(context_block, default=str)}. "
            "Allocations must sum to total_income - planned_savings."
        )

    def _parse_ai_response(self, raw: str) -> dict | None:
        try:
            text = raw.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\\s*", "", text)
                text = re.sub(r"\\s*```$", "", text)
            payload = json.loads(text)
            if not isinstance(payload, dict):
                return None
            return {
                "total_income": float(payload.get("total_income", 0.0)),
                "planned_savings": float(payload.get("planned_savings", 0.0)),
                "allocations": [
                    {
                        "category_slug": item.get("category_slug", item.get("category_id", "miscellaneous")),
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

    async def _enforce_mode_constraints(self, proposal: dict, selected_mode: str, context: dict) -> dict:
        mode = selected_mode
        if mode == "ai_personalized":
            mode = str(context.get("preferred_budget_style", "50_30_20"))
            if mode == "ai_personalized":
                mode = "50_30_20"

        if mode not in {"50_30_20", "zero_based", "custom"}:
            mode = "50_30_20"

        deterministic = await self.generate_proposal("synthetic-user", mode, context)
        merged = dict(proposal)

        if mode == "custom":
            if not context.get("allocations"):
                merged["allocations"] = deterministic["allocations"]
                merged["planned_savings"] = deterministic["planned_savings"]
            return merged

        total_income = float(proposal.get("total_income", context.get("total_income", 0.0)))
        deterministic_savings = float(deterministic.get("planned_savings", 0.0))
        merged["total_income"] = total_income
        merged["planned_savings"] = deterministic_savings

        allocation_cap = max(total_income - deterministic_savings, 0.0)
        ai_allocations = [
            {
                "category_slug": str(item.get("category_slug", item.get("category_id", "miscellaneous"))),
                "amount": max(float(item.get("amount", 0.0)), 0.0),
            }
            for item in proposal.get("allocations", [])
        ]
        if not ai_allocations:
            merged["allocations"] = deterministic["allocations"]
            return merged

        total_ai = sum(item["amount"] for item in ai_allocations)
        if total_ai <= 0:
            merged["allocations"] = deterministic["allocations"]
            return merged

        scale = allocation_cap / total_ai
        scaled = []
        for item in ai_allocations:
            scaled.append(
                {
                    "category_slug": item["category_slug"],
                    "amount": round(item["amount"] * scale, 2),
                }
            )

        correction = round(allocation_cap - sum(item["amount"] for item in scaled), 2)
        if scaled and correction != 0:
            scaled[-1]["amount"] = round(scaled[-1]["amount"] + correction, 2)

        merged["allocations"] = scaled
        return merged

    async def _serialize_budget(self, budget: Budget) -> dict:
        budget_state = getattr(budget, "__dict__", {})
        allocations_data = []
        if hasattr(self.db, "execute"):
            try:
                result = await self.db.execute(
                    select(BudgetAllocation).where(BudgetAllocation.budget_id == budget.id)
                )
                allocation_rows = list(result.scalars().all())
            except Exception:
                allocation_rows = list(getattr(budget, "allocations", []))
        else:
            allocation_rows = list(getattr(budget, "allocations", []))

        category_id_set = {allocation.category_id for allocation in allocation_rows if allocation.category_id}
        categories_by_id: dict[str, BudgetCategory] = {}
        if category_id_set:
            try:
                category_result = await self.db.execute(
                    select(BudgetCategory).where(BudgetCategory.id.in_(category_id_set))
                )
                categories_by_id = {category.id: category for category in category_result.scalars().all()}
            except Exception:
                categories_by_id = {}

        for allocation in allocation_rows:
            category = categories_by_id.get(allocation.category_id)
            allocations_data.append(
                {
                    "id": allocation.id,
                    "budget_id": allocation.budget_id,
                    "category_id": allocation.category_id,
                    "category_slug": category.slug if category else getattr(allocation, "category_slug", None),
                    "allocated_amount": allocation.allocated_amount,
                    "created_at": allocation.created_at,
                    "updated_at": allocation.updated_at,
                }
            )

        return {
            "id": budget_state.get("id"),
            "user_id": budget_state.get("user_id"),
            "month": budget_state.get("month"),
            "year": budget_state.get("year"),
            "total_income": budget_state.get("total_income", 0.0),
            "planned_savings": budget_state.get("planned_savings", 0.0),
            "status": budget_state.get("status", "draft"),
            "budgeting_mode": budget_state.get("budgeting_mode", "50_30_20"),
            "strategy_source": budget_state.get("strategy_source", "deterministic"),
            "approved_at": budget_state.get("approved_at"),
            "allocations": allocations_data,
            "created_at": budget_state.get("created_at"),
            "updated_at": budget_state.get("updated_at"),
        }
