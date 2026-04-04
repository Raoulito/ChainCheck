from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.models.base import Base


@pytest.fixture
async def db_session():
    """In-memory SQLite session for tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def mock_provider():
    """Return a mock provider whose fetch_transactions can be controlled."""
    provider = AsyncMock()
    provider.fetch_transactions = AsyncMock(return_value=([], 0))
    provider.close = AsyncMock()
    return provider
