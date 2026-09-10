# Business logic for OCR Expense Categorization + Transaction Management
from __future__ import annotations

import math
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, TypedDict

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_category import BudgetCategory
from app.models.financial_memory import FinancialMemory, MemoryImportance, MemoryType
from app.models.transaction import Transaction, TransactionType
from app.schemas.transaction import (
    DashboardCategorySummary,
    DashboardCurrencySummary,
    DashboardTrendPoint,
    DashboardResponse,
    TransactionCreate,
    TransactionFilter,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdate,
)


class CurrencyTotals(TypedDict):
    income: Decimal
    expense: Decimal
    count: int


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_transaction(
        self, user_id: str, data: TransactionCreate
    ) -> Transaction:
        category = await self._ensure_category_access(user_id, data.category_id)

        transaction = Transaction(
            user_id=user_id,
            **data.model_dump(exclude={"category", "date"}) | {"category_id": category.id},
        )
        self.db.add(transaction)
        await self.db.flush()
        await self._sync_budget_memory(transaction, category)
        return transaction

    async def list_transactions(
        self, user_id: str, filters: TransactionFilter
    ) -> TransactionListResponse:
        query = select(Transaction).where(Transaction.user_id == user_id)

        if filters.transaction_type is not None:
            query = query.where(Transaction.transaction_type == filters.transaction_type)
        if filters.category_id is not None:
            query = query.where(Transaction.category_id == filters.category_id)
        if filters.source is not None:
            query = query.where(Transaction.source == filters.source)
        if filters.merchant:
            query = query.where(Transaction.merchant.ilike(f"%{filters.merchant}%"))
        if filters.payment_method:
            query = query.where(
                Transaction.payment_method.ilike(f"%{filters.payment_method}%")
            )
        if filters.date_from is not None:
            query = query.where(Transaction.transaction_date >= filters.date_from)
        if filters.date_to is not None:
            query = query.where(Transaction.transaction_date <= filters.date_to)

        count_query = select(func.count()).select_from(query.subquery())
        total = int((await self.db.execute(count_query)).scalar_one())

        sort_columns = {
            "transaction_date": Transaction.transaction_date,
            "amount": Transaction.amount,
            "merchant": func.lower(Transaction.merchant),
        }
        sort_column = sort_columns[filters.sort_by]
        ordered_column = (
            sort_column.asc() if filters.sort_order == "asc" else sort_column.desc()
        )
        query = (
            query.order_by(
                ordered_column,
                Transaction.created_at.desc(),
            )
            .offset((filters.page - 1) * filters.page_size)
            .limit(filters.page_size)
        )
        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        return TransactionListResponse(
            items=[TransactionResponse.model_validate(item) for item in transactions],
            total=total,
            page=filters.page,
            page_size=filters.page_size,
            total_pages=math.ceil(total / filters.page_size) if total else 0,
        )

    async def get_transaction(
        self, user_id: str, transaction_id: str
    ) -> Optional[Transaction]:
        result = await self.db.execute(
            select(Transaction).where(
                Transaction.id == transaction_id,
                Transaction.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_transaction(
        self,
        user_id: str,
        transaction_id: str,
        data: TransactionUpdate,
    ) -> Optional[Transaction]:
        transaction = await self.get_transaction(user_id, transaction_id)
        if transaction is None:
            return None

        update_data = data.model_dump(exclude_unset=True)
        category = None
        if "category_id" in update_data:
            category = await self._ensure_category_access(user_id, update_data["category_id"])

        for field, value in update_data.items():
            setattr(transaction, field, value)

        await self.db.flush()
        if category is None:
            category = await self._ensure_category_access(user_id, transaction.category_id)
        await self._sync_budget_memory(transaction, category)
        return transaction

    async def delete_transaction(self, user_id: str, transaction_id: str) -> bool:
        transaction = await self.get_transaction(user_id, transaction_id)
        if transaction is None:
            return False

        await self.db.delete(transaction)
        memory = await self.db.scalar(
            select(FinancialMemory).where(
                FinancialMemory.source_id == transaction.id,
                FinancialMemory.source == "transaction",
                FinancialMemory.is_deleted.is_(False),
            )
        )
        if memory is not None:
            memory.is_deleted = True
            memory.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def _ensure_category_access(self, user_id: str, category_id: str) -> BudgetCategory:
        result = await self.db.execute(
            select(BudgetCategory).where(
                BudgetCategory.is_active.is_(True),
                or_(
                    BudgetCategory.is_default.is_(True),
                    BudgetCategory.user_id == user_id,
                ),
                or_(BudgetCategory.id == category_id, BudgetCategory.slug == category_id),
            )
        )
        category = result.scalar_one_or_none()
        if category is None:
            raise ValueError("Category not found or not available to this user")
        return category

    async def _sync_budget_memory(
        self, transaction: Transaction, category: BudgetCategory
    ) -> None:
        """Keep the legacy budgeting read model in sync from transaction writes.

        The budgeting branch intentionally reads historical transactions from
        ``financial_memories``. Transaction APIs own this compatibility write
        so the budget service does not need to know about the normalized
        transaction table.
        """
        memory = await self.db.scalar(
            select(FinancialMemory).where(
                FinancialMemory.source_id == transaction.id,
                FinancialMemory.source == "transaction",
            )
        )
        if memory is None:
            memory = FinancialMemory(
                user_id=transaction.user_id,
                memory_type=MemoryType.TRANSACTION,
                source="transaction",
                source_id=transaction.id,
            )
            self.db.add(memory)

        memory.title = transaction.merchant
        memory.content = transaction.description or transaction.merchant
        memory.amount = float(transaction.amount)
        memory.category = category.slug
        memory.details = {
            "transaction_type": transaction.transaction_type.value,
            "currency": transaction.currency,
            "transaction_date": transaction.transaction_date.isoformat(),
        }
        memory.importance = MemoryImportance.MEDIUM
        memory.is_deleted = False
        memory.deleted_at = None
        await self.db.flush()

    async def get_dashboard_data(
        self,
        user_id: str,
        date_from: date | None = None,
        date_to: date | None = None,
        trend_period: str = "month",
    ) -> DashboardResponse:
        conditions = [Transaction.user_id == user_id]
        if date_from is not None:
            conditions.append(Transaction.transaction_date >= date_from)
        if date_to is not None:
            conditions.append(Transaction.transaction_date <= date_to)

        totals_query = (
            select(
                Transaction.transaction_type,
                func.sum(Transaction.amount).label("total_amount"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .where(*conditions)
            .group_by(Transaction.transaction_type)
        )
        totals = await self.db.execute(totals_query)

        zero = Decimal("0.00")
        total_income = zero
        total_expense = zero
        transaction_count = 0
        for row in totals:
            amount = Decimal(str(row.total_amount or 0))
            transaction_count += int(row.transaction_count)
            if row.transaction_type == TransactionType.INCOME:
                total_income = amount
            elif row.transaction_type == TransactionType.EXPENSE:
                total_expense = amount

        category_query = (
            select(
                Transaction.category_id,
                BudgetCategory.name.label("category_name"),
                Transaction.currency,
                func.sum(Transaction.amount).label("total_amount"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .join(BudgetCategory, BudgetCategory.id == Transaction.category_id)
            .where(
                *conditions,
                Transaction.transaction_type == TransactionType.EXPENSE,
            )
            .group_by(Transaction.category_id, BudgetCategory.name, Transaction.currency)
            .order_by(func.sum(Transaction.amount).desc())
        )
        category_rows = await self.db.execute(category_query)

        by_category = [
            DashboardCategorySummary(
                category_id=row.category_id,
                category_name=row.category_name,
                currency=row.currency,
                total_amount=Decimal(str(row.total_amount or 0)),
                transaction_count=int(row.transaction_count),
            )
            for row in category_rows
        ]

        currency_query = (
            select(
                Transaction.currency,
                Transaction.transaction_type,
                func.sum(Transaction.amount).label("total_amount"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .where(*conditions)
            .group_by(Transaction.currency, Transaction.transaction_type)
        )
        currency_rows = await self.db.execute(currency_query)
        currency_totals: dict[str, CurrencyTotals] = {}
        for row in currency_rows:
            currency = row.currency
            totals_for_currency = currency_totals.setdefault(
                currency,
                {"income": zero, "expense": zero, "count": 0},
            )
            amount = Decimal(str(row.total_amount or 0))
            if row.transaction_type == TransactionType.INCOME:
                totals_for_currency["income"] = amount
            else:
                totals_for_currency["expense"] = amount
            totals_for_currency["count"] = int(totals_for_currency["count"]) + int(row.transaction_count)

        by_currency = [
            DashboardCurrencySummary(
                currency=currency,
                total_income=totals["income"],
                total_expense=totals["expense"],
                net_balance=totals["income"] - totals["expense"],
                transaction_count=totals["count"],
            )
            for currency, totals in sorted(currency_totals.items())
        ]

        trend_query = select(
            Transaction.transaction_date,
            Transaction.currency,
            Transaction.transaction_type,
            Transaction.amount,
        ).where(*conditions)
        trend_rows = await self.db.execute(trend_query)
        trend_totals: dict[tuple[str, str], dict[str, Decimal]] = {}
        for row in trend_rows:
            # Monthly points are easier to compare across currencies and work
            # on both CockroachDB and the SQLite test database.
            if trend_period == "week":
                # The product guideline defines four calendar buckets per
                # month (W1-W4), rather than ISO weeks that can produce a
                # fifth partial column at month boundaries.
                week_of_month = min(4, ((row.transaction_date.day - 1) // 7) + 1)
                period = (
                    f"{row.transaction_date.year}-"
                    f"{row.transaction_date.month:02d}-W{week_of_month}"
                )
            else:
                period = row.transaction_date.strftime("%Y-%m")
            key = (period, row.currency)
            point = trend_totals.setdefault(
                key, {"income": zero, "expense": zero}
            )
            if row.transaction_type == TransactionType.INCOME:
                point["income"] += Decimal(str(row.amount or 0))
            else:
                point["expense"] += Decimal(str(row.amount or 0))

        spending_trend = [
            DashboardTrendPoint(
                period=period,
                currency=currency,
                total_income=totals["income"],
                total_expense=totals["expense"],
            )
            for (period, currency), totals in sorted(trend_totals.items())
        ]

        recent_query = (
            select(Transaction)
            .where(*conditions)
            .order_by(
                Transaction.transaction_date.desc(),
                Transaction.created_at.desc(),
            )
            .limit(5)
        )
        recent_rows = await self.db.execute(recent_query)
        recent_transactions = [
            TransactionResponse.model_validate(item)
            for item in recent_rows.scalars().all()
        ]

        suggestion_count = int(
            (
                await self.db.execute(
                    select(func.count(Transaction.id)).where(
                        *conditions,
                        Transaction.suggested_category_id.is_not(None),
                    )
                )
            ).scalar_one()
            or 0
        )
        accepted_count = int(
            (
                await self.db.execute(
                    select(func.count(Transaction.id)).where(
                        *conditions,
                        Transaction.suggested_category_id.is_not(None),
                        Transaction.category_suggestion_accepted.is_(True),
                    )
                )
            ).scalar_one()
            or 0
        )

        return DashboardResponse(
            date_from=date_from,
            date_to=date_to,
            total_income=total_income,
            total_expense=total_expense,
            net_balance=total_income - total_expense,
            transaction_count=transaction_count,
            category_suggestion_count=suggestion_count,
            category_suggestion_acceptance_rate=(
                round(accepted_count / suggestion_count, 4)
                if suggestion_count
                else None
            ),
            by_category=by_category,
            by_currency=by_currency,
            spending_trend=spending_trend,
            recent_transactions=recent_transactions,
        )
