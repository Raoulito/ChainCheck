"""Shared base for all Etherscan-compatible EVM chain providers."""
import asyncio
import logging
from decimal import Decimal

from app.models.schemas import NormalizedTx
from app.providers.base import ChainProvider

logger = logging.getLogger(__name__)


class EvmBaseProvider(ChainProvider):
    """Base provider for any chain with an Etherscan-compatible API."""

    def _api_base(self) -> str:
        raise NotImplementedError

    def _api_key(self) -> str:
        raise NotImplementedError

    def _native_token(self) -> str:
        raise NotImplementedError

    def _native_decimals(self) -> int:
        return 18

    async def get_latest_block(self) -> int:
        response = await self._rate_limited_request(
            self._api_base(),
            params={
                "module": "proxy",
                "action": "eth_blockNumber",
                "apikey": self._api_key(),
            },
        )
        data = response.json()
        return int(data["result"], 16)

    async def fetch_transactions(
        self, address: str, page: int = 1, per_page: int = 50
    ) -> tuple[list[NormalizedTx], int]:
        warnings: list[str] = []
        latest_block = await self.get_latest_block()

        native_task = self._fetch_txlist(address, latest_block)
        token_task = self._fetch_tokentx(address, latest_block)
        internal_task = self._fetch_internal(address, latest_block, warnings)

        native_txs, token_txs, internal_txs = await asyncio.gather(
            native_task, token_task, internal_task
        )

        all_txs = native_txs + token_txs + internal_txs

        seen: set[str] = set()
        unique: list[NormalizedTx] = []
        for tx in all_txs:
            key = f"{tx.tx_hash}:{tx.tx_type}"
            if key not in seen:
                seen.add(key)
                unique.append(tx)

        unique.sort(key=lambda t: t.timestamp, reverse=True)
        total = len(unique)

        start = (page - 1) * per_page
        end = start + per_page
        return unique[start:end], total

    async def _fetch_txlist(self, address: str, latest_block: int) -> list[NormalizedTx]:
        return await self._paginate_by_block(address, "txlist", "native", latest_block)

    async def _fetch_tokentx(self, address: str, latest_block: int) -> list[NormalizedTx]:
        return await self._paginate_by_block(address, "tokentx", "token", latest_block)

    async def _fetch_internal(
        self, address: str, latest_block: int, warnings: list[str]
    ) -> list[NormalizedTx]:
        try:
            return await self._paginate_by_block(
                address, "txlistinternal", "internal", latest_block, max_retries=3
            )
        except Exception as exc:
            logger.warning(
                "txlistinternal failed for %s on %s: %s", address, self.chain_id(), exc
            )
            warnings.append(
                "Internal transactions unavailable. Showing native + token transfers only."
            )
            return []

    async def _paginate_by_block(
        self,
        address: str,
        action: str,
        tx_type: str,
        latest_block: int,
        max_retries: int = 2,
    ) -> list[NormalizedTx]:
        all_txs: list[NormalizedTx] = []
        start_block = 0
        end_block = latest_block
        page_size = 10000

        while True:
            params: dict = {
                "module": "account",
                "action": action,
                "address": address,
                "startblock": start_block,
                "endblock": end_block,
                "page": 1,
                "offset": page_size,
                "sort": "asc",
                "apikey": self._api_key(),
            }

            retries = 0
            batch: list[dict] = []
            while retries < max_retries:
                try:
                    response = await self._rate_limited_request(self._api_base(), params)
                    data = response.json()

                    if data.get("status") == "0":
                        message = data.get("message", "")
                        if "No transactions found" in message:
                            batch = []
                            break
                        if "Max rate limit reached" in message:
                            retries += 1
                            await asyncio.sleep(2)
                            continue
                        batch = []
                        break

                    batch = data.get("result", [])
                    break
                except Exception:
                    retries += 1
                    if retries >= max_retries:
                        raise
                    await asyncio.sleep(2)

            if not batch:
                break

            for raw in batch:
                tx = self._normalize_etherscan_tx(raw, tx_type, latest_block)
                if tx is not None:
                    all_txs.append(tx)

            if len(batch) < page_size:
                break

            last_block = int(batch[-1].get("blockNumber", start_block))
            start_block = last_block + 1
            if start_block > end_block:
                break

        return all_txs

    def _normalize_etherscan_tx(
        self, raw: dict, tx_type: str, latest_block: int
    ) -> NormalizedTx | None:
        block_number = int(raw.get("blockNumber", 0))
        timestamp = int(raw.get("timeStamp", 0))

        if tx_type == "token":
            value_raw = raw.get("value", "0")
            decimals = int(raw.get("tokenDecimal", 18))
            token = raw.get("tokenSymbol", "UNKNOWN")
        else:
            value_raw = raw.get("value", "0")
            decimals = self._native_decimals()
            token = self._native_token()

        value = Decimal(value_raw)
        if decimals > 0:
            value_human = str(value / Decimal(10**decimals))
        else:
            value_human = str(value)

        is_error = raw.get("isError", "0")
        status = "failed" if is_error == "1" else "success"
        if tx_type == "internal" and "isError" not in raw:
            err_code = raw.get("errCode", "")
            status = "failed" if err_code else "success"

        gas_price = raw.get("gasPrice", "0")
        gas_used = raw.get("gasUsed", "0")
        fee: str | None = None
        if gas_price and gas_used:
            fee = str(Decimal(gas_price) * Decimal(gas_used))

        confirmations, finalized = self._compute_confirmations(block_number, latest_block)

        input_data = raw.get("input", "0x")
        method_selector: str | None = None
        if input_data and len(input_data) >= 10 and input_data != "0x":
            method_selector = input_data[:10]

        from_addr = raw.get("from", "")
        to_addr = raw.get("to", "") or raw.get("contractAddress", "")

        return NormalizedTx(
            tx_hash=raw.get("hash", raw.get("transactionHash", "")),
            chain=self.chain_id(),
            from_address=from_addr.lower() if from_addr else None,
            to_address=to_addr.lower() if to_addr else None,
            value=str(value),
            value_human=value_human,
            value_usd_at_time=None,
            decimals=decimals,
            token=token,
            timestamp=timestamp,
            block=block_number,
            confirmations=confirmations,
            finalized=finalized,
            tx_type=tx_type if tx_type != "native" else (
                "contract" if input_data and len(input_data) > 10 else "native"
            ),
            status=status,
            spam_score="clean",
            method_name=method_selector,
            inputs=None,
            outputs=None,
            fee=fee,
            change_output=None,
        )
