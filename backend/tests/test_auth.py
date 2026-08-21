from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app
from app.models import Base


async def _new_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return session_factory(), engine


@pytest.mark.asyncio
async def test_register_login_and_get_current_user():
    session, engine = await _new_session()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            registered = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "anh@example.com",
                    "name": "Hoang Anh",
                    "password": "password123",
                },
            )
            assert registered.status_code == 201
            user_id = registered.json()["id"]

            login = await client.post(
                "/api/v1/auth/login",
                data={"username": "anh@example.com", "password": "password123"},
            )
            assert login.status_code == 200
            token = login.json()["access_token"]

            me = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert me.status_code == 200
            assert me.json()["id"] == user_id
            assert me.json()["email"] == "anh@example.com"
    finally:
        app.dependency_overrides.clear()
        await session.close()
        await engine.dispose()
