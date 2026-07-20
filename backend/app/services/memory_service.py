# Owner: Quang
# Business logic for Persistent Financial Memory + Adaptive Learning
from sqlalchemy.ext.asyncio import AsyncSession


class MemoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_memories(self, user_id: str):
        raise NotImplementedError

    async def create_memory(self, user_id: str, data: dict):
        raise NotImplementedError
