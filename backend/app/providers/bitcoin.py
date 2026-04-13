import logging
from decimal import Decimal

from app.models.schemas import NormalizedTx
from app.providers.base import ChainProvider

logger = logging.getLogger(__name__)

# Primary: mempool.space (higher rate limits, same API format)
MEMPOOL_BASE = "https://mempool.space/api"
# Fallback: Blockstream
BLOCKSTREAM_BASE = "https://blockstream.info/api"

SATOSHI_DECIMALS = 8
SATS_PER_BTC = Decimal("100000000")


class BitcoinProvider(ChainProvider):
    def __init__(self):
        super().__init__()
        self._api_base = MEMPOOL_BASE
        self._using_fallback = False

    def chain_id(self) -> str:
        return "btc"

    def provider_name(self) -> str:
        return "mempool" if not self._using_fallback else "blockstream"

    def _switch_to_fallback(self) -> None:
        if not self._using_fallback:
            logger.warning("Mempool.space hit rate limit, switching to Blockstream fallback")
            self._using_fallback = True
            self._api_base = BLOCKSTREAM_BASE

    async def _btc_request(self, path: str) -> "httpx.Response":
        """Make a request, falling back to Blockstream on 429."""
        from app.errors import RateLimitError
        url = f"{self._api_base}{path}"
        try:
            return await self._rate_limited_request(url)
        except RateLimitError:
            if self._using_fallback:
                raise
            self._switch_to_fallback()
            url = f"{self._api_base}{path}"
            return await self._rate_limited_request(url)

    async def get_balance(self, address: str) -> str | None:
        response = await self._btc_request(f"/address/{address}")
        if response.status_code != 200:
            return None
        data = response.json()
        # chain_stats has funded/spent totals for confirmed txs
        funded = data.get("chain_stats", {}).get("funded_txo_sum", 0)
        spent = data.get("chain_stats", {}).get("spent_txo_sum", 0)
        return str(funded - spent)

    async def get_latest_block(self) -> int:
        response = await self._btc_request("/blocks/tip/height")
        return int(response.text.strip())

    async def fetch_transactions(
        self, address: str, page: int = 1, per_page: int = 50,
        direction: str | None = None, max_pages: int = 10,
    ) -> tuple[list[NormalizedTx], int]:
        all_txs = await self._fetch_all_txs(address)
        latest_block = await self.get_latest_block()

        normalized: list[NormalizedTx] = []
        for raw_tx in all_txs:
            tx = self._normalize_tx(raw_tx, address, latest_block)
            if tx is not None:
                normalized.append(tx)

        # Filter by direction before slicing so the tracer gets relevant txs
        if direction == "forward":
            normalized = [tx for tx in normalized if tx.from_address and tx.from_address.lower() == address.lower()]
        elif direction == "backward":
            normalized = [tx for tx in normalized if tx.to_address and tx.to_address.lower() == address.lower()]

        normalized.sort(key=lambda t: t.timestamp, reverse=True)
        total = len(normalized)

        start = (page - 1) * per_page
        end = start + per_page
        page_txs = normalized[start:end]

        return page_txs, total

    async def _fetch_all_txs(self, address: str) -> list[dict]:
        """Fetch all transactions using chain pagination (same for mempool.space and Blockstream)."""
        all_txs: list[dict] = []
        last_seen_txid: str | None = None
        max_pages = 10  # Safety cap

        for _ in range(max_pages):
            path = f"/address/{address}/txs"
            if last_seen_txid:
                path = f"/address/{address}/txs/chain/{last_seen_txid}"

            response = await self._btc_request(path)
            if response.status_code != 200:
                from app.errors import ProviderError
                raise ProviderError("bitcoin", f"API returned {response.status_code} for {path}", response.status_code)
            batch: list[dict] = response.json()

            if not batch:
                break

            all_txs.extend(batch)
            last_seen_txid = batch[-1]["txid"]

            if len(batch) < 25:
                break

        return all_txs

    def _normalize_tx(
        self, raw: dict, lookup_address: str, latest_block: int
    ) -> NormalizedTx | None:
        tx_hash = raw["txid"]
        block_height = raw.get("status", {}).get("block_height")
        block_time = raw.get("status", {}).get("block_time", 0)
        confirmed = raw.get("status", {}).get("confirmed", False)

        inputs = []
        total_input = Decimal("0")
        for vin in raw.get("vin", []):
            prev = vin.get("prevout") or {}
            addr = prev.get("scriptpubkey_address", "")
            val = Decimal(str(prev.get("value", 0)))
            total_input += val
            inputs.append({"address": addr, "value": str(val)})

        outputs = []
        total_output = Decimal("0")
        for vout in raw.get("vout", []):
            addr = vout.get("scriptpubkey_address", "")
            val = Decimal(str(vout.get("value", 0)))
            total_output += val
            outputs.append({"address": addr, "value": str(val)})

        fee = total_input - total_output
        fee_str = str(fee) if fee > 0 else "0"

        # Determine value relative to the lookup address
        sent_value = Decimal("0")
        received_value = Decimal("0")
        for inp in inputs:
            if inp["address"].lower() == lookup_address.lower():
                sent_value += Decimal(inp["value"])
        for out in outputs:
            if out["address"].lower() == lookup_address.lower():
                received_value += Decimal(out["value"])

        # Net value: positive = received, negative = sent
        net_value = received_value - sent_value
        value = abs(net_value)
        value_human = str(value / SATS_PER_BTC)

        # Determine from/to for display
        is_sender = sent_value > 0
        from_address: str | None = None
        to_address: str | None = None
        if is_sender:
            from_address = lookup_address
            for out in outputs:
                if out["address"].lower() != lookup_address.lower() and out["address"]:
                    to_address = out["address"]
                    break
        else:
            to_address = lookup_address
            for inp in inputs:
                if inp["address"].lower() != lookup_address.lower() and inp["address"]:
                    from_address = inp["address"]
                    break

        # Confirmations
        confirmations: int | None = None
        finalized = False
        if confirmed and block_height is not None:
            confirmations, finalized = self._compute_confirmations(block_height, latest_block)

        return NormalizedTx(
            tx_hash=tx_hash,
            chain="btc",
            from_address=from_address,
            to_address=to_address,
            value=str(value),
            value_human=value_human,
            value_usd_at_time=None,
            decimals=SATOSHI_DECIMALS,
            token="BTC",
            timestamp=block_time,
            block=block_height or 0,
            confirmations=confirmations,
            finalized=finalized,
            tx_type="native",
            status="success" if confirmed else "pending",
            spam_score="clean",
            method_name=None,
            inputs=inputs,
            outputs=outputs,
            fee=fee_str,
            change_output=None,
        )
