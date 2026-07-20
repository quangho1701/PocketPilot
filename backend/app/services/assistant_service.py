# Owner: Ngu
# Business logic for Real-Time Spending Assistant + Weekly AI Insights
from sqlalchemy.ext.asyncio import AsyncSession


class AssistantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_recommendation(self, user_id: str, query: str) -> dict:
        # Should return {"decision": "buy|wait|skip", "reasoning": "..."}
        raise NotImplementedError

    async def get_weekly_insights(self, user_id: str) -> dict:
        raise NotImplementedError
