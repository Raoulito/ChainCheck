import logging
from decimal import Decimal

import httpx

from app.models.schemas import ChangeDetection, NormalizedTx
from app.outbound_limiter import LIMITERS

logger = logging.getLogger(__name__)

BLOCKSTREAM_BASE = "https://blockstream.info/api"

# Address tx history cache to avoid repeated lookups
_address_history_cache: dict[str, int] = {}


async def detect_change_output(tx: NormalizedTx) -> ChangeDetection | None:
    """
    Apply heuristics to detect the change output in a BTC transaction.

    Priority 1: First-time-seen address (strongest signal)
    Priority 2: Round number analysis (good signal)
    Priority 3: Script type matching (weak signal, tie-breaker only)
    """
    if tx.chain != "btc" or not tx.outputs:
        return None

    if len(tx.outputs) < 2:
        return None

    heuristic_results: dict[int, list[tuple[str, str]]] = {}
    for i in range(len(tx.outputs)):
        heuristic_results[i] = []

    # --- Priority 1: First-time-seen address ---
    first_time_indices: list[int] = []
    for i, out in enumerate(tx.outputs):
        addr = out.get("address", "")
        if not addr:
            continue
        tx_count = await _get_address_tx_count(addr)
        if tx_count is not None and tx_count <= 1:
            first_time_indices.append(i)
            heuristic_results[i].append(
                ("first_time_seen", f"Output {i} goes to address with {tx_count} prior txs")
            )

    # --- Priority 2: Round number analysis ---
    round_indices: list[int] = []
    non_round_indices: list[int] = []
    for i, out in enumerate(tx.outputs):
        val = Decimal(out.get("value", "0"))
        if _is_round_number(val):
            round_indices.append(i)
        else:
            non_round_indices.append(i)
            heuristic_results[i].append(
                ("round_number", f"Output {i} has non-round value ({val} sats)")
            )

    # --- Priority 3: Script type matching (weak, tie-breaker only) ---
    input_script_types: set[str] = set()
    if tx.inputs:
        for inp in tx.inputs:
            addr = inp.get("address", "")
            if addr:
                input_script_types.add(_detect_script_type(addr))

    script_match_indices: list[int] = []
    for i, out in enumerate(tx.outputs):
        addr = out.get("address", "")
        if addr and _detect_script_type(addr) in input_script_types:
            script_match_indices.append(i)
            heuristic_results[i].append(
                ("script_type", f"Output {i} matches input script type")
            )

    # --- Scoring ---
    # Priority 1 alone: HIGH
    if len(first_time_indices) == 1:
        idx = first_time_indices[0]
        reasons = [r[1] for r in heuristic_results[idx]]
        heuristics = list({r[0] for r in heuristic_results[idx]})

        # Check if round number agrees
        confidence = "high"
        if idx in non_round_indices:
            confidence = "high"
            reasons.append("Round number analysis agrees — non-round value is likely change")
            if "round_number" not in heuristics:
                heuristics.append("round_number")

        return ChangeDetection(
            output_index=idx,
            confidence=confidence,
            reasons=reasons,
            heuristics_used=heuristics,
        )

    # Priority 2: exactly one non-round output, rest round → MEDIUM
    if len(non_round_indices) == 1 and len(round_indices) >= 1:
        idx = non_round_indices[0]
        reasons = [r[1] for r in heuristic_results[idx]]
        heuristics = list({r[0] for r in heuristic_results[idx]})

        return ChangeDetection(
            output_index=idx,
            confidence="medium",
            reasons=reasons,
            heuristics_used=heuristics,
        )

    # Priority 3: script type match as tie-breaker → LOW
    if len(script_match_indices) == 1:
        idx = script_match_indices[0]
        reasons = [r[1] for r in heuristic_results[idx]]
        heuristics = list({r[0] for r in heuristic_results[idx]})

        return ChangeDetection(
            output_index=idx,
            confidence="low",
            reasons=reasons,
            heuristics_used=heuristics,
        )

    return None


async def _get_address_tx_count(address: str) -> int | None:
    """Check if an address has been seen before (tx_count)."""
    if address in _address_history_cache:
        return _address_history_cache[address]

    try:
        limiter = LIMITERS.get("blockstream")
        async with httpx.AsyncClient(timeout=10.0) as client:
            if limiter:
                async with limiter:
                    response = await client.get(f"{BLOCKSTREAM_BASE}/address/{address}")
            else:
                response = await client.get(f"{BLOCKSTREAM_BASE}/address/{address}")

            if response.status_code == 200:
                data = response.json()
                count = data.get("chain_stats", {}).get("tx_count", 0)
                count += data.get("mempool_stats", {}).get("tx_count", 0)
                _address_history_cache[address] = count
                return count
    except Exception as exc:
        logger.debug("Failed to check address history for %s: %s", address, exc)

    return None


def _is_round_number(satoshis: Decimal) -> bool:
    """Check if a value in satoshis is a 'round' number in BTC terms."""
    btc_value = satoshis / Decimal("100000000")

    round_thresholds = [
        Decimal("1"),
        Decimal("0.5"),
        Decimal("0.1"),
        Decimal("0.05"),
        Decimal("0.01"),
        Decimal("0.005"),
        Decimal("0.001"),
    ]

    for threshold in round_thresholds:
        if btc_value > 0 and btc_value % threshold == 0:
            return True

    return False


def _detect_script_type(address: str) -> str:
    """Detect BTC address script type from the address format."""
    if address.startswith("bc1q"):
        return "p2wpkh"
    elif address.startswith("bc1p"):
        return "p2tr"
    elif address.startswith("3"):
        return "p2sh"
    elif address.startswith("1"):
        return "p2pkh"
    return "unknown"
