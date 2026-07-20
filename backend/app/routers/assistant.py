# Owner: Ngu
# Feature: Real-Time Spending Assistant + Weekly AI Insights & Alerts
from fastapi import APIRouter

router = APIRouter()


@router.post("/chat")
async def chat():
    # TODO: process user message and return Buy/Wait/Skip recommendation
    return {"status": "not_implemented"}


@router.get("/insights")
async def get_weekly_insights():
    # TODO: return weekly AI-generated spending insights
    return {"status": "not_implemented"}
