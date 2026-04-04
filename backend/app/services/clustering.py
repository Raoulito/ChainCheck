import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster
from app.models.label import Label
from app.models.schemas import NormalizedTx

logger = logging.getLogger(__name__)


class UnionFind:
    """Disjoint Set Union for address clustering."""

    def __init__(self):
        self._parent: dict[str, str] = {}
        self._rank: dict[str, int] = {}

    def find(self, x: str) -> str:
        if x not in self._parent:
            self._parent[x] = x
            self._rank[x] = 0
        if self._parent[x] != x:
            self._parent[x] = self.find(self._parent[x])
        return self._parent[x]

    def union(self, x: str, y: str) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self._rank[rx] < self._rank[ry]:
            rx, ry = ry, rx
        self._parent[ry] = rx
        if self._rank[rx] == self._rank[ry]:
            self._rank[rx] += 1

    def get_cluster(self, x: str) -> set[str]:
        root = self.find(x)
        return {addr for addr in self._parent if self.find(addr) == root}


def _is_possible_coinjoin(tx: NormalizedTx) -> bool:
    """
    Detect potential CoinJoin transactions.
    CoinJoin: many inputs from different addresses AND many outputs of equal value.
    """
    if not tx.inputs or not tx.outputs:
        return False

    # Need at least 3 unique input addresses
    input_addrs = {inp.get("address", "") for inp in tx.inputs if inp.get("address")}
    if len(input_addrs) < 3:
        return False

    # Need at least 3 outputs
    if len(tx.outputs) < 3:
        return False

    # Check if many outputs have the same value
    output_values = [out.get("value", "0") for out in tx.outputs]
    value_counts: dict[str, int] = {}
    for v in output_values:
        value_counts[v] = value_counts.get(v, 0) + 1

    # If any value appears 3+ times, likely CoinJoin
    max_same_value = max(value_counts.values()) if value_counts else 0
    return max_same_value >= 3


def cluster_by_common_input(
    address: str, transactions: list[NormalizedTx]
) -> tuple[UnionFind, list[str]]:
    """
    Walk all BTC transactions for an address. For each tx,
    collect all input addresses — they belong to the same entity.
    Returns (union_find, skipped_coinjoin_txids).
    """
    uf = UnionFind()
    skipped: list[str] = []

    for tx in transactions:
        if tx.chain != "btc" or not tx.inputs:
            continue

        if _is_possible_coinjoin(tx):
            skipped.append(tx.tx_hash)
            logger.info("CoinJoin detected — clustering skipped for tx %s", tx.tx_hash)
            continue

        input_addrs = [
            inp.get("address", "").lower()
            for inp in tx.inputs
            if inp.get("address")
        ]

        for i in range(1, len(input_addrs)):
            uf.union(input_addrs[0], input_addrs[i])

    return uf, skipped


async def persist_clusters(
    uf: UnionFind, chain: str, session: AsyncSession
) -> int:
    """Save cluster assignments to the database. Returns count of new entries."""
    now = datetime.now(timezone.utc).isoformat()
    count = 0

    # Group addresses by cluster root
    clusters: dict[str, set[str]] = {}
    for addr in list(uf._parent.keys()):
        root = uf.find(addr)
        if root not in clusters:
            clusters[root] = set()
        clusters[root].add(addr)

    for root, members in clusters.items():
        if len(members) < 2:
            continue

        cluster_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, root))

        for addr in members:
            existing = await session.execute(
                select(Cluster).where(Cluster.address == addr)
            )
            if existing.scalar_one_or_none():
                continue

            entry = Cluster(
                address=addr,
                cluster_id=cluster_id,
                chain=chain,
                updated_at=now,
            )
            session.add(entry)
            count += 1

    try:
        await session.commit()
    except Exception:
        await session.rollback()

    return count


async def get_cluster_info(
    address: str, session: AsyncSession
) -> dict | None:
    """Get cluster info for an address, including label propagation."""
    result = await session.execute(
        select(Cluster).where(Cluster.address == address.lower())
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return None

    # Get all addresses in the same cluster
    members_result = await session.execute(
        select(Cluster).where(Cluster.cluster_id == entry.cluster_id)
    )
    members = [m.address for m in members_result.scalars()]

    # Check if any cluster member has a label
    labels_result = await session.execute(
        select(Label).where(Label.address.in_(members))
    )
    cluster_label = None
    for label in labels_result.scalars():
        cluster_label = {
            "entity_name": label.entity_name,
            "entity_type": label.entity_type,
            "source": label.source,
            "from_address": label.address,
        }
        break

    return {
        "cluster_id": entry.cluster_id,
        "addresses": members,
        "address_count": len(members),
        "label": cluster_label,
    }
