from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.services.transaction_service import TransactionService

router = APIRouter()


UserId = Annotated[str, Query(min_length=1, max_length=36)]


@router.get("/", response_model=list[TransactionResponse])
async def list_transactions(user_id: UserId, db: AsyncSession = Depends(get_db)):
    return await TransactionService(db).list_transactions(user_id)


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    user_id: UserId,
    db: AsyncSession = Depends(get_db),
):
    transaction = await TransactionService(db).create_transaction(user_id, data)
    await db.commit()
    return transaction


@router.post("/ocr")
async def scan_receipt():
    # TODO: accept image upload, run OCR, extract and categorize transaction
    return {"status": "not_implemented"}


@router.get("/dashboard")
async def get_dashboard():
    # TODO: return aggregated spending data for the dashboard
    return {"status": "not_implemented"}
