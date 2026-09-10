"""Receipt OCR integration and response parsing.

The OCR step only creates a preview. A later confirmation request should create
the actual transaction, so an OCR mistake cannot silently change a user's data.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.config import settings
from app.schemas.transaction import ReceiptLineItem, ReceiptOCRResponse


logger = logging.getLogger(__name__)


class ReceiptOCRNotConfigured(RuntimeError):
    """Raised when the local OCR runtime is unavailable."""


class ReceiptOCRProviderError(RuntimeError):
    """Raised when the local OCR runtime cannot process the receipt."""


class ReceiptOCRService:
    CURRENCY_CODES = (
        "AED", "ARS", "AUD", "BRL", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD",
        "IDR", "INR", "JPY", "KRW", "MYR", "NZD", "PHP", "PLN", "RUB",
        "SAR", "SGD", "THB", "TRY", "USD", "VND", "ZAR", "MXN",
    )

    async def scan(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> ReceiptOCRResponse:
        try:
            raw_text, confidence, merchant_hint = await asyncio.to_thread(
                self._extract_text,
                file_bytes,
            )
        except ReceiptOCRNotConfigured:
            raise
        except ReceiptOCRProviderError:
            raise
        except Exception as exc:
            logger.exception("Local OCR failed for %s", filename)
            raise ReceiptOCRProviderError(
                "Local OCR could not process the receipt image"
            ) from exc

        return self.parse_text_response(
            raw_text,
            filename,
            content_type,
            confidence=confidence,
            merchant_hint=merchant_hint,
        )

    @staticmethod
    def _extract_text(file_bytes: bytes) -> tuple[str, float | None, str | None]:
        try:
            import pytesseract
            from PIL import Image, ImageEnhance, ImageFilter, ImageOps
        except ImportError as exc:
            raise ReceiptOCRNotConfigured(
                "Install pytesseract and Pillow for local receipt OCR"
            ) from exc

        if settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

        try:
            with Image.open(io.BytesIO(file_bytes)) as image:
                # Phone photos often lose decimal points and thousand
                # separators. Upscaling plus contrast/threshold passes makes
                # the OCR preview more reliable without changing the stored
                # original receipt.
                grayscale = image.convert("L")
                scale = 2 if max(grayscale.size) < 2400 else 1
                if scale > 1:
                    grayscale = grayscale.resize(
                        (grayscale.width * scale, grayscale.height * scale),
                        Image.Resampling.LANCZOS,
                    )
                contrast = ImageEnhance.Contrast(grayscale).enhance(1.6)
                contrast = contrast.filter(ImageFilter.SHARPEN)
                threshold = ImageOps.autocontrast(contrast).point(
                    lambda pixel: 255 if pixel > 175 else 0
                )
                variants = ((grayscale, 6), (contrast, 4), (threshold, 11))
                text_candidates = [
                    pytesseract.image_to_string(
                        variant,
                        lang=settings.tesseract_lang,
                        config=f"--psm {psm}",
                    )
                    for variant, psm in variants
                ]
                raw_text = max(text_candidates, key=ReceiptOCRService._ocr_text_score)
                layout_text = text_candidates[1] or text_candidates[2]
                data = pytesseract.image_to_data(
                    contrast,
                    lang=settings.tesseract_lang,
                    config="--psm 4",
                    output_type=pytesseract.Output.DICT,
                )
        except pytesseract.TesseractNotFoundError as exc:
            raise ReceiptOCRNotConfigured(
                "Tesseract is not installed or TESSERACT_CMD is incorrect"
            ) from exc
        except pytesseract.TesseractError as exc:
            raise ReceiptOCRProviderError(
                "Tesseract could not read the receipt image"
            ) from exc
        except (OSError, ValueError) as exc:
            raise ReceiptOCRProviderError(
                "Receipt image is invalid or cannot be decoded"
            ) from exc

        tokens: list[str] = []
        confidences: list[float] = []
        for token, raw_confidence in zip(data["text"], data["conf"]):
            cleaned = token.strip()
            if cleaned:
                tokens.append(cleaned)
            try:
                parsed_confidence = float(raw_confidence)
            except (TypeError, ValueError):
                continue
            if parsed_confidence >= 0:
                confidences.append(parsed_confidence)

        raw_text = raw_text.strip() or "\n".join(tokens)
        merchant_hint = ReceiptOCRService._extract_merchant(
            [line.strip() for line in layout_text.splitlines() if line.strip()]
        )
        return raw_text, (
            sum(confidences) / len(confidences) if confidences else None
        ), merchant_hint

    @staticmethod
    def _ocr_text_score(text: str) -> tuple[int, float, int]:
        normalized = text.casefold()
        meaningful_lines = sum(bool(line.strip()) for line in text.splitlines())
        amount_lines = len(re.findall(r"\d[\d,.\s]*", text))
        receipt_labels = sum(
            label in normalized
            for label in ("total", "subtotal", "date", "tax", "amount", "usd", "vnd")
        )
        # Thresholded passes can create one-line noise for every digit. Prefer
        # the pass with a higher density of useful numeric lines instead of
        # blindly selecting the longest OCR output.
        numeric_density = amount_lines / max(meaningful_lines, 1)
        return receipt_labels, numeric_density, meaningful_lines

    @staticmethod
    def parse_text_response(
        raw_text: str,
        filename: str,
        content_type: str,
        confidence: float | None = None,
        merchant_hint: str | None = None,
    ) -> ReceiptOCRResponse:
        """Map Tesseract text into the same preview contract as the old OCR provider."""
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        merchant = merchant_hint or ReceiptOCRService._extract_merchant(lines)
        currency = ReceiptOCRService._extract_currency(raw_text)
        transaction_date = ReceiptOCRService._extract_date(raw_text)
        subtotal = ReceiptOCRService._extract_labeled_amount(raw_text, "subtotal", currency)
        tax = ReceiptOCRService._extract_labeled_amount(
            raw_text, r"(?:sales\s+)?(?:tax|vat)", currency
        )
        amount = ReceiptOCRService._extract_total(raw_text)
        # When OCR confuses a digit in the total (for example 57.71 -> 37.71),
        # the subtotal plus tax is a stronger receipt invariant.
        if subtotal is not None and tax is not None:
            calculated_total = subtotal + tax
            if amount is None or abs(amount - calculated_total) > Decimal("0.05"):
                amount = calculated_total
        return ReceiptOCRResponse(
            filename=filename,
            content_type=content_type,
            merchant=merchant,
            amount=amount,
            transaction_date=transaction_date,
            currency=currency,
            subtotal=subtotal,
            tax=tax,
            items=ReceiptOCRService._extract_items(raw_text, currency),
            raw_text=raw_text,
            confidence=confidence,
        )

    @staticmethod
    def _extract_labeled_amount(
        raw_text: str, labels: str, currency: str | None
    ) -> Decimal | None:
        lines = [line.strip() for line in raw_text.splitlines()]
        label_pattern = re.compile(rf"^(?:{labels})\b", flags=re.IGNORECASE)
        amount_pattern = re.compile(r"[$€£₹₫¥]?\s*[0-9][0-9,.\s]*")
        for index, line in enumerate(lines):
            if not label_pattern.search(line):
                continue
            same_line = line[label_pattern.match(line).end() :] if label_pattern.match(line) else ""
            candidates = amount_pattern.findall(same_line)
            # Many thermal receipts put the label and value on separate rows.
            if not candidates:
                candidates = [candidate for candidate in lines[index + 1 : index + 3] if re.fullmatch(amount_pattern, candidate)]
            for candidate in candidates:
                amount = ReceiptOCRService._parse_amount(candidate, currency)
                if amount is not None:
                    return amount
        return None

    @staticmethod
    def _extract_items(raw_text: str, currency: str | None) -> list[ReceiptLineItem]:
        """Best-effort item extraction for review; never blocks saving a receipt."""
        ignored = re.compile(
            r"^(subtotal|total|grand total|amount due|tax|vat|sales tax|cash|change|balance|date|time|receipt|invoice|opened|order|check|order type|name|server|customer|thank you)\b",
            flags=re.IGNORECASE,
        )
        items: list[ReceiptLineItem] = []
        in_items = False
        line_pattern = re.compile(
            r"^(?P<label>.*?[A-Za-z\)])\s*(?P<amount>[$€£₹₫¥]?\s*[0-9][0-9,\.\s]*)\s*$"
        )
        for line in raw_text.splitlines():
            cleaned = re.sub(r"\s+", " ", line).strip()
            if not cleaned or ignored.search(cleaned):
                if re.search(r"\b(server|item|description)\b", cleaned, re.IGNORECASE):
                    in_items = True
                if re.search(r"\b(subtotal|sales tax|total)\b", cleaned, re.IGNORECASE):
                    break
                continue
            if re.search(r"\b(server|item|description)\b", cleaned, re.IGNORECASE):
                in_items = True
                continue
            if re.search(r"\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b", cleaned):
                continue
            match = line_pattern.match(cleaned)
            if not match:
                continue
            label = re.sub(r"^\d+\s+", "", match.group("label").strip(" .:-"))
            if len(label) < 2 or not re.search(r"[A-Za-zÀ-ỹ]", label):
                continue
            amount = ReceiptOCRService._parse_amount(match.group("amount"), currency)
            if amount is not None:
                items.append(ReceiptLineItem(description=label[:255], amount=amount))
            if len(items) >= 20:
                break
        return items

    @staticmethod
    def _extract_merchant(lines: list[str]) -> str | None:
        ignored = re.compile(
            r"^(receipt|invoice|date|time|tel|phone|address|total|subtotal|tax|cash|change|save\s+money|live\s+better|manager)\b",
            flags=re.IGNORECASE,
        )
        for line in lines[:8]:
            cleaned = re.sub(r"^[^\w&'.-]+|[^\w&'.-]+$", "", line).strip()
            letter_count = sum(character.isalpha() for character in cleaned)
            if (
                3 <= len(cleaned) <= 80
                and letter_count >= 3
                and not ignored.search(cleaned)
                and not re.fullmatch(r"[\d\s.,:/-]+", cleaned)
            ):
                return cleaned
        return None

    @staticmethod
    def _extract_total(raw_text: str) -> Decimal | None:
        total_pattern = re.compile(
            r"^\s*(?:(?:grand\s+)?total(?:\s+(?:due|a\s+payer|à\s+payer))?|amount\s+due)\b[^\d\n]{0,20}([0-9][0-9,.\s]*)",
            flags=re.IGNORECASE | re.MULTILINE,
        )
        for match in total_pattern.finditer(raw_text):
            amount = ReceiptOCRService._parse_amount(
                match.group(1),
                ReceiptOCRService._extract_currency(match.group(0)),
            )
            if amount is not None:
                return amount

        # Thermal receipts commonly place `Total` and its value on adjacent
        # lines. Reuse the same locale-aware amount parser for that layout.
        labeled_total = ReceiptOCRService._extract_labeled_amount(
            raw_text,
            r"(?:grand\s+)?total(?:\s+(?:due|a\s+payer|à\s+payer))?|amount\s+due",
            ReceiptOCRService._extract_currency(raw_text),
        )
        if labeled_total is not None:
            return labeled_total

        candidates: list[Decimal] = []
        for line in raw_text.splitlines():
            line_currency = ReceiptOCRService._extract_currency(line)
            if line_currency:
                for value in re.findall(r"\d[\d,.\s]*", line):
                    amount = ReceiptOCRService._parse_amount(value, line_currency)
                    if amount is not None:
                        candidates.append(amount)
        return max(candidates) if candidates else None

    @staticmethod
    def _extract_date(raw_text: str) -> date | None:
        patterns = (
            r"\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b",
            r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b",
        )
        for pattern in patterns:
            match = re.search(pattern, raw_text)
            if match:
                parsed = ReceiptOCRService._parse_date(match.group(0))
                if parsed:
                    return parsed
        return None

    @staticmethod
    def _extract_currency(raw_text: str) -> str | None:
        upper_text = raw_text.upper()
        for code in ReceiptOCRService.CURRENCY_CODES:
            if re.search(rf"\b{code}\b", upper_text):
                return code
        if re.search(r"\bUS\s+DEBIT\b", upper_text):
            return "USD"
        if re.search(r"\b(?:CA|NY|TX|FL|WA|NV|AZ|IL|MA|VA|CO)\s+\d{5}(?:-\d{4})?\b", upper_text):
            return "USD"
        if "R$" in upper_text:
            return "BRL"
        if "₫" in raw_text:
            return "VND"
        if re.search(r"(?:\bđ\b|\bdong\b|\bvietnamese\s+dong\b)", raw_text, re.IGNORECASE):
            return "VND"
        if "₹" in raw_text:
            return "INR"
        if "₩" in raw_text:
            return "KRW"
        if "฿" in raw_text:
            return "THB"
        if "₽" in raw_text:
            return "RUB"
        if "$" in raw_text:
            return "USD"
        if "¥" in raw_text:
            return "JPY"
        if "€" in raw_text:
            return "EUR"
        if "£" in raw_text:
            return "GBP"
        return None

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
            raw_text="\n".join(raw_values),
            amount=ReceiptOCRService._parse_amount(
                values.get("TOTAL"),
                ReceiptOCRService._extract_currency("\n".join(raw_values)),
            ),
            transaction_date=ReceiptOCRService._parse_date(
                values.get("INVOICE_RECEIPT_DATE")
                or values.get("RECEIPT_DATE")
            ),
            currency=ReceiptOCRService._extract_currency("\n".join(raw_values)),
            subtotal=ReceiptOCRService._parse_amount(
                values.get("SUBTOTAL"), ReceiptOCRService._extract_currency("\n".join(raw_values))
            ),
            tax=ReceiptOCRService._parse_amount(
                values.get("TAX"), ReceiptOCRService._extract_currency("\n".join(raw_values))
            ),
            confidence=(sum(confidences) / len(confidences)) if confidences else None,
        )

    @staticmethod
    def _parse_amount(value: str | None, currency: str | None = None) -> Decimal | None:
        if not value:
            return None

        cleaned = re.sub(r"[^0-9,.-]", "", value)
        cleaned = cleaned.strip(".,")
        if not cleaned:
            return None

        currency = currency.upper() if currency else None

        # VND receipts almost always use dots or commas as thousand separators;
        # they do not normally use a decimal fraction for the amount.
        if currency == "VND":
            cleaned = cleaned.replace(".", "").replace(",", "")

        # Handle common receipt formats: 1,234.56, 1.234,56 and 1.234.567.
        elif "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            pieces = cleaned.split(",")
            cleaned = "".join(pieces) if len(pieces[-1]) == 3 else cleaned.replace(",", ".")
        elif "." in cleaned and len(cleaned.rsplit(".", 1)[-1]) == 3:
            # E.g. 845.000 or 1.234, when the currency uses whole units.
            cleaned = cleaned.replace(".", "")
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

        for fmt in (
            "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
            "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y",
            "%m.%d.%Y", "%d.%m.%Y",
        ):
            try:
                return datetime.strptime(value.strip(), fmt).date()
            except ValueError:
                continue
        return None
