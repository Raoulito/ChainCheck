from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event

from app.config import config

engine = create_async_engine(
    config.database_url,
    echo=config.log_level == "DEBUG",
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


if config.is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
