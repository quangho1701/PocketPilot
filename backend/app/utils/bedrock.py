from __future__ import annotations

import json
from typing import Optional

import aioboto3

from app.config import settings


class BedrockClient:
    """Async client for Bedrock LLM inference."""

    def __init__(self):
        self._session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            region_name=settings.aws_region,
        )

    async def invoke_model(
        self,
        messages: list[dict],
        system: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        """Invoke Claude 3 Sonnet via the Messages API."""
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            body["system"] = system

        async with self._session.client("bedrock-runtime") as client:
            response = await client.invoke_model(
                modelId=settings.bedrock_model_id,
                body=json.dumps(body),
                contentType="application/json",
            )
            response_body = json.loads(await response["body"].read())
            return response_body["content"][0]["text"]

    async def invoke_with_prompt(self, prompt: str, **kwargs) -> str:
        """Convenience wrapper for single user message."""
        return await self.invoke_model(
            messages=[{"role": "user", "content": prompt}], **kwargs
        )


class EmbeddingClient:
    """Async client for Bedrock Titan Embeddings."""

    def __init__(self):
        self._session = aioboto3.Session(
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            region_name=settings.aws_region,
        )

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate a 1024-dim embedding vector for the given text."""
        body = json.dumps({
            "inputText": text,
            "dimensions": settings.embedding_dimension,
        })
        async with self._session.client("bedrock-runtime") as client:
            response = await client.invoke_model(
                modelId=settings.bedrock_embedding_model_id,
                body=body,
                contentType="application/json",
            )
            response_body = json.loads(await response["body"].read())
            return response_body["embedding"]

    async def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts sequentially."""
        return [await self.generate_embedding(text) for text in texts]


bedrock_client = BedrockClient()
embedding_client = EmbeddingClient()
