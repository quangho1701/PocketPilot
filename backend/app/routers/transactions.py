# Owner: Hoang Anh
# Feature: OCR Expense Categorization + Transaction Management & Dashboard UI
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.transaction import (
    DashboardResponse,
    ReceiptOCRResponse,
    TransactionCreate,
    TransactionFilter,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdate,
)
from app.services.receipt_ocr_service import (
    ReceiptOCRNotConfigured,
    ReceiptOCRProviderError,
    ReceiptOCRService,
)
from app.utils.auth import get_current_user
from app.services.transaction_service import TransactionService

router = APIRouter()


@router.get("/", response_model=TransactionListResponse)
async def list_transactions(
    filters: TransactionFilter = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List a user's transactions with optional filters and pagination."""
    return await TransactionService(db).list_transactions(current_user.id, filters)


@router.post(
    "/",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    data: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a confirmed manual transaction."""
    try:
        transaction = await TransactionService(db).create_transaction(current_user.id, data)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await db.commit()
    return transaction


@router.post("/ocr", response_model=ReceiptOCRResponse)
async def scan_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Scan a receipt and return a preview; do not create a transaction yet."""
    allowed_types = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Receipt must be a JPEG, PNG, WEBP, or PDF file",
        )

    max_size = 10 * 1024 * 1024
    file_bytes = await file.read(max_size + 1)
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Receipt file is empty")
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=413, detail="Receipt file must be 10 MB or smaller")

    try:
        return await ReceiptOCRService().scan(
            file_bytes=file_bytes,
            filename=file.filename or "receipt",
            content_type=file.content_type,
        )
    except ReceiptOCRNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ReceiptOCRProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    return await TransactionService(db).get_dashboard_data(
        current_user.id, date_from, date_to
    )


# Keep dynamic ID routes after static paths such as /ocr and /dashboard.
@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction = await TransactionService(db).get_transaction(
        current_user.id, transaction_id
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    data: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        transaction = await TransactionService(db).update_transaction(
            current_user.id, transaction_id, data
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    await db.commit()
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await TransactionService(db).delete_transaction(
        current_user.id, transaction_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")

    await db.commit()
