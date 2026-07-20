from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_memory import FinancialMemory, MemoryImportance, MemoryType
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.memory import (
    MemoryCreate,
    MemoryIngestFromTransaction,
    MemoryResponse,
    MemorySearchQuery,
    MemorySearchResponse,
    MemorySearchResult,
    MemoryUpdate,
)
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class MemoryService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService(db)

    # --- CRUD ---

    async def create_memory(self, user_id: str, data: MemoryCreate) -> FinancialMemory:
        memory = FinancialMemory(
            user_id=user_id,
            **data.model_dump(),
        )
        self.db.add(memory)
        await self.db.flush()
        return memory

    async def create_memory_with_embedding(
        self, user_id: str, data: MemoryCreate
    ) -> FinancialMemory:
        """Create a memory and generate its embedding."""
        memory = await self.create_memory(user_id, data)
        embedding_text = self._build_embedding_text(memory)
        try:
            await self.embedding_service.embed_and_store(memory.id, embedding_text)
        except Exception:
            logger.exception("Failed to generate embedding for memory %s", memory.id)
        return memory

    async def get_memory(self, user_id: str, memory_id: str) -> Optional[FinancialMemory]:
        result = await self.db.execute(
            select(FinancialMemory).where(
                FinancialMemory.id == memory_id,
                FinancialMemory.user_id == user_id,
                FinancialMemory.is_deleted == False,  # noqa: E712
            )
        )
        memory = result.scalar_one_or_none()
        if memory:
            memory.access_count += 1
            memory.last_accessed_at = datetime.now(timezone.utc)
            await self.db.flush()
        return memory

    async def update_memory(
        self, user_id: str, memory_id: str, data: MemoryUpdate
    ) -> Optional[FinancialMemory]:
        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return None

        update_data = data.model_dump(exclude_none=True)
        content_changed = "content" in update_data or "title" in update_data

        for field, value in update_data.items():
            setattr(memory, field, value)
        await self.db.flush()

        if content_changed:
            embedding_text = self._build_embedding_text(memory)
            try:
                await self.embedding_service.embed_and_store(memory.id, embedding_text)
            except Exception:
                logger.exception("Failed to re-embed memory %s", memory.id)

        return memory

    async def delete_memory(self, user_id: str, memory_id: str) -> bool:
        memory = await self.get_memory(user_id, memory_id)
        if not memory:
            return False
        memory.is_deleted = True
        memory.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def list_memories(
        self,
        user_id: str,
        memory_type: Optional[MemoryType] = None,
        category: Optional[str] = None,
        pagination: Optional[PaginationParams] = None,
    ) -> PaginatedResponse:
        if pagination is None:
            pagination = PaginationParams()

        query = select(FinancialMemory).where(
            FinancialMemory.user_id == user_id,
            FinancialMemory.is_deleted == False,  # noqa: E712
        )

        if memory_type:
            query = query.where(FinancialMemory.memory_type == memory_type)
        if category:
            query = query.where(FinancialMemory.category == category)

        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar() or 0

        offset = (pagination.page - 1) * pagination.page_size
        query = query.order_by(FinancialMemory.created_at.desc())
        query = query.offset(offset).limit(pagination.page_size)

        result = await self.db.execute(query)
        memories = result.scalars().all()

        return PaginatedResponse(
            items=[MemoryResponse.model_validate(m) for m in memories],
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
            total_pages=math.ceil(total / pagination.page_size) if total > 0 else 0,
        )

    # --- Semantic search ---

    async def search_memories(
        self, user_id: str, query: MemorySearchQuery
    ) -> MemorySearchResponse:
        results = await self.embedding_service.search_similar(
            user_id=user_id,
            query_text=query.query,
            limit=query.limit,
            threshold=query.similarity_threshold,
            memory_types=query.memory_types,
        )

        search_results = [
            MemorySearchResult(
                memory=MemoryResponse.model_validate(memory),
                similarity_score=score,
            )
            for memory, score in results
        ]

        return MemorySearchResponse(
            results=search_results,
            query=query.query,
            total_results=len(search_results),
        )

    # --- Service-to-service interfaces ---

    async def ingest_transaction(
        self, user_id: str, data: MemoryIngestFromTransaction
    ) -> FinancialMemory:
        """Create a memory from a transaction (called by transaction service)."""
        memory_data = MemoryCreate(
            memory_type=MemoryType.TRANSACTION,
            title=f"{data.category}: {data.description}",
            content=(
                f"Spent ${data.amount:.2f} on {data.description}"
                f"{f' at {data.merchant}' if data.merchant else ''} "
                f"on {data.date}. Category: {data.category}."
            ),
            amount=data.amount,
            category=data.category,
            importance=MemoryImportance.MEDIUM,
            source="transaction",
            source_id=data.transaction_id,
        )
        return await self.create_memory_with_embedding(user_id, memory_data)

    async def get_relevant_context(
        self, user_id: str, query_text: str, limit: int = 5
    ) -> list[FinancialMemory]:
        """Retrieve relevant memories for AI context (called by assistant service)."""
        results = await self.embedding_service.search_similar(
            user_id=user_id,
            query_text=query_text,
            limit=limit,
            threshold=0.5,
        )
        return [memory for memory, _ in results]

    # --- Helpers ---

    def _build_embedding_text(self, memory: FinancialMemory) -> str:
        """Build the text representation used for embedding generation."""
        parts = [f"[{memory.memory_type.value}]", memory.title, memory.content]
        if memory.category:
            parts.append(f"Category: {memory.category}")
        if memory.amount is not None:
            parts.append(f"Amount: ${memory.amount:.2f}")
        return " | ".join(parts)
