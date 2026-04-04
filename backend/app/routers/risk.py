import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.schemas import RiskScore
from app.providers.bitcoin import BitcoinProvider
from app.providers.ethereum import EthereumProvider
from app.rate_limiter import limiter
from app.services.clustering import get_cluster_info
from app.services.exposure import compute_exposure
from app.services.risk import RiskScorer

logger = logging.getLogger(__name__)

router = APIRouter()

PROVIDERS = {
    "btc": BitcoinProvider,
    "eth": EthereumProvider,
}


@router.get("/risk/{address}")
async def get_risk_score(
    address: str,
    chain: str = "eth",
    session: AsyncSession = Depends(get_session),
) -> RiskScore:
    provider = PROVIDERS[chain]()
    try:
        txs, _ = await provider.fetch_transactions(address, page=1, per_page=200)
    finally:
        await provider.close()

    scorer = RiskScorer(session)
    return await scorer.score(address, chain, txs)


@router.get("/risk/{address}/exposure")
async def get_exposure(
    address: str,
    chain: str = "eth",
    session: AsyncSession = Depends(get_session),
) -> dict:
    provider = PROVIDERS[chain]()
    try:
        txs, _ = await provider.fetch_transactions(address, page=1, per_page=200)
    finally:
        await provider.close()

    report = await compute_exposure(address, chain, txs, session)
    return report.to_dict()


@router.get("/cluster/{address}")
async def get_cluster(
    address: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    info = await get_cluster_info(address, session)
    if not info:
        return {"cluster_id": None, "addresses": [], "address_count": 0, "label": None}
    return info
