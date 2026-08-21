"""Receipt OCR integration and response parsing.

The OCR step only creates a preview. A later confirmation request should create
the actual transaction, so an OCR mistake cannot silently change a user's data.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import aioboto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.schemas.transaction import ReceiptOCRResponse


class ReceiptOCRNotConfigured(RuntimeError):
    """Raised when AWS credentials/configuration are unavailable."""


class ReceiptOCRProviderError(RuntimeError):
    """Raised when Textract cannot process the receipt."""


class ReceiptOCRService:
    def __init__(self) -> None:
        self._session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            region_name=settings.aws_region,
        )

    async def scan(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> ReceiptOCRResponse:
        try:
            async with self._session.client("textract") as client:
                result = await client.analyze_expense(
                    Document={"Bytes": file_bytes}
                )
        except BotoCoreError as exc:
            if exc.__class__.__name__ in {
                "NoCredentialsError",
                "PartialCredentialsError",
            }:
                raise ReceiptOCRNotConfigured(
                    "AWS credentials are required for receipt OCR"
                ) from exc
            raise ReceiptOCRProviderError("Textract could not scan the receipt") from exc
        except ClientError as exc:
            raise ReceiptOCRProviderError("Textract could not scan the receipt") from exc

        return self.parse_response(result, filename, content_type)

    @staticmethod
    def parse_response(
        result: dict,
        filename: str,
        content_type: str,
    ) -> ReceiptOCRResponse:
        fields = result.get("ExpenseDocuments", [{}])[0].get("SummaryFields", [])
        values: dict[str, str] = {}
        confidences: list[float] = []
        raw_values: list[str] = []

        for field in fields:
            field_type = field.get("Type", {}).get("Text", "").upper()
            value_detection = field.get("ValueDetection", {})
            value = value_detection.get("Text")
            if not value:
                continue

            raw_values.append(value)
            if field_type and field_type not in values:
                values[field_type] = value
            confidence = value_detection.get("Confidence")
            if confidence is not None:
                confidences.append(float(confidence))

        return ReceiptOCRResponse(
            filename=filename,
            content_type=content_type,
            merchant=values.get("VENDOR_NAME") or values.get("VENDOR"),
            amount=ReceiptOCRService._parse_amount(values.get("TOTAL")),
            transaction_date=ReceiptOCRService._parse_date(
                values.get("INVOICE_RECEIPT_DATE")
                or values.get("RECEIPT_DATE")
            ),
            raw_text="\n".join(raw_values),
            confidence=(sum(confidences) / len(confidences)) if confidences else None,
        )

    @staticmethod
    def _parse_amount(value: str | None) -> Decimal | None:
        if not value:
            return None

        cleaned = re.sub(r"[^0-9,.-]", "", value)
        if not cleaned:
            return None

        # Handle common receipt formats: 1,234.56, 1.234,56 and 1.234.567.
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            pieces = cleaned.split(",")
            cleaned = "".join(pieces) if len(pieces[-1]) == 3 else cleaned.replace(",", ".")
        elif cleaned.count(".") > 1:
            pieces = cleaned.split(".")
            cleaned = "".join(pieces) if len(pieces[-1]) == 3 else cleaned

        try:
            amount = Decimal(cleaned)
        except InvalidOperation:
            return None
        return amount if amount > 0 else None

    @staticmethod
    def _parse_date(value: str | None) -> date | None:
        if not value:
            return None

        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y"):
            try:
                return datetime.strptime(value.strip(), fmt).date()
            except ValueError:
                continue
        return None
