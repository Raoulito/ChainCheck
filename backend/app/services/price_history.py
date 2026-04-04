import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.models.historical_price import HistoricalPrice
from app.models.schemas import PriceQuery
from app.outbound_limiter import LIMITERS

logger = logging.getLogger(__name__)

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

TOKEN_TO_COINGECKO_ID: dict[str, str] = {
    "ETH": "ethereum",
    "BTC": "bitcoin",
    "USDT": "tether",
    "USDC": "usd-coin",
    "DAI": "dai",
    "WETH": "weth",
    "WBTC": "wrapped-bitcoin",
}


async def enrich_prices(
    queries: list[PriceQuery], session: AsyncSession
) -> tuple[dict[str, str], int, int]:
    """
    Enrich transaction prices from cache or CoinGecko.
    Returns (prices_dict, pending_count, cached_count).
    """
    # Deduplicate by (token, date)
    unique_keys: dict[str, PriceQuery] = {}
    for q in queries:
        coingecko_id = TOKEN_TO_COINGECKO_ID.get(q.token.upper(), q.token.lower())
        key = f"{coingecko_id}:{q.date}"
        if key not in unique_keys:
            unique_keys[key] = q

    prices: dict[str, str] = {}
    cached_count = 0
    pending_count = 0

    for key, query in unique_keys.items():
        coingecko_id = key.split(":")[0]

        # Check cache first
        cached = await _get_cached_price(coingecko_id, query.date, session)
        if cached is not None:
            prices[key] = cached
            cached_count += 1
            continue

        # Fetch from CoinGecko (rate-limited)
        price = await _fetch_price(coingecko_id, query.date)
        if price is not None:
            prices[key] = price
            await _cache_price(coingecko_id, query.date, price, session)
            cached_count += 1
        else:
            pending_count += 1

    return prices, pending_count, cached_count


async def _get_cached_price(
    token: str, date: str, session: AsyncSession
) -> str | None:
    stmt = select(HistoricalPrice).where(
        HistoricalPrice.token == token,
        HistoricalPrice.date == date,
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    return row.price_usd if row else None


async def _cache_price(
    token: str, date: str, price: str, session: AsyncSession
) -> None:
    try:
        entry = HistoricalPrice(token=token, date=date, price_usd=price)
        session.add(entry)
        await session.commit()
    except Exception:
        await session.rollback()


async def _fetch_price(coingecko_id: str, date_str: str) -> str | None:
    """Fetch historical price from CoinGecko."""
    try:
        # Convert "2024-03-15" to "15-03-2024" for CoinGecko
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        cg_date = dt.strftime("%d-%m-%Y")

        import httpx

        limiter = LIMITERS.get("coingecko")
        async with httpx.AsyncClient(timeout=15.0) as client:
            params: dict = {
                "date": cg_date,
                "localization": "false",
            }
            if config.coingecko_api_key:
                params["x_cg_demo_api_key"] = config.coingecko_api_key

            if limiter:
                async with limiter:
                    response = await client.get(
                        f"{COINGECKO_BASE}/coins/{coingecko_id}/history",
                        params=params,
                    )
            else:
                response = await client.get(
                    f"{COINGECKO_BASE}/coins/{coingecko_id}/history",
                    params=params,
                )

            if response.status_code != 200:
                logger.warning("CoinGecko returned %d for %s:%s", response.status_code, coingecko_id, date_str)
                return None

            data = response.json()
            market_data = data.get("market_data", {})
            current_price = market_data.get("current_price", {})
            usd_price = current_price.get("usd")

            if usd_price is not None:
                return f"{usd_price:.2f}"

    except Exception as exc:
        logger.warning("CoinGecko fetch failed for %s:%s — %s", coingecko_id, date_str, exc)

    return None
