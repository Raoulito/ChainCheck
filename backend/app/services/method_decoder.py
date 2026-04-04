import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.method_signature import MethodSignature

logger = logging.getLogger(__name__)


async def batch_decode_methods(
    selectors: list[str], session: AsyncSession
) -> dict[str, str | None]:
    """
    Batch decode method selectors against the local method_signatures table.
    No live API calls — the table is populated by the daily bulk sync job.

    Returns: { "0xabcd1234": "swapExactETHForTokens(...)" or None }
    """
    if not selectors:
        return {}

    unique_selectors = list(set(selectors))
    result: dict[str, str | None] = {s: None for s in unique_selectors}

    try:
        stmt = select(MethodSignature).where(
            MethodSignature.selector.in_(unique_selectors)
        )
        rows = await session.execute(stmt)
        for sig in rows.scalars():
            result[sig.selector] = sig.short_name or sig.name
    except Exception as exc:
        logger.debug("Method decode lookup failed: %s", exc)

    return result
