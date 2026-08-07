from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models.financial_memory import FinancialMemory
from app.schemas.setup import FinancialSetupPayload, FinancialSetupResponse
from app.services.memory_service import MemoryService
from app.services.setup_service import FinancialSetupService

logger = logging.getLogger(__name__)

router = APIRouter()
UserId = Annotated[str, Query(min_length=1, max_length=36)]


async def _embed_setup_memories(memory_ids: list[str]) -> None:
    """Best-effort post-commit embedding work, isolated per memory."""
    for memory_id in memory_ids:
        async with AsyncSessionLocal() as session:
            try:
                memory = await session.get(FinancialMemory, memory_id)
                if memory is None or memory.is_deleted:
                    continue
                service = MemoryService(session)
                embedding_text = service._build_embedding_text(memory)
                await service.embedding_service.embed_and_store(
                    memory.id, embedding_text
                )
                await session.commit()
            except Exception:
                await session.rollback()
                logger.exception(
                    "Failed to generate post-setup embedding for memory %s",
                    memory_id,
                )


@router.get("", response_model=FinancialSetupResponse)
async def get_financial_setup(
    user_id: UserId,
    db: AsyncSession = Depends(get_db),
) -> FinancialSetupResponse:
    """Return the setup gate status and the normalized saved setup, if any."""
    return await FinancialSetupService(db).get_setup(user_id)


@router.put("", response_model=FinancialSetupResponse)
async def replace_financial_setup(
    data: FinancialSetupPayload,
    background_tasks: BackgroundTasks,
    user_id: UserId,
    db: AsyncSession = Depends(get_db),
) -> FinancialSetupResponse:
    """Atomically create or fully replace a user's financial setup."""
    try:
        response, memory_ids = await FinancialSetupService(db).replace_setup(
            user_id, data
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    background_tasks.add_task(_embed_setup_memories, memory_ids)
    return response
