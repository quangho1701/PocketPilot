from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_memory import FinancialMemory, MemoryType
from app.models.spending_pattern import PatternStatus, PatternType, SpendingPattern
from app.models.user_decision import DecisionOutcome, DecisionType, UserDecision
from app.models.user_profile import UserProfile
from app.schemas.spending_pattern import PatternFeedResponse, SpendingPatternResponse
from app.schemas.user_decision import (
    DecisionFeedback,
    DecisionRecord,
    DecisionResponse,
    LearningInsight,
)

logger = logging.getLogger(__name__)


class LearningService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Decision tracking ---

    async def record_decision(self, user_id: str, data: DecisionRecord) -> UserDecision:
        outcome = (
            DecisionOutcome.FOLLOWED
            if data.ai_recommendation == data.user_decision
            else DecisionOutcome.OVERRIDDEN
        )

        decision = UserDecision(
            user_id=user_id,
            item_description=data.item_description,
            amount=data.amount,
            category=data.category,
            ai_recommendation=data.ai_recommendation,
            ai_reasoning=data.ai_reasoning,
            user_decision=data.user_decision,
            outcome=outcome,
            context_snapshot=data.context_snapshot,
        )
        self.db.add(decision)
        await self.db.flush()
        return decision

    async def update_decision_feedback(
        self, user_id: str, decision_id: str, feedback: DecisionFeedback
    ) -> Optional[UserDecision]:
        result = await self.db.execute(
            select(UserDecision).where(
                UserDecision.id == decision_id,
                UserDecision.user_id == user_id,
            )
        )
        decision = result.scalar_one_or_none()
        if not decision:
            return None

        decision.was_helpful = feedback.was_helpful
        decision.user_feedback = feedback.user_feedback
        await self.db.flush()
        return decision

    async def get_decision_history(
        self, user_id: str, limit: int = 20
    ) -> list[UserDecision]:
        result = await self.db.execute(
            select(UserDecision)
            .where(UserDecision.user_id == user_id)
            .order_by(UserDecision.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # --- Pattern detection ---

    async def detect_patterns(self, user_id: str) -> list[SpendingPattern]:
        """Analyze transaction memories to detect spending patterns."""
        ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)

        result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.TRANSACTION,
                FinancialMemory.is_deleted == False,  # noqa: E712
                FinancialMemory.created_at >= ninety_days_ago,
            ).order_by(FinancialMemory.created_at)
        )
        transactions = list(result.scalars().all())

        if not transactions:
            return []

        by_category: dict[str, list[FinancialMemory]] = defaultdict(list)
        for txn in transactions:
            if txn.category:
                by_category[txn.category].append(txn)

        detected: list[SpendingPattern] = []

        for category, txns in by_category.items():
            if len(txns) < 2:
                continue

            recurring = self._detect_recurring(user_id, category, txns)
            if recurring:
                detected.append(recurring)

            trend = self._detect_trend(user_id, category, txns)
            if trend:
                detected.append(trend)

            behavioral = self._detect_behavioral(user_id, category, txns)
            if behavioral:
                detected.append(behavioral)

        for pattern in detected:
            await self._upsert_pattern(pattern)

        await self._expire_stale_patterns(user_id)
        await self.db.flush()

        return detected

    async def get_active_patterns(self, user_id: str) -> list[SpendingPattern]:
        result = await self.db.execute(
            select(SpendingPattern).where(
                SpendingPattern.user_id == user_id,
                SpendingPattern.status.in_([PatternStatus.ACTIVE, PatternStatus.TENTATIVE]),
            ).order_by(SpendingPattern.confidence_score.desc())
        )
        return list(result.scalars().all())

    async def get_pattern_feed(self, user_id: str) -> PatternFeedResponse:
        """Provide pattern data for the budget service."""
        patterns = await self.get_active_patterns(user_id)

        recurring = [
            SpendingPatternResponse.model_validate(p)
            for p in patterns
            if p.pattern_type == PatternType.RECURRING
        ]
        behavioral = [
            SpendingPatternResponse.model_validate(p)
            for p in patterns
            if p.pattern_type in (PatternType.BEHAVIORAL, PatternType.TREND)
        ]

        predictions = await self.predict_upcoming_expenses(user_id)

        return PatternFeedResponse(
            recurring_expenses=recurring,
            behavioral_patterns=behavioral,
            predicted_upcoming=predictions,
        )

    # --- Behavior profile ---

    async def update_behavior_profile(self, user_id: str) -> dict:
        """Compute and store behavioral profile based on decision history."""
        decisions = await self.get_decision_history(user_id, limit=100)

        if not decisions:
            return {}

        total = len(decisions)
        followed = sum(1 for d in decisions if d.outcome == DecisionOutcome.FOLLOWED)
        follow_rate = followed / total if total > 0 else 0.0

        category_stats: dict[str, dict] = defaultdict(
            lambda: {"total": 0, "overridden": 0, "total_amount": 0.0}
        )
        for d in decisions:
            stats = category_stats[d.category]
            stats["total"] += 1
            stats["total_amount"] += d.amount
            if d.outcome == DecisionOutcome.OVERRIDDEN:
                stats["overridden"] += 1

        category_preferences = {}
        for cat, stats in category_stats.items():
            category_preferences[cat] = {
                "override_rate": stats["overridden"] / stats["total"],
                "avg_amount": stats["total_amount"] / stats["total"],
                "decision_count": stats["total"],
            }

        helpful_count = sum(1 for d in decisions if d.was_helpful is True)
        feedback_count = sum(1 for d in decisions if d.was_helpful is not None)

        profile = {
            "follow_rate": round(follow_rate, 3),
            "total_decisions": total,
            "category_preferences": category_preferences,
            "helpfulness_rate": (
                round(helpful_count / feedback_count, 3) if feedback_count > 0 else None
            ),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        result = await self.db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        user_profile = result.scalar_one_or_none()
        if user_profile:
            user_profile.behavior_profile = profile
            user_profile.last_learning_update = datetime.now(timezone.utc)
            await self.db.flush()

        return profile

    # --- Predictions ---

    async def predict_upcoming_expenses(
        self, user_id: str, days_ahead: int = 30
    ) -> list[dict]:
        """Predict upcoming expenses based on active recurring patterns."""
        result = await self.db.execute(
            select(SpendingPattern).where(
                SpendingPattern.user_id == user_id,
                SpendingPattern.status == PatternStatus.ACTIVE,
                SpendingPattern.pattern_type == PatternType.RECURRING,
            )
        )
        patterns = list(result.scalars().all())

        predictions = []
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=days_ahead)

        for pattern in patterns:
            if not pattern.frequency_days or not pattern.average_amount:
                continue

            next_date = pattern.next_expected_date or (
                now + timedelta(days=pattern.frequency_days)
            )

            while next_date <= horizon:
                predictions.append({
                    "category": pattern.category,
                    "description": pattern.description,
                    "amount": pattern.predicted_amount or pattern.average_amount,
                    "expected_date": next_date.isoformat(),
                    "confidence": pattern.confidence_score,
                })
                next_date += timedelta(days=pattern.frequency_days)

        predictions.sort(key=lambda p: p["expected_date"])
        return predictions

    # --- Learning insights ---

    async def get_learning_insights(self, user_id: str) -> LearningInsight:
        decisions = await self.get_decision_history(user_id, limit=100)
        total = len(decisions)
        followed = sum(1 for d in decisions if d.outcome == DecisionOutcome.FOLLOWED)

        category_preferences: dict[str, dict] = {}
        category_groups: dict[str, list] = defaultdict(list)
        for d in decisions:
            category_groups[d.category].append(d)

        for cat, group in category_groups.items():
            overridden = sum(1 for d in group if d.outcome == DecisionOutcome.OVERRIDDEN)
            category_preferences[cat] = {
                "override_rate": round(overridden / len(group), 3),
                "avg_amount": round(sum(d.amount for d in group) / len(group), 2),
            }

        notes = self._generate_behavioral_notes(decisions, category_preferences)

        return LearningInsight(
            total_decisions=total,
            follow_rate=round(followed / total, 3) if total > 0 else 0.0,
            category_preferences=category_preferences,
            behavioral_notes=notes,
        )

    # --- Private helpers ---

    def _detect_recurring(
        self, user_id: str, category: str, txns: list[FinancialMemory]
    ) -> Optional[SpendingPattern]:
        """Detect recurring spending (similar amounts at regular intervals)."""
        if len(txns) < 3:
            return None

        amounts = [t.amount for t in txns if t.amount]
        if not amounts:
            return None

        avg_amount = sum(amounts) / len(amounts)
        amount_variance = sum((a - avg_amount) ** 2 for a in amounts) / len(amounts)
        amount_std = math.sqrt(amount_variance)

        is_consistent_amount = amount_std / avg_amount < 0.3 if avg_amount > 0 else False

        dates = sorted(t.created_at for t in txns)
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not intervals:
            return None

        avg_interval = sum(intervals) / len(intervals)
        if avg_interval < 1:
            return None

        interval_variance = sum((i - avg_interval) ** 2 for i in intervals) / len(intervals)
        interval_std = math.sqrt(interval_variance)
        is_regular = interval_std / avg_interval < 0.4 if avg_interval > 0 else False

        if not (is_consistent_amount and is_regular):
            return None

        confidence = min(0.95, 0.4 + (len(txns) * 0.1))
        status = PatternStatus.ACTIVE if confidence >= 0.7 else PatternStatus.TENTATIVE

        next_expected = dates[-1] + timedelta(days=int(avg_interval))

        return SpendingPattern(
            user_id=user_id,
            pattern_type=PatternType.RECURRING,
            status=status,
            category=category,
            description=f"Recurring {category} expense ~${avg_amount:.0f} every {int(avg_interval)} days",
            average_amount=round(avg_amount, 2),
            frequency_days=int(avg_interval),
            confidence_score=round(confidence, 3),
            data_points=len(txns),
            pattern_data={"amounts": amounts, "intervals": intervals},
            next_expected_date=next_expected,
            predicted_amount=round(avg_amount, 2),
        )

    def _detect_trend(
        self, user_id: str, category: str, txns: list[FinancialMemory]
    ) -> Optional[SpendingPattern]:
        """Detect trending patterns (increasing or decreasing spending)."""
        if len(txns) < 5:
            return None

        amounts = [t.amount for t in txns if t.amount]
        if len(amounts) < 5:
            return None

        first_half = amounts[: len(amounts) // 2]
        second_half = amounts[len(amounts) // 2 :]

        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)

        if avg_first == 0:
            return None

        change_pct = (avg_second - avg_first) / avg_first

        if abs(change_pct) < 0.15:
            return None

        direction = "increasing" if change_pct > 0 else "decreasing"
        confidence = min(0.85, 0.3 + (len(amounts) * 0.05))

        return SpendingPattern(
            user_id=user_id,
            pattern_type=PatternType.TREND,
            status=PatternStatus.TENTATIVE if confidence < 0.7 else PatternStatus.ACTIVE,
            category=category,
            description=f"{category} spending {direction} by {abs(change_pct)*100:.0f}%",
            average_amount=round(avg_second, 2),
            confidence_score=round(confidence, 3),
            data_points=len(amounts),
            pattern_data={
                "change_percent": round(change_pct, 3),
                "direction": direction,
                "avg_first_half": round(avg_first, 2),
                "avg_second_half": round(avg_second, 2),
            },
        )

    def _detect_behavioral(
        self, user_id: str, category: str, txns: list[FinancialMemory]
    ) -> Optional[SpendingPattern]:
        """Detect behavioral patterns (day-of-week spending habits)."""
        if len(txns) < 5:
            return None

        day_counts: dict[int, int] = defaultdict(int)
        for t in txns:
            day_counts[t.created_at.weekday()] += 1

        if not day_counts:
            return None

        total = sum(day_counts.values())
        peak_day = max(day_counts, key=day_counts.get)  # type: ignore[arg-type]
        peak_ratio = day_counts[peak_day] / total

        if peak_ratio < 0.35:
            return None

        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        confidence = min(0.8, 0.3 + (total * 0.04))

        return SpendingPattern(
            user_id=user_id,
            pattern_type=PatternType.BEHAVIORAL,
            status=PatternStatus.TENTATIVE if confidence < 0.6 else PatternStatus.ACTIVE,
            category=category,
            description=f"{category} spending peaks on {day_names[peak_day]}s ({peak_ratio*100:.0f}% of transactions)",
            day_of_week=peak_day,
            confidence_score=round(confidence, 3),
            data_points=total,
            pattern_data={
                "day_distribution": dict(day_counts),
                "peak_day": peak_day,
                "peak_ratio": round(peak_ratio, 3),
            },
        )

    async def _upsert_pattern(self, pattern: SpendingPattern) -> None:
        """Insert or update a pattern (match on user + type + category)."""
        result = await self.db.execute(
            select(SpendingPattern).where(
                SpendingPattern.user_id == pattern.user_id,
                SpendingPattern.pattern_type == pattern.pattern_type,
                SpendingPattern.category == pattern.category,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.description = pattern.description
            existing.average_amount = pattern.average_amount
            existing.frequency_days = pattern.frequency_days
            existing.confidence_score = pattern.confidence_score
            existing.data_points = pattern.data_points
            existing.pattern_data = pattern.pattern_data
            existing.next_expected_date = pattern.next_expected_date
            existing.predicted_amount = pattern.predicted_amount
            existing.status = pattern.status
            existing.day_of_week = pattern.day_of_week
        else:
            self.db.add(pattern)

    async def _expire_stale_patterns(self, user_id: str) -> None:
        """Mark patterns as expired if no recent supporting data."""
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        result = await self.db.execute(
            select(SpendingPattern).where(
                SpendingPattern.user_id == user_id,
                SpendingPattern.status != PatternStatus.EXPIRED,
                SpendingPattern.updated_at < thirty_days_ago,
            )
        )
        stale = result.scalars().all()
        for pattern in stale:
            pattern.status = PatternStatus.EXPIRED

    def _generate_behavioral_notes(
        self, decisions: list[UserDecision], category_prefs: dict
    ) -> list[str]:
        """Generate human-readable behavioral insights."""
        notes: list[str] = []

        if not decisions:
            return ["No decision history yet."]

        total = len(decisions)
        followed = sum(1 for d in decisions if d.outcome == DecisionOutcome.FOLLOWED)
        follow_rate = followed / total

        if follow_rate > 0.8:
            notes.append("You generally follow AI recommendations closely.")
        elif follow_rate < 0.4:
            notes.append("You often override AI recommendations — your preferences may differ from the model's defaults.")

        for cat, prefs in category_prefs.items():
            if prefs["override_rate"] > 0.6:
                notes.append(
                    f"In '{cat}', you frequently override suggestions (override rate: {prefs['override_rate']*100:.0f}%)."
                )

        buy_decisions = [d for d in decisions if d.user_decision == DecisionType.BUY]
        if buy_decisions:
            avg_buy = sum(d.amount for d in buy_decisions) / len(buy_decisions)
            notes.append(f"Average purchase amount when you choose 'buy': ${avg_buy:.2f}")

        return notes if notes else ["Building behavioral profile — more data needed."]
