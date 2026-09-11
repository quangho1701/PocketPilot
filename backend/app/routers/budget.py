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
    CategoryAllocationUpdateRequest,
    CategoryDetailResponse,
    PlanGoalCreate,
    PlanGoalDraft,
    PlanGoalDraftState,
    PlanGoalResponse,
    PlanGoalUpdate,
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


@router.get("/month", response_model=BudgetResponse)
async def get_budget_month(user_id: str, month: int, year: int, db: AsyncSession = Depends(get_db)):
    budget = await BudgetService(db).get_budget_for_month(user_id, month, year)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


@router.get("/months", response_model=list[BudgetResponse])
async def list_budget_months(user_id: str, db: AsyncSession = Depends(get_db)):
    return await BudgetService(db).list_budget_months(user_id)


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


@router.get("/details/{budget_id}/categories/{category_id}", response_model=CategoryDetailResponse)
async def get_category_detail(budget_id: str, category_id: str, user_id: str, db: AsyncSession = Depends(get_db)):
    try:
        return await BudgetService(db).get_category_detail(user_id, budget_id, category_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/details/{budget_id}/categories/{category_id}", response_model=BudgetResponse)
async def update_category_allocation(budget_id: str, category_id: str, user_id: str, data: CategoryAllocationUpdateRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await BudgetService(db).update_category_allocation(user_id, budget_id, category_id, data.amount, data.apply_to_future)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return result


@router.get("/plan-goals/draft", response_model=PlanGoalDraftState)
async def get_draft_goals(user_id: str, db: AsyncSession = Depends(get_db)):
    service = BudgetService(db)
    profile = await service.get_plan_goal_confirmation(user_id)
    return {"confirmed": profile, "goals": [] if profile else await service.get_draft_goals(user_id)}


@router.post("/plan-goals/confirm", response_model=list[PlanGoalResponse])
async def confirm_draft_goals(user_id: str, goals: list[PlanGoalDraft], db: AsyncSession = Depends(get_db)):
    result = await BudgetService(db).confirm_draft_goals(user_id, [g.model_dump() for g in goals])
    await db.commit()
    return result


@router.get("/plan-goals", response_model=list[PlanGoalResponse])
async def list_plan_goals(user_id: str, db: AsyncSession = Depends(get_db)):
    return await BudgetService(db).list_plan_goals(user_id)


@router.post("/plan-goals", response_model=PlanGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_plan_goal(user_id: str, data: PlanGoalCreate, db: AsyncSession = Depends(get_db)):
    try:
        result = await BudgetService(db).create_plan_goal(user_id, data.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await db.commit()
    return result


@router.patch("/plan-goals/{goal_id}", response_model=PlanGoalResponse)
async def update_plan_goal(goal_id: str, user_id: str, data: PlanGoalUpdate, db: AsyncSession = Depends(get_db)):
    try:
        result = await BudgetService(db).update_plan_goal(user_id, goal_id, data.model_dump(exclude_unset=True))
    except ValueError as exc:
        status_code = 404 if str(exc) == "goal not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    await db.commit()
    return result


@router.delete("/plan-goals/{goal_id}", response_model=list[PlanGoalResponse])
async def delete_plan_goal(goal_id: str, user_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await BudgetService(db).delete_plan_goal(user_id, goal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await db.commit()
    return result


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
