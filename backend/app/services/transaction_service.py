from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_memory import FinancialMemory, MemoryImportance, MemoryType
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionResponse


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_transactions(self, user_id: str) -> list[TransactionResponse]:
        rows = await self.db.execute(
            select(FinancialMemory)
            .where(
                FinancialMemory.user_id == user_id,
                FinancialMemory.memory_type == MemoryType.TRANSACTION,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
            .order_by(FinancialMemory.created_at.desc())
        )
        return [self._serialize(item) for item in rows.scalars().all()]

    async def create_transaction(
        self, user_id: str, data: TransactionCreate
    ) -> TransactionResponse:
        await self._ensure_user(user_id)
        details = {
            "description": data.description,
            "merchant": data.merchant,
            "date": data.date.isoformat(),
            "currency": "VND",
        }
        transaction = FinancialMemory(
            user_id=user_id,
            memory_type=MemoryType.TRANSACTION,
            title=data.description,
            content=data.description,
            amount=data.amount,
            category=data.category,
            details=details,
            importance=MemoryImportance.MEDIUM,
            source="transaction",
        )
        self.db.add(transaction)
        await self.db.flush()
        return self._serialize(transaction)

    async def process_receipt_ocr(self, user_id: str, image_bytes: bytes) -> dict:
        raise NotImplementedError

    async def get_dashboard_data(self, user_id: str) -> dict:
        raise NotImplementedError

    async def _ensure_user(self, user_id: str) -> None:
        if await self.db.get(User, user_id) is None:
            self.db.add(
                User(
                    id=user_id,
                    email=f"demo+{user_id}@pocketpilot.local",
                    name="Demo User",
                )
            )
            await self.db.flush()

    @staticmethod
    def _serialize(memory: FinancialMemory) -> TransactionResponse:
        details = memory.details or {}
        return TransactionResponse(
            id=memory.id,
            user_id=memory.user_id,
            amount=int(memory.amount or 0),
            category=memory.category or "miscellaneous",
            description=str(details.get("description", memory.title)),
            merchant=details.get("merchant"),
            date=details.get("date", memory.created_at.date()),
            created_at=memory.created_at,
        )
