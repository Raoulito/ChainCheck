import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label
from app.models.schemas import NormalizedTx

logger = logging.getLogger(__name__)


class ExposureReport:
    def __init__(self):
        self.direct_exposure: dict[str, str] = {}
        self.indirect_exposure: dict[str, str] = {}
        self.total_volume_analyzed: str = "0"
        self.total_volume_usd: str | None = None
        self.hops_analyzed: int = 1

    def to_dict(self) -> dict:
        return {
            "direct_exposure": self.direct_exposure,
            "indirect_exposure": self.indirect_exposure,
            "total_volume_analyzed": self.total_volume_analyzed,
            "total_volume_usd": self.total_volume_usd,
            "hops_analyzed": self.hops_analyzed,
        }


async def compute_exposure(
    address: str,
    chain: str,
    transactions: list[NormalizedTx],
    session: AsyncSession,
) -> ExposureReport:
    """
    Compute direct exposure breakdown by entity type.
    Shows what percentage of an address's volume is exposed to risky entities.
    """
    report = ExposureReport()

    # Collect all counterparty addresses
    counterparty_volumes: dict[str, Decimal] = {}
    total_volume = Decimal("0")

    for tx in transactions:
        if tx.status == "failed" or tx.spam_score != "clean":
            continue

        value = Decimal(tx.value)
        total_volume += value

        counterparty: str | None = None
        if tx.from_address and tx.from_address.lower() != address.lower():
            counterparty = tx.from_address.lower()
        elif tx.to_address and tx.to_address.lower() != address.lower():
            counterparty = tx.to_address.lower()

        if counterparty:
            counterparty_volumes[counterparty] = (
                counterparty_volumes.get(counterparty, Decimal("0")) + value
            )

    if total_volume == 0:
        report.total_volume_analyzed = "0"
        return report

    report.total_volume_analyzed = str(total_volume)

    # Batch lookup labels for all counterparties
    addresses = list(counterparty_volumes.keys())
    result = await session.execute(
        select(Label).where(Label.address.in_(addresses))
    )
    label_map = {label.address: label for label in result.scalars()}

    # Compute volume by entity type
    volume_by_type: dict[str, Decimal] = {}
    labeled_volume = Decimal("0")

    for addr, volume in counterparty_volumes.items():
        if addr in label_map:
            entity_type = label_map[addr].entity_type
            volume_by_type[entity_type] = volume_by_type.get(entity_type, Decimal("0")) + volume
            labeled_volume += volume

    clean_volume = total_volume - labeled_volume

    # Compute percentages
    direct: dict[str, str] = {}
    for entity_type, volume in volume_by_type.items():
        pct = (volume / total_volume * 100).quantize(Decimal("0.1"))
        direct[entity_type] = f"{pct}%"

    clean_pct = (clean_volume / total_volume * 100).quantize(Decimal("0.1"))
    direct["clean"] = f"{clean_pct}%"

    report.direct_exposure = direct
    report.indirect_exposure = direct  # Same as direct for now (1-hop only)
    report.hops_analyzed = 1

    return report
