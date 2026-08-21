from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models import User
from app.services.receipt_ocr_service import ReceiptOCRService
from app.utils.auth import get_current_user


def test_parse_textract_receipt_fields():
    result = {
        "ExpenseDocuments": [
            {
                "SummaryFields": [
                    {
                        "Type": {"Text": "VENDOR_NAME"},
                        "ValueDetection": {"Text": "Circle K", "Confidence": 98.0},
                    },
                    {
                        "Type": {"Text": "TOTAL"},
                        "ValueDetection": {"Text": "125,500", "Confidence": 95.0},
                    },
                    {
                        "Type": {"Text": "INVOICE_RECEIPT_DATE"},
                        "ValueDetection": {"Text": "18/08/2026", "Confidence": 90.0},
                    },
                ]
            }
        ]
    }

    preview = ReceiptOCRService.parse_response(result, "receipt.png", "image/png")

    assert preview.merchant == "Circle K"
    assert preview.amount == Decimal("125500")
    assert preview.transaction_date == date(2026, 8, 18)
    assert preview.source.value == "ocr"
    assert preview.requires_confirmation is True


@pytest.mark.asyncio
async def test_ocr_route_rejects_unsupported_file_type():
    async def override_current_user():
        return User(id="user-1", email="user-1@example.com", name="User")

    app.dependency_overrides[get_current_user] = override_current_user
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/transactions/ocr",
            params={"user_id": "user-1"},
            files={"file": ("receipt.txt", b"not an image", "text/plain")},
        )
    app.dependency_overrides.clear()

    assert response.status_code == 415
