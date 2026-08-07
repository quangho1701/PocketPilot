# Owner: Ha
# Feature: Personalized Budget Planning + Goal Simulation
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.budget import BudgetCreate, BudgetResponse, BudgetSimulationRequest, BudgetAdjustmentRequest
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
    budget = await service.create_budget(user_id, data.model_dump())
    await db.commit()
    return budget


@router.get("/goals")
async def get_goals():
    # TODO: return user's savings goals and progress
    return {"status": "not_implemented"}


@router.post("/simulate")
async def simulate_goal(user_id: str, data: BudgetSimulationRequest):
    return {
        "user_id": user_id,
        "target_amount": data.target_amount,
        "monthly_contribution": data.monthly_contribution,
        "months": data.months,
        "current_savings": data.current_savings,
        "projected_balance": data.current_savings + (data.monthly_contribution * data.months),
    }


@router.post("/adjustments")
async def analyze_adjustments(user_id: str, data: BudgetAdjustmentRequest, db: AsyncSession = Depends(get_db)):
    service = BudgetService(db)
    return await service.analyze_dynamic_adjustments(user_id, data.month, data.year, data.model_dump())
