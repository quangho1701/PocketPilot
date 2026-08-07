from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models.financial_memory import MemoryType
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.memory import (
    MemoryContextRequest,
    MemoryCreate,
    MemoryIngestFromTransaction,
    MemoryResponse,
    MemorySearchQuery,
    MemorySearchResponse,
    MemoryUpdate,
)
from app.schemas.spending_pattern import PatternFeedResponse, SpendingPatternsListResponse
from app.schemas.user_decision import (
    DecisionFeedback,
    DecisionRecord,
    DecisionResponse,
    LearningInsight,
)
from app.schemas.user_profile import UserProfileCreate, UserProfileResponse, UserProfileUpdate
from app.services.learning_service import LearningService
from app.services.memory_service import MemoryService, SetupManagedMemoryError
from app.services.user_profile_service import (
    SetupManagedProfileError,
    UserProfileService,
)

router = APIRouter()


# ============= MEMORY CRUD =============


@router.get("/", response_model=PaginatedResponse)
async def list_memories(
    user_id: str,
    memory_type: Optional[MemoryType] = None,
    category: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List user's financial memories with optional filtering."""
    svc = MemoryService(db)
    result = await svc.list_memories(
        user_id=user_id,
        memory_type=memory_type,
        category=category,
        pagination=PaginationParams(page=page, page_size=page_size),
    )
    await db.commit()
    return result


@router.post("/", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    user_id: str,
    data: MemoryCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Create a new financial memory with automatic embedding generation."""
    svc = MemoryService(db)
    try:
        memory = await svc.create_memory_with_embedding(user_id, data)
    except SetupManagedMemoryError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await db.commit()
    return memory


# ============= SEMANTIC SEARCH =============


@router.post("/search", response_model=MemorySearchResponse)
async def search_memories(
    user_id: str,
    query: MemorySearchQuery,
    db: AsyncSession = Depends(get_db),
):
    """Semantic search across user's memories using vector similarity."""
    svc = MemoryService(db)
    result = await svc.search_memories(user_id, query)
    await db.commit()
    return result


# ============= SERVICE-TO-SERVICE: TRANSACTION INGESTION =============


@router.post(
    "/ingest/transaction",
    response_model=MemoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_transaction(
    user_id: str,
    data: MemoryIngestFromTransaction,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Called by the transaction service to create a memory from a new transaction."""
    svc = MemoryService(db)
    memory = await svc.ingest_transaction(user_id, data)
    await db.commit()

    async def _detect_patterns():
        async with AsyncSessionLocal() as session:
            learning = LearningService(session)
            await learning.detect_patterns(user_id)
            await session.commit()

    background_tasks.add_task(_detect_patterns)
    return memory


# ============= SERVICE-TO-SERVICE: CONTEXT RETRIEVAL =============


@router.post("/context", response_model=list[MemoryResponse])
async def get_relevant_context(
    user_id: str,
    data: MemoryContextRequest,
    db: AsyncSession = Depends(get_db),
):
    """Called by the assistant to retrieve relevant memories for AI context."""
    svc = MemoryService(db)
    memories = await svc.get_relevant_context(user_id, data.query, data.limit)
    await db.commit()
    return memories


# ============= USER PROFILE =============


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user's financial profile."""
    svc = UserProfileService(db)
    profile = await svc.get_or_create_profile(user_id)
    await db.commit()
    return profile


@router.post("/profile", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    user_id: str,
    data: UserProfileCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create user's financial profile (called during onboarding)."""
    svc = UserProfileService(db)
    profile = await svc.create_profile(user_id, data)
    await db.commit()
    return profile


@router.patch("/profile", response_model=UserProfileResponse)
async def update_profile(
    user_id: str,
    data: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update user's financial profile."""
    svc = UserProfileService(db)
    try:
        profile = await svc.update_profile(user_id, data)
    except SetupManagedProfileError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await db.commit()
    return profile


# ============= SPENDING PATTERNS =============


@router.get("/patterns", response_model=SpendingPatternsListResponse)
async def get_patterns(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List detected spending patterns for the user."""
    svc = LearningService(db)
    patterns = await svc.get_active_patterns(user_id)
    from app.schemas.spending_pattern import SpendingPatternResponse

    return SpendingPatternsListResponse(
        patterns=[SpendingPatternResponse.model_validate(p) for p in patterns],
        total=len(patterns),
    )


@router.get("/patterns/feed", response_model=PatternFeedResponse)
async def get_pattern_feed(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Service-to-service: Provides the budget service with pattern data."""
    svc = LearningService(db)
    return await svc.get_pattern_feed(user_id)


@router.post("/patterns/detect", status_code=status.HTTP_202_ACCEPTED)
async def trigger_pattern_detection(
    user_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger pattern detection (also runs after transaction ingestion)."""
    svc = LearningService(db)
    patterns = await svc.detect_patterns(user_id)
    await db.commit()
    return {"message": "Pattern detection completed", "patterns_found": len(patterns)}


# ============= DECISIONS & LEARNING =============


@router.post("/decisions", response_model=DecisionResponse, status_code=status.HTTP_201_CREATED)
async def record_decision(
    user_id: str,
    data: DecisionRecord,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Called by the assistant when a user makes a buy/wait/skip decision."""
    svc = LearningService(db)
    decision = await svc.record_decision(user_id, data)
    await db.commit()

    async def _update_profile():
        async with AsyncSessionLocal() as session:
            learning = LearningService(session)
            await learning.update_behavior_profile(user_id)
            await session.commit()

    background_tasks.add_task(_update_profile)
    return decision


@router.get("/decisions", response_model=list[DecisionResponse])
async def list_decisions(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List user's decision history."""
    svc = LearningService(db)
    decisions = await svc.get_decision_history(user_id, limit)
    return decisions


@router.patch("/decisions/{decision_id}/feedback", response_model=DecisionResponse)
async def decision_feedback(
    decision_id: str,
    user_id: str,
    data: DecisionFeedback,
    db: AsyncSession = Depends(get_db),
):
    """User provides feedback on a recommendation."""
    svc = LearningService(db)
    decision = await svc.update_decision_feedback(user_id, decision_id, data)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")
    await db.commit()
    return decision


@router.get("/learning/insights", response_model=LearningInsight)
async def get_learning_insights(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get summary of what the learning engine has learned about the user."""
    svc = LearningService(db)
    return await svc.get_learning_insights(user_id)


@router.get("/learning/predictions")
async def get_predictions(
    user_id: str,
    days_ahead: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Predict upcoming expenses based on detected patterns."""
    svc = LearningService(db)
    predictions = await svc.predict_upcoming_expenses(user_id, days_ahead)
    return {"predictions": predictions, "days_ahead": days_ahead}


# ============= MEMORY CRUD BY ID =============
# Keep these catch-all routes after every named path such as /profile, /patterns,
# and /decisions so Starlette does not interpret a static segment as a memory ID.


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a specific memory."""
    svc = MemoryService(db)
    memory = await svc.get_memory(user_id, memory_id)
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()
    return memory


@router.patch("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    user_id: str,
    data: MemoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a memory and re-generate its embedding if content changed."""
    svc = MemoryService(db)
    try:
        memory = await svc.update_memory(user_id, memory_id, data)
    except SetupManagedMemoryError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()
    return memory


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a memory."""
    svc = MemoryService(db)
    try:
        deleted = await svc.delete_memory(user_id, memory_id)
    except SetupManagedMemoryError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()
