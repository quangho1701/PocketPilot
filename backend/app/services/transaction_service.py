# Owner: Hoang Anh
# Business logic for OCR Expense Categorization + Transaction Management
from sqlalchemy.ext.asyncio import AsyncSession


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_transactions(self, user_id: str) -> list:
        raise NotImplementedError

    async def create_transaction(self, user_id: str, data: dict) -> dict:
        raise NotImplementedError

    async def process_receipt_ocr(self, user_id: str, image_bytes: bytes) -> dict:
        raise NotImplementedError

    async def get_dashboard_data(self, user_id: str) -> dict:
        raise NotImplementedError
