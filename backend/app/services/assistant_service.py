# Owner: Ngu
# Business logic for Real-Time Spending Assistant + Weekly AI Insights
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatConversation, ChatMessage
from app.models.user import User
from app.models.user_decision import DecisionType, UserDecision
from app.schemas.assistant import ChatMessageResponse, ChatRequest, ChatResponse
from app.schemas.goal_simulation import GoalSimulationRequest, GoalSimulationResult
from app.schemas.user_decision import DecisionRecord
from app.services.goal_simulation_intent import GoalSimulationIntentResolver
from app.services.goal_simulation_service import GoalSimulationService
from app.services.learning_service import LearningService
from app.services.memory_service import MemoryService
from app.services.user_profile_service import UserProfileService
from app.utils.llm import llm_client

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 10

SYSTEM_PROMPT_TEMPLATE = """You are PocketPilot, a personal spending assistant. You help the user decide \
whether to buy things, grounded in their real financial situation below.

{context_block}

INSTRUCTIONS:
- Every user-facing string in the JSON response must be natural Vietnamese.
- If the user is asking about a specific purchase, give a clear buy/wait/skip verdict grounded in their \
budget, upcoming expenses, and past behavior.
- If the user is asking a general question (not a specific purchase), answer helpfully and set \
"recommendation" to null.
- Respond with JSON ONLY — no markdown fences, no text outside the JSON object:
{{"reply": "<conversational reply shown to the user>", "recommendation": "buy"|"wait"|"skip"|null, \
"reasoning": "<one-paragraph justification>"|null, "item_description": "<what they want to buy>"|null, \
"amount": <price as number>|null, "category": "<spending category>"|null}}
- "recommendation", "reasoning", "item_description", "amount" and "category" must all be set for \
purchase decisions, and all null otherwise."""

SIMULATION_EXPLANATION_PROMPT = """You are PocketPilot. Explain the deterministic Goal Simulation result below.

SIMULATION RESULT (source of truth):
{simulation_result}

INSTRUCTIONS:
- Write the conversational explanation in natural Vietnamese.
- Explain only values present in the simulation result. Do not calculate, change, or invent monetary amounts, dates, or feasibility.
- State the relevant assumption or warning concisely when present.
- Respond with JSON ONLY — no markdown fences, no text outside the JSON object:
{{"reply": "<conversational explanation>", "recommendation": null, "reasoning": null, "item_description": null, "amount": null, "category": null}}
"""


class AssistantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Chat ---

    async def chat(self, user_id: str, request: ChatRequest) -> ChatResponse:
        await self._get_or_create_user(user_id)
        conversation = await self._get_or_create_conversation(
            user_id, request.conversation_id, request.message
        )

        # func.now() is the transaction timestamp — both messages in this request would
        # tie and make ORDER BY created_at nondeterministic. Set explicit timestamps.
        user_message = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=request.message,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(user_message)
        await self.db.flush()

        previous_simulation = await self._get_latest_simulation(conversation.id)
        intent = await GoalSimulationIntentResolver(self.db).resolve(
            user_id,
            request.message,
            previous_simulation_input=previous_simulation.simulation_input if previous_simulation else None,
            previous_simulation_result=previous_simulation.simulation_result if previous_simulation else None,
        )
        if intent is not None:
            if intent.clarification:
                return await self._store_assistant_message(conversation.id, {"reply": intent.clarification})

            simulation_request = GoalSimulationRequest(
                target_goal_id=intent.goal_id,
                scenario=intent.scenario,
                target_date=intent.target_date,
            )
            try:
                simulation_result = await GoalSimulationService(self.db).simulate(
                    user_id, simulation_request
                )
            except ValueError as exc:
                error_messages = {
                    "active budget not found for the current month": "Chưa có ngân sách đang hoạt động cho tháng này. Hãy phê duyệt kế hoạch trước khi mô phỏng.",
                    "active goal not found": "Không tìm thấy mục tiêu tài chính đang hoạt động.",
                    "goal is not active": "Mục tiêu này không còn ở trạng thái hoạt động.",
                }
                return await self._store_assistant_message(
                    conversation.id,
                    {"reply": error_messages.get(str(exc), "Chưa thể thực hiện mô phỏng lúc này. Vui lòng kiểm tra dữ liệu và thử lại.")},
                )

            history = await self._build_message_history(conversation.id)
            parsed = await self._generate_simulation_explanation(history, simulation_result)
            return await self._store_assistant_message(
                conversation.id,
                parsed,
                simulation_input=simulation_request.model_dump(mode="json"),
                simulation_result=simulation_result.model_dump(mode="json"),
                simulation_schema_version=simulation_result.schema_version,
            )

        context = await self._gather_context(user_id, request.message)
        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            context_block=self._format_context(context)
        )
        history = await self._build_message_history(conversation.id)

        try:
            raw_reply = await llm_client.invoke_model(
                messages=history,
                system=system_prompt,
                temperature=0.3,
            )
        except Exception as exc:
            logger.exception("LLM invocation failed for user %s", user_id)
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail="AI service temporarily unavailable. Check LLM_PROVIDER config and API key.",
            ) from exc

        parsed = self._parse_model_reply(raw_reply)

        return await self._store_assistant_message(
            conversation.id,
            parsed,
            context_snapshot=context if parsed["recommendation"] else None,
        )

    # --- Decision recording (closes the adaptive-learning loop) ---

    async def record_message_decision(
        self, user_id: str, message_id: str, user_decision: DecisionType
    ) -> Optional[ChatMessage]:
        result = await self.db.execute(
            select(ChatMessage)
            .join(ChatConversation, ChatMessage.conversation_id == ChatConversation.id)
            .where(
                ChatMessage.id == message_id,
                ChatConversation.user_id == user_id,
            )
        )
        message = result.scalar_one_or_none()
        if not message or message.recommendation is None:
            return None

        record = DecisionRecord(
            item_description=message.item_description or message.content[:200],
            amount=message.amount or 0.0,
            category=message.category or "uncategorized",
            ai_recommendation=message.recommendation,
            ai_reasoning=message.reasoning or "",
            user_decision=user_decision,
            context_snapshot=message.context_snapshot,
        )
        decision: UserDecision = await LearningService(self.db).record_decision(
            user_id, record
        )
        message.decision_id = decision.id
        await self.db.flush()
        return message

    # --- Conversation history ---

    async def list_conversations(self, user_id: str) -> list[ChatConversation]:
        result = await self.db.execute(
            select(ChatConversation)
            .where(ChatConversation.user_id == user_id)
            .order_by(ChatConversation.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_messages(
        self, user_id: str, conversation_id: str
    ) -> Optional[list[ChatMessage]]:
        conversation = await self._get_conversation(user_id, conversation_id)
        if not conversation:
            return None
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at)
        )
        return list(result.scalars().all())

    async def get_weekly_insights(self, user_id: str) -> dict:
        raise NotImplementedError

    # --- Private helpers ---

    async def _generate_simulation_explanation(
        self, history: list[dict], simulation_result: GoalSimulationResult
    ) -> dict:
        try:
            raw_reply = await llm_client.invoke_model(
                messages=history,
                system=SIMULATION_EXPLANATION_PROMPT.format(
                    simulation_result=json.dumps(simulation_result.model_dump(mode="json"))
                ),
                temperature=0.0,
            )
        except Exception as exc:
            logger.exception("Simulation explanation invocation failed")
            return {
                "reply": "Mình đã tính tác động dựa trên ngân sách đang hoạt động. Chi tiết mô phỏng nằm trong thẻ bên dưới.",
                "recommendation": None,
                "reasoning": None,
                "item_description": None,
                "amount": None,
                "category": None,
            }
        return self._parse_model_reply(raw_reply)

    async def _store_assistant_message(
        self,
        conversation_id: str,
        parsed: dict,
        *,
        context_snapshot: dict | None = None,
        simulation_input: dict | None = None,
        simulation_result: dict | None = None,
        simulation_schema_version: int | None = None,
    ) -> ChatResponse:
        assistant_message = ChatMessage(
            conversation_id=conversation_id,
            role="assistant",
            content=parsed["reply"],
            recommendation=parsed.get("recommendation"),
            reasoning=parsed.get("reasoning"),
            item_description=parsed.get("item_description"),
            amount=parsed.get("amount"),
            category=parsed.get("category"),
            context_snapshot=context_snapshot,
            simulation_input=simulation_input,
            simulation_result=simulation_result,
            simulation_schema_version=simulation_schema_version,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(assistant_message)
        await self.db.flush()
        return ChatResponse(
            conversation_id=conversation_id,
            message=ChatMessageResponse.model_validate(assistant_message),
        )

    async def _get_or_create_user(self, user_id: str) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            return user
        user = User(
            id=user_id,
            email=f"demo+{user_id}@pocketpilot.local",
            name="Demo User",
        )
        self.db.add(user)
        await self.db.flush()
        return user

    async def _get_latest_simulation(self, conversation_id: str) -> ChatMessage | None:
        result = await self.db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.conversation_id == conversation_id,
                ChatMessage.simulation_input.is_not(None),
                ChatMessage.simulation_result.is_not(None),
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_conversation(
        self, user_id: str, conversation_id: str
    ) -> Optional[ChatConversation]:
        result = await self.db.execute(
            select(ChatConversation).where(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _get_or_create_conversation(
        self, user_id: str, conversation_id: Optional[str], first_message: str
    ) -> ChatConversation:
        if conversation_id:
            conversation = await self._get_conversation(user_id, conversation_id)
            if conversation:
                return conversation

        title = first_message[:50] + ("…" if len(first_message) > 50 else "")
        conversation = ChatConversation(user_id=user_id, title=title)
        self.db.add(conversation)
        await self.db.flush()
        return conversation

    async def _gather_context(self, user_id: str, message: str) -> dict:
        """Pull financial context from the memory/learning services.

        Each source is fetched independently — one failure must not kill the chat.
        Fetches run sequentially: AsyncSession does not support concurrent queries.
        """

        async def _safe(label: str, coro):
            try:
                async with self.db.begin_nested():
                    return await coro
            except Exception:
                logger.exception("Context source '%s' failed for user %s", label, user_id)
                return None

        memories = await _safe(
            "memories", MemoryService(self.db).get_relevant_context(user_id, message, limit=5)
        )
        pattern_feed = await _safe("patterns", LearningService(self.db).get_pattern_feed(user_id))
        profile = await _safe("profile", UserProfileService(self.db).get_or_create_profile(user_id))
        decisions = await _safe(
            "decisions", LearningService(self.db).get_decision_history(user_id, limit=5)
        )

        context: dict = {}

        if memories:
            context["relevant_memories"] = [
                {
                    "type": m.memory_type.value,
                    "title": m.title,
                    "content": m.content,
                    "amount": m.amount,
                    "category": m.category,
                    "details": m.details,
                }
                for m in memories
            ]

        if pattern_feed:
            context["recurring_expenses"] = [
                {
                    "description": p.description,
                    "average_amount": p.average_amount,
                    "frequency_days": p.frequency_days,
                }
                for p in pattern_feed.recurring_expenses
            ]
            context["behavioral_patterns"] = [
                p.description for p in pattern_feed.behavioral_patterns
            ]
            context["predicted_upcoming_expenses"] = pattern_feed.predicted_upcoming[:10]

        if profile:
            context["profile"] = {
                "monthly_income": profile.monthly_income,
                "income_frequency": profile.income_frequency,
                "risk_tolerance": profile.risk_tolerance,
                "savings_priority": profile.savings_priority,
                "currency": profile.currency,
                "notes": profile.financial_situation_notes,
                "behavior_profile": profile.behavior_profile,
            }

        if decisions:
            context["recent_decisions"] = [
                {
                    "item": d.item_description,
                    "amount": d.amount,
                    "category": d.category,
                    "ai_recommendation": d.ai_recommendation.value,
                    "user_decision": d.user_decision.value,
                    "outcome": d.outcome.value,
                }
                for d in decisions
            ]

        return context

    def _format_context(self, context: dict) -> str:
        if not context:
            return "USER'S FINANCIAL CONTEXT: (no data available yet — be honest that your advice is generic)"
        return "USER'S FINANCIAL CONTEXT:\n" + json.dumps(context, indent=2, default=str)

    async def _build_message_history(self, conversation_id: str) -> list[dict]:
        """Last N turns of the conversation, Bedrock messages format."""
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(HISTORY_LIMIT)
        )
        messages = list(reversed(result.scalars().all()))
        # Bedrock requires the first message to be from the user
        while messages and messages[0].role != "user":
            messages.pop(0)
        return [{"role": m.role, "content": m.content} for m in messages]

    def _parse_model_reply(self, raw: str) -> dict:
        fallback = {
            "reply": raw.strip(),
            "recommendation": None,
            "reasoning": None,
            "item_description": None,
            "amount": None,
            "category": None,
        }

        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        try:
            data = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Model reply was not valid JSON; falling back to plain text")
            return fallback

        if not isinstance(data, dict) or not data.get("reply"):
            logger.warning("Model reply JSON missing 'reply' field; falling back")
            return fallback

        recommendation = None
        if data.get("recommendation") in ("buy", "wait", "skip"):
            recommendation = DecisionType(data["recommendation"])

        amount = data.get("amount")
        if amount is not None:
            try:
                amount = float(amount)
            except (TypeError, ValueError):
                amount = None

        return {
            "reply": str(data["reply"]),
            "recommendation": recommendation,
            "reasoning": data.get("reasoning") if recommendation else None,
            "item_description": data.get("item_description") if recommendation else None,
            "amount": amount if recommendation else None,
            "category": data.get("category") if recommendation else None,
        }
