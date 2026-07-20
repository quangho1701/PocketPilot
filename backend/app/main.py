from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import memory, assistant, budget, transactions


def create_app() -> FastAPI:
    app = FastAPI(
        title="PocketPilot API",
        description="AI Personal Budgeting Guide with Persistent Memory",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(memory.router, prefix="/api/v1/memory", tags=["Memory"])
    app.include_router(assistant.router, prefix="/api/v1/assistant", tags=["Assistant"])
    app.include_router(budget.router, prefix="/api/v1/budget", tags=["Budget"])
    app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["Transactions"])

    @app.get("/health", tags=["Health"])
    async def health_check():
        return {"status": "ok", "service": "pocketpilot-api"}

    return app


app = create_app()
