# Owner: Hoang Anh
# Feature: OCR Expense Categorization + Transaction Management & Dashboard UI
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_transactions():
    # TODO: return paginated transaction list
    return {"status": "not_implemented"}


@router.post("/")
async def create_transaction():
    # TODO: manually add a transaction
    return {"status": "not_implemented"}


@router.post("/ocr")
async def scan_receipt():
    # TODO: accept image upload, run OCR, extract and categorize transaction
    return {"status": "not_implemented"}


@router.get("/dashboard")
async def get_dashboard():
    # TODO: return aggregated spending data for the dashboard
    return {"status": "not_implemented"}
