import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.schemas import PriceEnrichRequest, PriceEnrichResponse
from app.rate_limiter import limiter
from app.services.price_history import enrich_prices

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/prices/enrich")
@limiter.limit("20/minute")
async def enrich_transaction_prices(
    request: Request,
    body: PriceEnrichRequest,
    session: AsyncSession = Depends(get_session),
) -> PriceEnrichResponse:
    prices, pending, cached = await enrich_prices(body.transactions, session)
    return PriceEnrichResponse(prices=prices, pending=pending, cached=cached)
