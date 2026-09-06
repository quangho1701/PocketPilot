from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.goal_simulation import GoalSimulationRequest, GoalSimulationResult
from app.services.goal_simulation_service import GoalSimulationService

router = APIRouter()
UserId = Annotated[str, Query(min_length=1, max_length=36)]


@router.post("", response_model=GoalSimulationResult)
async def simulate_goal(
    data: GoalSimulationRequest,
    user_id: UserId,
    db: AsyncSession = Depends(get_db),
) -> GoalSimulationResult:
    """Run a deterministic projection against the user's active monthly budget."""
    try:
        return await GoalSimulationService(db).simulate(user_id, data)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "active goal not found" else 409
        localized_detail = {
            "active goal not found": "Không tìm thấy mục tiêu đang hoạt động.",
            "goal is not active": "Mục tiêu này không còn hoạt động.",
            "active budget not found for the current month": "Bạn cần áp dụng ngân sách tháng này trước khi mô phỏng mục tiêu.",
        }.get(detail, "Chưa thể mô phỏng với dữ liệu hiện tại. Vui lòng kiểm tra lại thông tin.")
        raise HTTPException(status_code=status_code, detail=localized_detail) from exc
