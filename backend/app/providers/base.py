import abc
import asyncio
import logging
from decimal import Decimal

import httpx

from app.config import config
from app.errors import ProviderError, RateLimitError
from app.models.schemas import NormalizedTx
from app.outbound_limiter import LIMITERS

logger = logging.getLogger(__name__)


class ChainProvider(abc.ABC):
    """Abstract base class for blockchain data providers."""

    def __init__(self):
        self._http_client = httpx.AsyncClient(timeout=30.0)

    @abc.abstractmethod
    def chain_id(self) -> str:
        """Return the chain identifier, e.g. 'btc' or 'eth'."""
        ...

    @abc.abstractmethod
    def provider_name(self) -> str:
        """Return the provider name for rate limiting, e.g. 'blockstream'."""
        ...

    @abc.abstractmethod
    async def fetch_transactions(
        self, address: str, page: int = 1, per_page: int = 50,
        direction: str | None = None, max_pages: int = 5,
    ) -> tuple[list[NormalizedTx], int]:
        """Fetch and normalize transactions. Returns (txs, total_count).
        direction: 'forward' returns only outgoing, 'backward' only incoming, None returns all.
        max_pages: max API pagination pages per endpoint (each page = 10k txs for EVM).
        """
        ...

    async def get_balance(self, address: str) -> str | None:
        """Return the on-chain balance in raw units, or None if unsupported."""
        return None

    @abc.abstractmethod
    async def get_latest_block(self) -> int:
        """Return the latest block number for confirmations calculation."""
        ...

    async def _rate_limited_request(
        self, url: str, params: dict | None = None, _retries: int = 3
    ) -> httpx.Response:
        """Make an HTTP request gated by the global token bucket, with 429 retry."""
        for attempt in range(_retries):
            limiter = LIMITERS.get(self.provider_name())
            try:
                if limiter:
                    async with limiter:
                        return await self._do_request(url, params)
                return await self._do_request(url, params)
            except RateLimitError:
                if attempt + 1 >= _retries:
                    raise
                wait = 2 ** attempt
                logger.info("429 from %s, retrying in %ds (attempt %d/%d)",
                            self.provider_name(), wait, attempt + 1, _retries)
                await asyncio.sleep(wait)
        raise ProviderError(self.provider_name(), "Max retries exceeded")

    async def _do_request(
        self, url: str, params: dict | None = None
    ) -> httpx.Response:
        """Execute the HTTP request with error handling."""
        try:
            response = await self._http_client.get(url, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderError(self.provider_name(), f"Timeout: {exc}") from exc
        except httpx.RequestError as exc:
            raise ProviderError(self.provider_name(), f"Request error: {exc}") from exc

        if response.status_code == 429:
            logger.warning("429 from %s — outbound limiter may be too fast", self.provider_name())
            raise RateLimitError(self.provider_name())

        if response.status_code >= 500:
            raise ProviderError(
                self.provider_name(),
                f"Server error {response.status_code}",
                response.status_code,
            )

        return response

    def _apply_dust_floor(self, txs: list[NormalizedTx]) -> tuple[list[NormalizedTx], int]:
        """Filter transactions below the dust floor. Returns (kept, dropped_count)."""
        floor = config.dust_floor.get(self.chain_id())
        if floor is None:
            return txs, 0

        kept: list[NormalizedTx] = []
        for tx in txs:
            if Decimal(tx.value) >= floor:
                kept.append(tx)

        dropped = len(txs) - len(kept)
        if dropped > 0:
            logger.info("Dust floor: dropped %d txs below %s for %s", dropped, floor, self.chain_id())
        return kept, dropped

    def _compute_confirmations(self, tx_block: int, latest_block: int) -> tuple[int, bool]:
        """Compute confirmations and finality status."""
        confirmations = latest_block - tx_block
        threshold = config.finality.get(self.chain_id(), 64)
        finalized = confirmations >= threshold
        return confirmations, finalized

    async def close(self):
        await self._http_client.aclose()
