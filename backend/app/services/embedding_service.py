from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.financial_memory import FinancialMemory, MemoryType
from app.models.memory_embedding import MemoryEmbedding
from app.utils.llm import embedding_client

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def embed_and_store(self, memory_id: str, text_content: str) -> MemoryEmbedding:
        """Generate an embedding for the given text and store it."""
        vector = await embedding_client.generate_embedding(text_content)

        existing = await self.db.execute(
            text("SELECT id FROM memory_embeddings WHERE memory_id = :mid"),
            {"mid": memory_id},
        )
        row = existing.fetchone()

        if row:
            await self.db.execute(
                text(
                    "UPDATE memory_embeddings "
                    "SET embedding_text = :txt, embedding = :vec, model_version = :mv, "
                    "updated_at = now() "
                    "WHERE memory_id = :mid"
                ),
                {
                    "txt": text_content,
                    "vec": str(vector),
                    "mv": settings.bedrock_embedding_model_id,
                    "mid": memory_id,
                },
            )
            await self.db.flush()
            result = await self.db.get(MemoryEmbedding, row[0])
            return result
        else:
            embedding = MemoryEmbedding(
                memory_id=memory_id,
                embedding_text=text_content,
                embedding=vector,
                model_version=settings.bedrock_embedding_model_id,
            )
            self.db.add(embedding)
            await self.db.flush()
            return embedding

    async def search_similar(
        self,
        user_id: str,
        query_text: str,
        limit: int = 10,
        threshold: float = 0.7,
        memory_types: Optional[list[MemoryType]] = None,
    ) -> list[tuple[FinancialMemory, float]]:
        """Find memories similar to the query text using vector cosine similarity."""
        query_vector = await embedding_client.generate_embedding(query_text)

        type_filter = ""
        params: dict = {
            "user_id": user_id,
            "query_vec": str(query_vector),
            "threshold": threshold,
            "limit": limit,
        }

        if memory_types:
            type_filter = "AND fm.memory_type = ANY(:types)"
            params["types"] = [t.value for t in memory_types]

        sql = text(f"""
            SELECT fm.id, 1 - (me.embedding <=> :query_vec::vector) AS similarity
            FROM memory_embeddings me
            JOIN financial_memories fm ON fm.id = me.memory_id
            WHERE fm.user_id = :user_id
              AND fm.is_deleted = false
              {type_filter}
            HAVING 1 - (me.embedding <=> :query_vec::vector) >= :threshold
            ORDER BY me.embedding <=> :query_vec::vector
            LIMIT :limit
        """)

        result = await self.db.execute(sql, params)
        rows = result.fetchall()

        memories = []
        for row in rows:
            memory = await self.db.get(FinancialMemory, row[0])
            if memory:
                memories.append((memory, float(row[1])))

        return memories

    async def delete_embedding(self, memory_id: str) -> None:
        """Delete the embedding for a given memory."""
        await self.db.execute(
            text("DELETE FROM memory_embeddings WHERE memory_id = :mid"),
            {"mid": memory_id},
        )
