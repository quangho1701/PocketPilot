# Owner: Ha
# Business logic for Personalized Budget Planning + Goal Simulation
from sqlalchemy.ext.asyncio import AsyncSession


class BudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_budget(self, user_id: str) -> dict:
        raise NotImplementedError

    async def create_budget(self, user_id: str, data: dict) -> dict:
        raise NotImplementedError

    async def simulate_goal(self, user_id: str, scenario: dict) -> dict:
        raise NotImplementedError
