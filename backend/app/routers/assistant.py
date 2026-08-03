# Owner: Ngu
# Feature: Real-Time Spending Assistant + Weekly AI Insights & Alerts
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.schemas.assistant import (
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    MessageDecisionRequest,
)
from app.services.assistant_service import AssistantService
from app.services.learning_service import LearningService

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    user_id: str,
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send a message to the spending assistant and get a Buy/Wait/Skip recommendation."""
    svc = AssistantService(db)
    response = await svc.chat(user_id, data)
    await db.commit()
    return response


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List the user's chat conversations, most recently active first."""
    svc = AssistantService(db)
    return await svc.list_conversations(user_id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageResponse])
async def get_messages(
    conversation_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Full message history for a conversation."""
    svc = AssistantService(db)
    messages = await svc.get_messages(user_id, conversation_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return messages


@router.post(
    "/messages/{message_id}/decision",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_message_decision(
    message_id: str,
    user_id: str,
    data: MessageDecisionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """User confirms what they did (buy/wait/skip) — feeds the adaptive learning engine."""
    svc = AssistantService(db)
    message = await svc.record_message_decision(user_id, message_id, data.user_decision)
    if not message:
        raise HTTPException(
            status_code=404, detail="Message not found or has no recommendation"
        )
    await db.commit()

    async def _update_profile():
        async with AsyncSessionLocal() as session:
            learning = LearningService(session)
            await learning.update_behavior_profile(user_id)
            await session.commit()

    background_tasks.add_task(_update_profile)
    return message


@router.get("/insights")
async def get_weekly_insights():
    # TODO: return weekly AI-generated spending insights
    return {"status": "not_implemented"}
