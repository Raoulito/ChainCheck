import asyncio
import logging

from app.config import config
from app.db import async_session
from app.services.label_importers import (
    import_etherscan_labels,
    import_ofac_sdn,
    import_opensanctions,
    import_walletexplorer_btc,
    import_chainabuse,
)

logger = logging.getLogger(__name__)


async def run_label_sync() -> dict[str, int]:
    """Run all label importers. Returns counts per source."""
    results: dict[str, int] = {}

    # Each importer gets its own session to isolate failures
    importers = [
        ("etherscan", lambda s: import_etherscan_labels(s)),
        ("ofac_sdn", lambda s: import_ofac_sdn(s)),
        ("opensanctions", lambda s: import_opensanctions(s)),
        ("walletexplorer", lambda s: import_walletexplorer_btc(s)),
        ("chainabuse", lambda s: import_chainabuse(s, config.chainabuse_api_key)),
    ]

    for name, importer_fn in importers:
        try:
            async with async_session() as session:
                results[name] = await importer_fn(session)
        except Exception as exc:
            logger.error("Importer '%s' failed: %s", name, exc)
            results[name] = 0

    total = sum(results.values())
    logger.info("Label sync complete: %d total new labels — %s", total, results)
    return results


if __name__ == "__main__":
    asyncio.run(run_label_sync())
