from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

# asyncpg doesn't accept sslmode as a URL parameter; pass it via connect_args
_connect_args = {}
if "sslmode=disable" in settings.database_url:
    _connect_args["ssl"] = False

_db_url = settings.database_url.replace("?sslmode=disable", "").replace("&sslmode=disable", "")

_engine_options = {"echo": False, "connect_args": _connect_args}
if _db_url.startswith("cockroachdb+"):
    # CockroachDB's retry model and DDL behavior assume serializable
    # transactions. Pass this as an engine option rather than a URL argument.
    _engine_options["isolation_level"] = "SERIALIZABLE"
engine = create_async_engine(_db_url, **_engine_options)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
