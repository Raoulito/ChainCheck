import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label
from app.models.schemas import NormalizedTx, RiskReason, RiskScore

logger = logging.getLogger(__name__)

# Rule definitions: (rule_name, entity_types_to_check, severity, weight)
RISK_RULES = [
    ("is_sanctioned", ["sanctioned"], "SEVERE", 100),
    ("1hop_sanctioned", ["sanctioned"], "HIGH", 80),
    ("mixer_interaction", ["mixer"], "HIGH", 75),
    ("darknet_interaction", ["darknet"], "MEDIUM", 50),
    ("gambling_interaction", ["gambling"], "MEDIUM", 40),
]

SEVERITY_ORDER = {"SEVERE": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}


class RiskScorer:
    """Compute risk score for an address based on labels and transaction history."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def score(
        self, address: str, chain: str, transactions: list[NormalizedTx]
    ) -> RiskScore:
        reasons: list[RiskReason] = []

        # Check if address itself is labeled
        own_label = await self._get_label(address)

        if own_label and own_label.entity_type == "sanctioned":
            reasons.append(RiskReason(
                rule="is_sanctioned",
                detail=f"Address is directly sanctioned ({own_label.entity_name}, source: {own_label.source})",
                severity="SEVERE",
            ))

        if own_label and own_label.entity_type == "mixer":
            reasons.append(RiskReason(
                rule="is_mixer",
                detail=f"Address belongs to a known mixer ({own_label.entity_name})",
                severity="HIGH",
            ))

        # Check counterparties in transaction history
        counterparty_addresses = set()
        for tx in transactions:
            if tx.status == "failed" or tx.spam_score != "clean":
                continue
            if tx.from_address and tx.from_address.lower() != address.lower():
                counterparty_addresses.add(tx.from_address.lower())
            if tx.to_address and tx.to_address.lower() != address.lower():
                counterparty_addresses.add(tx.to_address.lower())

        # Batch lookup counterparty labels
        counterparty_labels = await self._batch_get_labels(list(counterparty_addresses))

        # Compute volume per risky entity type
        volume_by_type: dict[str, Decimal] = {}

        for tx in transactions:
            if tx.status == "failed" or tx.spam_score != "clean":
                continue

            counterparty = None
            if tx.from_address and tx.from_address.lower() != address.lower():
                counterparty = tx.from_address.lower()
            elif tx.to_address and tx.to_address.lower() != address.lower():
                counterparty = tx.to_address.lower()

            if counterparty and counterparty in counterparty_labels:
                label = counterparty_labels[counterparty]
                entity_type = label.entity_type
                volume = Decimal(tx.value)
                volume_by_type[entity_type] = volume_by_type.get(entity_type, Decimal("0")) + volume

        # Check for 1-hop sanctioned
        for addr, label in counterparty_labels.items():
            if label.entity_type == "sanctioned":
                vol = volume_by_type.get("sanctioned", Decimal("0"))
                reasons.append(RiskReason(
                    rule="1hop_sanctioned",
                    detail=f"Direct transaction with sanctioned entity: {label.entity_name} (volume: {vol})",
                    severity="HIGH",
                ))
                break

        # Check for mixer interaction
        for addr, label in counterparty_labels.items():
            if label.entity_type == "mixer":
                vol = volume_by_type.get("mixer", Decimal("0"))
                reasons.append(RiskReason(
                    rule="mixer_interaction",
                    detail=f"Direct transaction with mixer: {label.entity_name} (volume: {vol})",
                    severity="HIGH",
                ))
                break

        # Check for darknet interaction
        for addr, label in counterparty_labels.items():
            if label.entity_type == "darknet":
                vol = volume_by_type.get("darknet", Decimal("0"))
                reasons.append(RiskReason(
                    rule="darknet_interaction",
                    detail=f"Direct transaction with darknet entity: {label.entity_name} (volume: {vol})",
                    severity="MEDIUM",
                ))
                break

        # Check for gambling interaction
        for addr, label in counterparty_labels.items():
            if label.entity_type == "gambling":
                vol = volume_by_type.get("gambling", Decimal("0"))
                reasons.append(RiskReason(
                    rule="gambling_interaction",
                    detail=f"Direct transaction with gambling entity: {label.entity_name} (volume: {vol})",
                    severity="MEDIUM",
                ))
                break

        # Persist runtime labels for the looked-up address if it interacts with flagged entities
        flagged_types = {"sanctioned", "mixer", "darknet"}
        for addr, label in counterparty_labels.items():
            if label.entity_type in flagged_types:
                await self._persist_runtime_label(
                    address, chain, label.entity_name, label.entity_type, addr,
                )

        # Aggregate: highest severity wins
        if not reasons:
            score = "LOW"
        else:
            score = max(reasons, key=lambda r: SEVERITY_ORDER.get(r.severity, 0)).severity

        return RiskScore(
            score=score,
            reasons=reasons,
            computed_at=datetime.now(timezone.utc).isoformat(),
            stale=False,
        )

    async def _get_label(self, address: str) -> Label | None:
        result = await self._session.execute(
            select(Label).where(Label.address == address.lower())
        )
        return result.scalar_one_or_none()

    async def _batch_get_labels(self, addresses: list[str]) -> dict[str, Label]:
        if not addresses:
            return {}

        result = await self._session.execute(
            select(Label).where(Label.address.in_(addresses))
        )
        return {label.address: label for label in result.scalars()}

    async def _persist_runtime_label(
        self,
        address: str,
        chain: str,
        flag_name: str,
        flag_type: str,
        flag_addr: str,
    ) -> None:
        """Label an address that directly interacts with a flagged entity."""
        existing = await self._get_label(address)
        if existing:
            # Never overwrite authoritative or legitimate labels
            if existing.source in ("ofac_sdn", "etherscan_known", "walletexplorer"):
                return
            if existing.entity_type in ("exchange", "defi", "historical"):
                return
            if existing.source == "runtime_trace":
                return

        now = datetime.now(timezone.utc).isoformat()
        label = Label(
            address=address.lower(),
            chain=chain,
            entity_name=f"direct link to {flag_name}",
            entity_type="flagged_counterparty",
            source="runtime_trace",
            confidence="high",
            updated_at=now,
        )
        try:
            await self._session.merge(label)
            await self._session.commit()
        except Exception as exc:
            logger.debug("Runtime label write failed for %s: %s", address[:12], exc)
            await self._session.rollback()
