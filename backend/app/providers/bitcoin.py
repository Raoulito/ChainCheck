import logging
from decimal import Decimal

from app.models.schemas import NormalizedTx, ChangeDetection
from app.providers.base import ChainProvider

logger = logging.getLogger(__name__)

BLOCKSTREAM_BASE = "https://blockstream.info/api"
SATOSHI_DECIMALS = 8
SATS_PER_BTC = Decimal("100000000")


class BitcoinProvider(ChainProvider):
    def chain_id(self) -> str:
        return "btc"

    def provider_name(self) -> str:
        return "blockstream"

    async def get_latest_block(self) -> int:
        response = await self._rate_limited_request(f"{BLOCKSTREAM_BASE}/blocks/tip/height")
        return int(response.text.strip())

    async def fetch_transactions(
        self, address: str, page: int = 1, per_page: int = 50
    ) -> tuple[list[NormalizedTx], int]:
        all_txs = await self._fetch_all_txs(address)
        latest_block = await self.get_latest_block()

        normalized: list[NormalizedTx] = []
        for raw_tx in all_txs:
            tx = self._normalize_tx(raw_tx, address, latest_block)
            if tx is not None:
                normalized.append(tx)

        normalized.sort(key=lambda t: t.timestamp, reverse=True)
        total = len(normalized)

        start = (page - 1) * per_page
        end = start + per_page
        page_txs = normalized[start:end]

        return page_txs, total

    async def _fetch_all_txs(self, address: str) -> list[dict]:
        """Fetch all transactions using Blockstream's last_seen_txid pagination."""
        all_txs: list[dict] = []
        last_seen_txid: str | None = None

        while True:
            url = f"{BLOCKSTREAM_BASE}/address/{address}/txs"
            if last_seen_txid:
                url = f"{url}/chain/{last_seen_txid}"

            response = await self._rate_limited_request(url)
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
