# Business logic for OCR Expense Categorization + Transaction Management
from __future__ import annotations

import math
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_category import BudgetCategory
from app.models.transaction import Transaction, TransactionType
from app.schemas.transaction import (
    DashboardCategorySummary,
    DashboardResponse,
    TransactionCreate,
    TransactionFilter,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdate,
)


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_transaction(
        self, user_id: str, data: TransactionCreate
    ) -> Transaction:
        await self._ensure_category_access(user_id, data.category_id)

        transaction = Transaction(
            user_id=user_id,
            **data.model_dump(),
        )
        self.db.add(transaction)
        await self.db.flush()
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
        if filters.date_from is not None:
            query = query.where(Transaction.transaction_date >= filters.date_from)
        if filters.date_to is not None:
            query = query.where(Transaction.transaction_date <= filters.date_to)

        count_query = select(func.count()).select_from(query.subquery())
        total = int((await self.db.execute(count_query)).scalar_one())

        query = (
            query.order_by(
                Transaction.transaction_date.desc(),
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
        if "category_id" in update_data:
            await self._ensure_category_access(user_id, update_data["category_id"])

        for field, value in update_data.items():
            setattr(transaction, field, value)

        await self.db.flush()
        return transaction

    async def delete_transaction(self, user_id: str, transaction_id: str) -> bool:
        transaction = await self.get_transaction(user_id, transaction_id)
        if transaction is None:
            return False

        await self.db.delete(transaction)
        await self.db.flush()
        return True

    async def _ensure_category_access(self, user_id: str, category_id: str) -> None:
        result = await self.db.execute(
            select(BudgetCategory).where(
                BudgetCategory.id == category_id,
                BudgetCategory.is_active.is_(True),
                or_(
                    BudgetCategory.is_default.is_(True),
                    BudgetCategory.user_id == user_id,
                ),
            )
        )
        if result.scalar_one_or_none() is None:
            raise ValueError("Category not found or not available to this user")

    async def process_receipt_ocr(self, user_id: str, image_bytes: bytes) -> dict:
        raise NotImplementedError

    async def get_dashboard_data(
        self,
        user_id: str,
        date_from: date | None = None,
        date_to: date | None = None,
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
                func.sum(Transaction.amount).label("total_amount"),
                func.count(Transaction.id).label("transaction_count"),
            )
            .join(BudgetCategory, BudgetCategory.id == Transaction.category_id)
            .where(
                *conditions,
                Transaction.transaction_type == TransactionType.EXPENSE,
            )
            .group_by(Transaction.category_id, BudgetCategory.name)
            .order_by(func.sum(Transaction.amount).desc())
        )
        category_rows = await self.db.execute(category_query)

        by_category = [
            DashboardCategorySummary(
                category_id=row.category_id,
                category_name=row.category_name,
                total_amount=Decimal(str(row.total_amount or 0)),
                transaction_count=int(row.transaction_count),
            )
            for row in category_rows
        ]

        return DashboardResponse(
            date_from=date_from,
            date_to=date_to,
            total_income=total_income,
            total_expense=total_expense,
            net_balance=total_income - total_expense,
            transaction_count=transaction_count,
            by_category=by_category,
        )
