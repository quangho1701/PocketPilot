from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pgvector.sqlalchemy import Vector

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.config import settings


class MemoryEmbedding(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "memory_embeddings"

    memory_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("financial_memories.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    embedding_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list] = mapped_column(
        Vector(settings.embedding_dimension), nullable=False
    )
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)

    memory: Mapped[FinancialMemory] = relationship(back_populates="embedding")

    __table_args__ = (
        Index("idx_me_memory_id", "memory_id"),
    )


from app.models.financial_memory import FinancialMemory  # noqa: E402
