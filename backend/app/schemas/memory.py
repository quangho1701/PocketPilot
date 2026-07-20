from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.financial_memory import MemoryImportance, MemoryType


# --- Request schemas ---


class MemoryCreate(BaseModel):
    memory_type: MemoryType
    title: str = Field(max_length=255)
    content: str
    amount: Optional[float] = None
    category: Optional[str] = Field(default=None, max_length=100)
    importance: MemoryImportance = MemoryImportance.MEDIUM
    source: Optional[str] = None
    source_id: Optional[str] = None


class MemoryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    importance: Optional[MemoryImportance] = None


class MemorySearchQuery(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    memory_types: Optional[list[MemoryType]] = None
    category: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=50)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)


class MemoryIngestFromTransaction(BaseModel):
    """Used by the transaction service to create memories from new transactions."""

    transaction_id: str
    amount: float
    category: str
    description: str
    merchant: Optional[str] = None
    date: str


class MemoryContextRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)


# --- Response schemas ---


class MemoryResponse(BaseModel):
    id: str
    user_id: str
    memory_type: MemoryType
    title: str
    content: str
    amount: Optional[float]
    category: Optional[str]
    importance: MemoryImportance
    access_count: int
    source: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemorySearchResult(BaseModel):
    memory: MemoryResponse
    similarity_score: float


class MemorySearchResponse(BaseModel):
    results: list[MemorySearchResult]
    query: str
    total_results: int
