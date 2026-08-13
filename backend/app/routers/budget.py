from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.budget import (
    BudgetAdjustmentRequest,
    BudgetCategoryCreate,
    BudgetCategoryResponse,
    BudgetCreate,
    BudgetGenerationRequest,
    BudgetProgressResponse,
    BudgetProposalUpdateRequest,
    BudgetResponse,
)
from app.services.budget_service import BudgetService

router = APIRouter()


@router.get("/", response_model=BudgetResponse)
async def get_budget(user_id: str, db: AsyncSession = Depends(get_db)):
    service = BudgetService(db)
    budget = await service.get_budget(user_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


@router.post("/", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(user_id: str, data: BudgetCreate, db: AsyncSession = Depends(get_db)):
    service = BudgetService(db)
    try:
        budget = await service.create_budget(user_id, data.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return budget


@router.post("/proposals/generate", response_model=BudgetResponse)
async def generate_budget_proposal(
    user_id: str,
    data: BudgetGenerationRequest,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    try:
        budget = await service.generate_budget_proposal(
            user_id,
            data.month,
            data.year,
            data.budgeting_mode,
            custom_allocations=[item.model_dump(exclude_none=True) for item in data.custom_allocations],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.commit()
    return budget


@router.patch("/proposals/{budget_id}", response_model=BudgetResponse)
async def update_budget_proposal(
    budget_id: str,
    user_id: str,
    data: BudgetProposalUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    try:
        budget = await service.update_draft_budget(
            user_id,
            budget_id,
            data.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.commit()
    return budget


@router.post("/proposals/{budget_id}/approve", response_model=BudgetResponse)
async def approve_budget_proposal(
    budget_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    try:
        budget = await service.approve_budget(user_id, budget_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.commit()
    return budget


@router.get("/progress", response_model=BudgetProgressResponse)
async def get_budget_progress(
    user_id: str,
    month: int,
    year: int,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    try:
        progress = await service.get_budget_progress(user_id, month, year)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return progress


@router.get("/categories", response_model=list[BudgetCategoryResponse])
async def list_budget_categories(user_id: str, db: AsyncSession = Depends(get_db)):
    service = BudgetService(db)
    categories = await service.list_categories(user_id)
    return categories


@router.post("/categories", response_model=BudgetCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_budget_category(
    user_id: str,
    data: BudgetCategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    try:
        category = await service.create_custom_category(
            user_id,
            data.slug,
            data.name,
            data.mapping_group,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.commit()
    return category


@router.post("/adjustments")
async def analyze_adjustments(
    user_id: str,
    data: BudgetAdjustmentRequest,
    db: AsyncSession = Depends(get_db),
):
    service = BudgetService(db)
    return await service.analyze_dynamic_adjustments(
        user_id,
        data.month,
        data.year,
        data.model_dump(),
    )
