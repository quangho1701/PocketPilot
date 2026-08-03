from __future__ import annotations

from typing import Optional

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.user_decision import DecisionType


class ChatConversation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chat_conversations"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )

    __table_args__ = (Index("idx_cc_user", "user_id"),)


class ChatMessage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "chat_messages"

    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Set only on assistant messages that carry a purchase recommendation
    recommendation: Mapped[Optional[DecisionType]] = mapped_column(
        SAEnum(DecisionType, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    item_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    context_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Set once the user confirms what they actually did (closes the learning loop)
    decision_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("user_decisions.id"), nullable=True
    )

    conversation: Mapped[ChatConversation] = relationship(back_populates="messages")

    __table_args__ = (Index("idx_cm_conversation", "conversation_id"),)
