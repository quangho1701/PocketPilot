from __future__ import annotations

from abc import ABC, abstractmethod

def _distribute_evenly(total: float, categories: list[str]) -> list[dict]:
    if total <= 0 or not categories:
        return []
    per_bucket = round(total / len(categories), 2)
    allocations = [{"category_slug": slug, "amount": per_bucket} for slug in categories]
    correction = round(total - sum(item["amount"] for item in allocations), 2)
    if allocations and correction != 0:
        allocations[-1]["amount"] = round(allocations[-1]["amount"] + correction, 2)
    return allocations


def _normalize_weights(values: dict[str, float]) -> dict[str, float]:
    total = sum(max(v, 0.0) for v in values.values())
    if total <= 0:
        equal = 1.0 / max(len(values), 1)
        return {key: equal for key in values}
    return {key: max(value, 0.0) / total for key, value in values.items()}


def _group_categories(context: dict, group: str) -> list[str]:
    groups = context.get("category_groups") or {}
    values = groups.get(group, [])
    return [str(item) for item in values if item]


def _non_savings_categories(context: dict) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for group in ("needs", "wants"):
        for slug in _group_categories(context, group):
            if slug not in seen:
                seen.add(slug)
                ordered.append(slug)
    return ordered


def _merge_allocation_amounts(rows: list[dict]) -> list[dict]:
    merged: dict[str, float] = {}
    order: list[str] = []
    for row in rows:
        slug = str(row.get("category_slug", "")).strip()
        if not slug:
            continue
        amount = max(float(row.get("amount", 0.0)), 0.0)
        if slug not in merged:
            merged[slug] = 0.0
            order.append(slug)
        merged[slug] += amount

    allocations = [{"category_slug": slug, "amount": round(merged[slug], 2)} for slug in order]
    correction = round(sum(float(row.get("amount", 0.0)) for row in rows) - sum(item["amount"] for item in allocations), 2)
    if allocations and correction != 0:
        allocations[-1]["amount"] = round(allocations[-1]["amount"] + correction, 2)
    return allocations


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

        needs_categories = _group_categories(context, "needs")
        wants_categories = _group_categories(context, "wants")
        fallback_categories = _non_savings_categories(context)

        if not needs_categories:
            needs_categories = fallback_categories
        if not wants_categories:
            wants_categories = fallback_categories

        allocations = _distribute_evenly(needs, needs_categories)
        allocations.extend(_distribute_evenly(wants, wants_categories))
        allocations = _merge_allocation_amounts(allocations)

        return {
            "strategy": "50_30_20",
            "total_income": income,
            "planned_savings": round(savings, 2),
            "allocations": allocations,
        }


class ZeroBasedStrategy(BudgetProposal):
    async def generate(self, context: dict) -> dict:
        income = float(context.get("total_income", 0.0))
        baseline_savings = float(context.get("planned_savings", 0.0))
        goal_savings_floor = float(context.get("minimum_goal_savings", 0.0))
        planned_savings = max(baseline_savings, goal_savings_floor)
        planned_savings = min(max(planned_savings, 0.0), max(income, 0.0))

        needs_categories = _group_categories(context, "needs")
        wants_categories = _group_categories(context, "wants")
        non_savings_categories = _non_savings_categories(context)

        recurring_rows = context.get("recurring_expenses", []) or []
        recurring_by_slug: dict[str, float] = {}
        for item in recurring_rows:
            slug = str(item.get("category_slug") or item.get("category_id") or "").strip()
            if not slug:
                continue
            amount = max(float(item.get("monthly_amount", 0.0)), 0.0)
            recurring_by_slug[slug] = recurring_by_slug.get(slug, 0.0) + amount

        allocatable_total = max(income - planned_savings, 0.0)
        baseline_allocations: list[dict] = []
        baseline_sum = 0.0
        for slug in non_savings_categories:
            recurring_amount = recurring_by_slug.get(slug, 0.0)
            if recurring_amount > 0:
                baseline_allocations.append({"category_slug": slug, "amount": recurring_amount})
                baseline_sum += recurring_amount

        if baseline_sum > allocatable_total and baseline_sum > 0:
            scale = allocatable_total / baseline_sum
            scaled = [
                {
                    "category_slug": row["category_slug"],
                    "amount": round(row["amount"] * scale, 2),
                }
                for row in baseline_allocations
            ]
            correction = round(allocatable_total - sum(item["amount"] for item in scaled), 2)
            if scaled and correction != 0:
                scaled[-1]["amount"] = round(scaled[-1]["amount"] + correction, 2)
            allocations = scaled
        else:
            remaining = max(allocatable_total - baseline_sum, 0.0)
            weights = _normalize_weights({"needs": 0.7, "wants": 0.3})
            needs_extra = remaining * weights["needs"]
            wants_extra = remaining * weights["wants"]

            if not needs_categories and not wants_categories:
                needs_categories = non_savings_categories

            allocations = list(baseline_allocations)
            allocations.extend(_distribute_evenly(needs_extra, needs_categories))
            allocations.extend(_distribute_evenly(wants_extra, wants_categories))
            allocations = _merge_allocation_amounts(allocations)

        return {
            "strategy": "zero_based",
            "total_income": income,
            "planned_savings": round(planned_savings, 2),
            "allocations": allocations,
        }


class CustomStrategy(BudgetProposal):
    async def generate(self, context: dict) -> dict:
        allocations = context.get("allocations", [])
        allocation_total = sum(max(float(item.get("amount", 0.0)), 0.0) for item in allocations)
        income = max(float(context.get("total_income", 0.0)), 0.0)
        return {
            "strategy": "custom",
            "total_income": income,
            "planned_savings": round(max(income - allocation_total, 0.0), 2),
            "allocations": [
                {
                    "category_slug": item.get("category_slug", item.get("category_id", "miscellaneous")),
                    "amount": float(item.get("amount", 0.0)),
                }
                for item in allocations
            ],
        }
