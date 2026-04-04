import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label
from app.models.schemas import NormalizedTx

logger = logging.getLogger(__name__)


class PeelingChainResult:
    def __init__(self):
        self.detected: bool = False
        self.chain_length: int = 0
        self.total_peeled: str = "0"
        self.total_peeled_usd: str | None = None
        self.peel_destinations: list[dict] = []
        self.remainder_address: str | None = None
        self.remainder_amount: str = "0"

    def to_dict(self) -> dict:
        return {
            "detected": self.detected,
            "chain_length": self.chain_length,
            "total_peeled": self.total_peeled,
            "total_peeled_usd": self.total_peeled_usd,
            "peel_destinations": self.peel_destinations,
            "remainder_address": self.remainder_address,
            "remainder_amount": self.remainder_amount,
        }


async def detect_peeling_chain(
    address: str,
    transactions: list[NormalizedTx],
    session: AsyncSession,
) -> PeelingChainResult:
    """
    Detect peeling chains in BTC transactions.

    Pattern: [large input] -> [small output to exchange] + [large output to new address]
    Repeated 3+ times consecutively.
    """
    result = PeelingChainResult()

    # Filter to BTC outgoing transactions with change detection, sorted by time
    candidates = [
        tx for tx in transactions
        if tx.chain == "btc"
        and tx.outputs
        and len(tx.outputs) >= 2
        and tx.change_output is not None
        and tx.status == "success"
    ]
    candidates.sort(key=lambda t: t.timestamp)

    if len(candidates) < 3:
        return result

    # Collect all non-change output addresses for label lookup
    non_change_addrs: set[str] = set()
    for tx in candidates:
        change_idx = tx.change_output.output_index if tx.change_output else -1
        for i, out in enumerate(tx.outputs):
            if i != change_idx and out.get("address"):
                non_change_addrs.add(out["address"].lower())

    # Batch label lookup
    labels_result = await session.execute(
        select(Label).where(Label.address.in_(list(non_change_addrs)))
    )
    label_map = {l.address: l for l in labels_result.scalars()}

    # Detect consecutive peeling pattern
    peel_streak = 0
    peels: list[dict] = []
    last_change_addr: str | None = None

    for tx in candidates:
        change_idx = tx.change_output.output_index if tx.change_output else -1

        # Find the non-change outputs
        non_change_outputs = [
            (i, out) for i, out in enumerate(tx.outputs)
            if i != change_idx
        ]
        change_output = tx.outputs[change_idx] if 0 <= change_idx < len(tx.outputs) else None

        if not non_change_outputs or not change_output:
            peel_streak = 0
            continue

        # Check if non-change output is a "small peel" to a known entity
        total_output = sum(Decimal(out.get("value", "0")) for _, out in non_change_outputs)
        change_value = Decimal(change_output.get("value", "0"))

        # Peel pattern: small outputs < 10% of total tx value
        total_tx_value = total_output + change_value
        if total_tx_value == 0:
            peel_streak = 0
            continue

        peel_ratio = total_output / total_tx_value

        if peel_ratio < Decimal("0.10"):
            # Check if any non-change output goes to a known entity
            has_exchange_dest = False
            for _, out in non_change_outputs:
                addr = out.get("address", "").lower()
                if addr in label_map and label_map[addr].entity_type == "exchange":
                    has_exchange_dest = True
                    peels.append({
                        "address": addr,
                        "label": label_map[addr].entity_name,
                        "amount": str(total_output),
                    })
                    break

            if has_exchange_dest:
                peel_streak += 1
                last_change_addr = change_output.get("address")
            else:
                peel_streak = 0
        else:
            peel_streak = 0

    if peel_streak >= 3 and peels:
        result.detected = True
        result.chain_length = peel_streak
        result.total_peeled = str(sum(Decimal(p["amount"]) for p in peels))
        result.peel_destinations = peels
        result.remainder_address = last_change_addr
        if last_change_addr:
            # The remainder is in the last change output
            for tx in reversed(candidates):
                if tx.change_output:
                    idx = tx.change_output.output_index
                    if idx < len(tx.outputs):
                        result.remainder_amount = tx.outputs[idx].get("value", "0")
                        break

    return result
