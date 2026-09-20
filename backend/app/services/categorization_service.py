"""Automatic transaction categorization with a reviewable AI suggestion."""

from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_category import BudgetCategory
from app.models.transaction import TransactionType
from app.schemas.transaction import (
    CategoryCandidate,
    CategoryPrediction,
    ReceiptLineItem,
)
from app.services.budget_service import BudgetService
from app.utils.llm import llm_client

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 60 * 60
_CACHE_MAX_ENTRIES = 256
_llm_prediction_cache: dict[tuple[object, ...], tuple[float, dict]] = {}


@dataclass(frozen=True)
class _CategoryInput:
    id: str
    slug: str
    name: str
    mapping_group: str


# Rules are deliberately only a fallback. The configured LLM remains primary,
# while local development still has a useful deterministic result when the
# provider is unavailable, rate-limited, or returns malformed JSON.
KEYWORD_RULES: dict[str, tuple[str, ...]] = {
    "housing": (
        "rent", "rental", "rent payment", "lease", "mortgage", "apartment",
        "housing", "property", "landlord", "nha tro", "thue nha", "tien nha",
        "chung cu",
    ),
    "utilities": (
        "electric", "electricity", "electric bill", "water bill", "internet",
        "wifi", "utility", "utilities", "phone bill", "mobile plan", "gas bill",
        "power bill", "dien", "nuoc", "tien dien", "tien nuoc", "tien mang",
        "dien thoai",
    ),
    "groceries": (
        "grocery", "groceries", "supermarket", "market", "whole foods", "aldi",
        "costco", "trader joes", "safeway", "kroger", "publix", "walmart",
        "vinmart", "coopmart", "bach hoa xanh", "siêu thị", "sieu thi", "cho",
    ),
    "dining": (
        "restaurant", "cafe", "coffee", "food", "dining", "starbucks", "mcdonald",
        "burger king", "kfc", "pizza", "grabfood", "doordash", "ubereats",
        "shopeefood", "foodpanda", "boba", "bakery", "quan an", "an uong",
        "nha hang",
    ),
    "transportation": (
        "grab", "uber", "lyft", "taxi", "bus", "metro", "train", "parking",
        "toll", "fuel", "gas station", "shell", "chevron", "petrolimex", "xang",
        "di chuyen",
    ),
    "shopping": (
        "shopping", "shopee", "lazada", "amazon", "ebay", "mall", "retail",
        "department store", "clothing", "apparel", "fashion", "boutique", "shoes",
        "handbag", "accessories", "gucci", "prada", "louis vuitton", "quần áo",
        "mua sam",
    ),
    "healthcare": (
        "hospital", "clinic", "pharmacy", "cvs", "walgreens", "doctor", "dentist",
        "dental", "medical", "health", "benh vien", "nha thuoc", "thuoc",
    ),
    "insurance": ("insurance", "bao hiem"),
    "education": (
        "school", "course", "tuition", "university", "college", "udemy", "coursera",
        "book", "education", "hoc phi", "truong hoc",
    ),
    "entertainment": (
        "cinema", "movie", "concert", "theater", "game", "gaming", "steam",
        "playstation", "xbox", "entertainment",
    ),
    "subscriptions": (
        "subscription", "spotify", "netflix", "youtube premium", "icloud", "google one",
        "membership", "adobe", "notion", "gym membership",
    ),
    "travel": (
        "hotel", "flight", "airline", "airbnb", "travel", "booking", "expedia",
        "agoda", "trip", "visa fee", "du lich", "khach san", "ve may bay",
    ),
    "personal_care": (
        "salon", "barber", "spa", "beauty", "cosmetics", "makeup", "skincare",
        "perfume", "sephora", "ulta", "chanel", "victoria secret", "victoria's secret",
        "personal care",
        "my pham", "lam dep",
    ),
    "pets": ("pet", "veterinary", "vet", "thu cung"),
    "gifts_donations": ("gift", "donation", "charity", "qua tang", "tu thien"),
    "savings": ("saving", "savings", "tiet kiem"),
    "investments": ("investment", "invest", "stock", "crypto", "dau tu"),
}


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", without_marks).strip()


def _parse_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError("LLM returned a non-JSON categorization response")
        value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("LLM categorization response must be a JSON object")
    return value


class CategorizationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def categorize(
        self,
        user_id: str,
        merchant: str,
        description: str | None = None,
        transaction_type: TransactionType = TransactionType.EXPENSE,
        items: list[ReceiptLineItem] | None = None,
    ) -> CategoryPrediction:
        categories = await self._available_categories(user_id)
        if not categories:
            raise ValueError("No active categories are available for this user")

        if transaction_type == TransactionType.INCOME:
            # Income is not an expense category, so keep it reviewable and avoid
            # inventing a category when the user has no dedicated income slug.
            income = next((item for item in categories if item.slug == "savings"), categories[0])
            return self._prediction(
                income,
                confidence=0.35,
                source="rules",
                rationale="Income entries require user confirmation before being grouped.",
                categories=categories,
            )

        cache_key = self._cache_key(
            user_id=user_id,
            merchant=merchant,
            description=description,
            transaction_type=transaction_type,
            items=items or [],
            categories=categories,
        )
        try:
            response = self._get_cached_llm_response(cache_key)
            if response is None:
                response = await self._ask_llm(merchant, description, categories, items or [])
                self._store_llm_response(cache_key, response)
            prediction = self._prediction_from_llm(response, categories)
            if prediction is not None:
                return prediction
        except Exception as exc:  # Provider failure must not block manual entry.
            logger.warning("AI categorization failed; using local rules: %s", exc)

        return self._categorize_with_rules(merchant, description, categories)

    @staticmethod
    def _cache_key(
        user_id: str,
        merchant: str,
        description: str | None,
        transaction_type: TransactionType,
        items: list[ReceiptLineItem],
        categories: list[_CategoryInput],
    ) -> tuple[object, ...]:
        category_signature = tuple((item.id, item.slug) for item in categories)
        return (
            id(llm_client),
            user_id,
            _normalize(merchant),
            _normalize(description or ""),
            transaction_type.value,
            tuple((item.description, str(item.amount or "")) for item in items),
            category_signature,
        )

    @staticmethod
    def _get_cached_llm_response(key: tuple[object, ...]) -> dict | None:
        cached = _llm_prediction_cache.get(key)
        if cached is None:
            return None
        created_at, response = cached
        if time.monotonic() - created_at >= _CACHE_TTL_SECONDS:
            _llm_prediction_cache.pop(key, None)
            return None
        return response

    @staticmethod
    def _store_llm_response(key: tuple[object, ...], response: dict) -> None:
        if len(_llm_prediction_cache) >= _CACHE_MAX_ENTRIES:
            oldest_key = min(
                _llm_prediction_cache,
                key=lambda item: _llm_prediction_cache[item][0],
            )
            _llm_prediction_cache.pop(oldest_key, None)
        _llm_prediction_cache[key] = (time.monotonic(), response)

    async def _available_categories(self, user_id: str) -> list[_CategoryInput]:
        await BudgetService(self.db).ensure_default_categories()
        result = await self.db.execute(
            select(BudgetCategory)
            .where(
                BudgetCategory.is_active.is_(True),
                or_(BudgetCategory.is_default.is_(True), BudgetCategory.user_id == user_id),
            )
            .order_by(BudgetCategory.is_default.desc(), BudgetCategory.name.asc())
        )
        return [
            _CategoryInput(
                id=category.id,
                slug=category.slug,
                name=category.name,
                mapping_group=category.mapping_group,
            )
            for category in result.scalars().all()
        ]

    async def _ask_llm(
        self,
        merchant: str,
        description: str | None,
        categories: list[_CategoryInput],
        items: list[ReceiptLineItem],
    ) -> dict:
        category_payload = [
            {"slug": item.slug, "name": item.name, "mapping_group": item.mapping_group}
            for item in categories
        ]
        input_payload = {
            "merchant": merchant,
            "description": description or "",
            "items": [item.model_dump(mode="json") for item in items],
        }
        system = (
            "You categorize personal finance expenses. Choose only a category slug "
            "from the supplied list. Return strict JSON only, with no markdown. "
            "confidence must be a number between 0 and 1. Infer the likely spending "
            "category from the merchant's business, even when the input is only a "
            "brand name. Do not choose miscellaneous merely because a brand is not "
            "in a keyword list; use your general world knowledge."
        )
        prompt = (
            "Available categories:\n"
            f"{json.dumps(category_payload, ensure_ascii=False)}\n\n"
            "Transaction text:\n"
            f"{json.dumps(input_payload, ensure_ascii=False)}\n\n"
            "Return exactly this JSON shape:\n"
            '{"category_slug":"...","confidence":0.0,"rationale":"...",'
            '"normalized_merchant":"...",'
            '"alternatives":[{"category_slug":"...","confidence":0.0}]}'
        )
        raw = await llm_client.invoke_with_prompt(
            prompt,
            system=system,
            max_tokens=400,
            temperature=0,
        )
        return _parse_json(raw)

    def _prediction_from_llm(
        self,
        response: dict,
        categories: list[_CategoryInput],
    ) -> CategoryPrediction | None:
        slug = response.get("category_slug")
        category = next((item for item in categories if item.slug == slug), None)
        if category is None:
            return None

        confidence = self._confidence(response.get("confidence"))
        if confidence is None:
            return None

        alternatives: list[CategoryCandidate] = []
        seen = {category.slug}
        for item in response.get("alternatives") or []:
            if not isinstance(item, dict):
                continue
            alternative_slug = item.get("category_slug")
            alternative = next(
                (candidate for candidate in categories if candidate.slug == alternative_slug),
                None,
            )
            if alternative is None or alternative.slug in seen:
                continue
            alternative_confidence = self._confidence(item.get("confidence"))
            if alternative_confidence is None:
                continue
            alternatives.append(
                CategoryCandidate(
                    category_id=alternative.id,
                    category_slug=alternative.slug,
                    category_name=alternative.name,
                    confidence=alternative_confidence,
                )
            )
            seen.add(alternative.slug)

        return CategoryPrediction(
            category_id=category.id,
            category_slug=category.slug,
            category_name=category.name,
            confidence=confidence,
            source="llm",
            rationale=str(response.get("rationale") or "Suggested by the AI model.")[:500],
            normalized_merchant=(
                str(response["normalized_merchant"]).strip()[:255]
                if response.get("normalized_merchant")
                else None
            ),
            alternatives=alternatives[:3],
        )

    def _categorize_with_rules(
        self,
        merchant: str,
        description: str | None,
        categories: list[_CategoryInput],
    ) -> CategoryPrediction:
        text = _normalize(f"{merchant} {description or ''}")
        scores: list[tuple[int, _CategoryInput]] = []
        for category in categories:
            keywords = KEYWORD_RULES.get(category.slug, ())
            score = sum(1 for keyword in keywords if self._keyword_matches(text, keyword))
            scores.append((score, category))

        scores.sort(key=lambda item: (-item[0], item[1].name))
        matched_score, selected = scores[0]
        if matched_score == 0:
            selected = next(
                (category for category in categories if category.slug == "miscellaneous"),
                selected,
            )
            confidence = 0.2
            rationale = "No clear merchant keyword matched; review the suggested category."
        else:
            confidence = min(0.55 + (matched_score - 1) * 0.1, 0.85)
            rationale = "Suggested from merchant and description keywords; review before saving."

        alternatives = [
            CategoryCandidate(
                category_id=category.id,
                category_slug=category.slug,
                category_name=category.name,
                confidence=min(0.5, confidence),
            )
            for score, category in scores[1:4]
            if category.slug != selected.slug and score > 0
        ]
        return self._prediction(
            selected,
            confidence=confidence,
            source="rules",
            rationale=rationale,
            categories=categories,
            alternatives=alternatives,
        )

    @staticmethod
    def _keyword_matches(text: str, keyword: str) -> bool:
        normalized_keyword = _normalize(keyword)
        pattern = re.escape(normalized_keyword).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<!\w){pattern}(?!\w)", text))

    @staticmethod
    def _confidence(value: object) -> float | None:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return None
        if 1 < confidence <= 100:
            confidence /= 100
        if not 0 <= confidence <= 1:
            return None
        return confidence

    @staticmethod
    def _prediction(
        category: _CategoryInput,
        confidence: float,
        source: str,
        rationale: str,
        categories: list[_CategoryInput],
        alternatives: list[CategoryCandidate] | None = None,
    ) -> CategoryPrediction:
        return CategoryPrediction(
            category_id=category.id,
            category_slug=category.slug,
            category_name=category.name,
            confidence=confidence,
            source=source,  # type: ignore[arg-type]
            rationale=rationale,
            alternatives=alternatives or [],
        )
