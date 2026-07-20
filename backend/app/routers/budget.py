# Owner: Ha
# Feature: Personalized Budget Planning + Goal Simulation
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_budget():
    # TODO: return user's current budget plan
    return {"status": "not_implemented"}


@router.post("/")
async def create_budget():
    # TODO: generate a personalized budget plan
    return {"status": "not_implemented"}


@router.get("/goals")
async def get_goals():
    # TODO: return user's savings goals and progress
    return {"status": "not_implemented"}


@router.post("/simulate")
async def simulate_goal():
    # TODO: run a "what if" goal simulation
    return {"status": "not_implemented"}
