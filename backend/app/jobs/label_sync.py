import asyncio
import logging

from app.db import async_session
from app.services.label_importers import (
    import_etherscan_labels,
    import_ofac_sdn,
    import_walletexplorer_btc,
)

logger = logging.getLogger(__name__)


async def run_label_sync() -> dict[str, int]:
    """Run all label importers. Returns counts per source."""
    results: dict[str, int] = {}

    async with async_session() as session:
        results["etherscan"] = await import_etherscan_labels(session)
        results["ofac_sdn"] = await import_ofac_sdn(session)
        results["walletexplorer"] = await import_walletexplorer_btc(session)

    total = sum(results.values())
    logger.info("Label sync complete: %d total new labels — %s", total, results)
    return results


if __name__ == "__main__":
    asyncio.run(run_label_sync())
