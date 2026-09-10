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


def test_parse_local_ocr_receipt_fields():
    preview = ReceiptOCRService.parse_text_response(
        "POCKETPILOT MARKET\n"
        "Date: 2026-09-06\n"
        "Vanilla Latte 85,000\n"
        "Notebook 120,000\n"
        "TOTAL 205,000 VND\n",
        "receipt_sample.png",
        "image/png",
        confidence=91.5,
    )

    assert preview.merchant == "POCKETPILOT MARKET"
    assert preview.amount == Decimal("205000")
    assert preview.transaction_date == date(2026, 9, 6)
    assert preview.currency == "VND"
    assert preview.confidence == 91.5
    assert preview.items[0].description == "Vanilla Latte"
    assert preview.items[0].amount == Decimal("85000")
    assert preview.source.value == "ocr"


def test_parse_local_ocr_total_with_currency_symbol():
    assert ReceiptOCRService._extract_total("SUBTOTAL 39.70\nTOTAL DUE $42.97 USD") == Decimal("42.97")


def test_parse_vnd_thousands_separator():
    assert ReceiptOCRService._parse_amount("845.000", "VND") == Decimal("845000")
    assert ReceiptOCRService._parse_amount("1.250.000", "VND") == Decimal("1250000")


def test_parse_vnd_receipt_with_dong_symbol_keeps_thousands_digits():
    preview = ReceiptOCRService.parse_text_response(
        "WALMART\nTOTAL 845.000 đ\n",
        "receipt_vnd.png",
        "image/png",
    )

    assert preview.merchant == "WALMART"
    assert preview.currency == "VND"
    assert preview.amount == Decimal("845000")


def test_parse_eur_decimal_separator():
    assert ReceiptOCRService._parse_amount("1.249,50", "EUR") == Decimal("1249.50")


def test_parse_us_receipt_reconciles_total_and_detects_currency():
    preview = ReceiptOCRService.parse_text_response(
        "La Cabana - Venice\n"
        "738 Rose Ave\n"
        "Venice, CA 90291\n"
        "Opened: 03/10/2024 1:06 pm\n"
        "Server: Emilio\n"
        "1 Dos Tacos (Brunch) 18.00\n"
        "1 Taco Enchilada (Super Combo) 21.95\n"
        "1 Brunch Reg Lime Margarita 12.75\n"
        "Subtotal 52.70\n"
        "Sales Tax 5.01\n"
        "Total 37.71\n",
        "receipt_us.jpg",
        "image/jpeg",
    )

    assert preview.merchant == "La Cabana - Venice"
    assert preview.currency == "USD"
    assert preview.transaction_date == date(2024, 3, 10)
    assert preview.subtotal == Decimal("52.70")
    assert preview.tax == Decimal("5.01")
    assert preview.amount == Decimal("57.71")
    assert [item.amount for item in preview.items] == [
        Decimal("18.00"),
        Decimal("21.95"),
        Decimal("12.75"),
    ]


def test_total_label_does_not_match_subtotal():
    assert ReceiptOCRService._extract_total(
        "SOUS-TOTAL 85,90\nTOTAL A PAYER 91,05 EUR"
    ) == Decimal("91.05")


def test_detects_multiple_currency_codes_and_symbols():
    assert ReceiptOCRService._extract_currency("TOTAL 42.97 USD") == "USD"
    assert ReceiptOCRService._extract_currency("TOTAL 91,05 EUR") == "EUR"
    assert ReceiptOCRService._extract_currency("TOTAL 1,250 JPY") == "JPY"
    assert ReceiptOCRService._extract_currency("TOTAL ₹1,250") == "INR"


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
