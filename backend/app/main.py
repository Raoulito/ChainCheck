import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import config
from app.db import engine
from app.errors import ProviderError, ValidationError
from app.models.base import Base
from app.rate_limiter import limiter
from app.routers.lookup import router as lookup_router
from app.routers.prices import router as prices_router
from app.routers.labels import router as labels_router
from app.routers.risk import router as risk_router
from app.routers.trace import router as trace_router
from app.routers.auth import router as auth_router
from app.routers.investigations import router as investigations_router

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)


def is_running_in_docker() -> bool:
    return Path("/.dockerenv").exists()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    if config.is_sqlite and is_running_in_docker():
        logger.warning(
            "SQLite + Docker detected. Ensure you are using a local bind mount, "
            "not a managed volume. See ENV-6 in the roadmap."
        )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed labels on first startup
    from app.jobs.label_sync import run_label_sync
    try:
        await run_label_sync()
    except Exception as exc:
        logger.warning("Initial label sync failed (non-fatal): %s", exc)

    # Periodic label refresh (every 24h)
    async def _label_refresh_loop():
        while True:
            await asyncio.sleep(86400)
            try:
                await run_label_sync()
            except Exception as exc:
                logger.warning("Periodic label sync failed: %s", exc)

    refresh_task = asyncio.create_task(_label_refresh_loop())

    logger.info("ChainScope backend started")
    yield
    # Shutdown
    refresh_task.cancel()
    await engine.dispose()


app = FastAPI(title="ChainScope", version="0.1.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ProviderError)
async def provider_error_handler(request: Request, exc: ProviderError):
    return JSONResponse(
        status_code=502,
        content={"error": "provider_error", "detail": str(exc)},
    )


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    return JSONResponse(
        status_code=400,
        content={"error": "validation_error", "detail": str(exc)},
    )


# Routers
app.include_router(lookup_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(labels_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
app.include_router(trace_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(investigations_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
