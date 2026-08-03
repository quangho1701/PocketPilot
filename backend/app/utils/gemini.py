from __future__ import annotations

import json
import math
from typing import Optional

import httpx

from app.config import settings

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiClient:
    """Async client for Google Gemini LLM inference — same interface as BedrockClient."""

    def __init__(self):
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model_id

    async def invoke_model(
        self,
        messages: list[dict],
        system: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        contents = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            content = msg.get("content", "")
            if isinstance(content, list):
                parts = [{"text": p.get("text", "")} for p in content if p.get("type") == "text"]
            else:
                parts = [{"text": content}]
            contents.append({"role": role, "parts": parts})

        body: dict = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": temperature,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        url = f"{_BASE_URL}/models/{self._model}:generateContent"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError(f"Gemini returned no candidates: {data}")
        parts = candidates[0].get("content", {}).get("parts", [])
        return "".join(p.get("text", "") for p in parts)

    async def invoke_with_prompt(self, prompt: str, **kwargs) -> str:
        return await self.invoke_model(
            messages=[{"role": "user", "content": prompt}], **kwargs
        )


class GeminiEmbeddingClient:
    """Async client for Gemini embedding — same interface as EmbeddingClient."""

    def __init__(self):
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_embedding_model_id
        self._dim = settings.embedding_dimension

    async def generate_embedding(self, text: str) -> list[float]:
        url = f"{_BASE_URL}/models/{self._model}:embedContent"
        body = {
            "model": f"models/{self._model}",
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": self._dim,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        values = data.get("embedding", {}).get("values", [])
        if not values:
            raise RuntimeError(f"Gemini embedding returned empty: {data}")
        return self._normalize(values)

    async def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        return [await self.generate_embedding(text) for text in texts]

    @staticmethod
    def _normalize(vec: list[float]) -> list[float]:
        magnitude = math.sqrt(sum(x * x for x in vec))
        if magnitude == 0:
            return vec
        return [x / magnitude for x in vec]
