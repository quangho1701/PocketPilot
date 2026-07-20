# Owner: Quang
# Feature: Persistent Financial Memory + Adaptive Learning Engine
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_memories():
    # TODO: return user's stored financial memories
    return {"status": "not_implemented"}


@router.post("/")
async def create_memory():
    # TODO: store a new financial memory entry
    return {"status": "not_implemented"}
