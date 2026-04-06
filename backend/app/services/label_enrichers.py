"""
On-demand label enrichers for ChainScope.

These check external sources for a specific address and persist
findings to the local label DB. Called during risk scoring /
label lookups when an address has no existing label.

  - check_chainalysis_oracle: Chainalysis OFAC sanctions oracle (ETH only)
  - lookup_arkham: Arkham Intelligence entity lookup (requires API key)
"""
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label

logger = logging.getLogger(__name__)

# Chainalysis sanctions oracle contract on Ethereum mainnet
_ORACLE_ADDRESS = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb"
# keccak256("isSanctioned(address)")[:4] = 0xdfb80831
_IS_SANCTIONED_SELECTOR = "0xdfb80831"

_PUBLIC_RPC = "https://eth.llamarpc.com"


async def check_chainalysis_oracle(
    address: str,
    session: AsyncSession,
) -> bool:
    """
    Check if an ETH address is sanctioned via the Chainalysis on-chain oracle.
    Returns True if sanctioned (and persists a label). Only works for ETH addresses.
    """
    if not address.startswith("0x") or len(address) != 42:
        return False

    addr_padded = address.lower().replace("0x", "").zfill(64)
    call_data = f"{_IS_SANCTIONED_SELECTOR}{addr_padded}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _PUBLIC_RPC,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [
                        {"to": _ORACLE_ADDRESS, "data": call_data},
                        "latest",
                    ],
                    "id": 1,
                },
            )
            if resp.status_code != 200:
                return False

            result = resp.json().get("result", "0x")
            # Result is a bool: 0x...0001 = true, 0x...0000 = false
            is_sanctioned = result != "0x" and int(result, 16) != 0

            if is_sanctioned:
                # Persist to DB
                existing = await session.execute(
                    select(Label).where(
                        func.lower(Label.address) == address.lower()
                    )
                )
                if not existing.scalar_one_or_none():
                    now = datetime.now(timezone.utc).isoformat()
                    session.add(Label(
                        address=address.lower(),
                        chain="eth",
                        entity_name="Chainalysis Sanctioned",
                        entity_type="sanctioned",
                        source="chainalysis_oracle",
                        confidence="high",
                        updated_at=now,
                    ))
                    await session.commit()
                    logger.info("Chainalysis oracle: %s is sanctioned", address)

            return is_sanctioned

    except Exception as exc:
        logger.debug("Chainalysis oracle check failed for %s: %s", address, exc)
        return False


async def lookup_arkham(
    address: str,
    chain: str,
    api_key: str,
    session: AsyncSession,
) -> dict | None:
    """
    Look up an address on Arkham Intelligence.
    Returns entity info if found, None otherwise.
    Persists the label to DB if found.
    """
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(
            timeout=10.0,
            headers={"API-Key": api_key, "Accept": "application/json"},
        ) as client:
            resp = await client.get(
                f"https://api.arkhamintelligence.com/intelligence/address/{address}",
            )
            if resp.status_code == 404:
                return None
            if resp.status_code == 401:
                logger.warning("Arkham API: invalid API key")
                return None
            if resp.status_code != 200:
                return None

            data = resp.json()
            entity = data.get("arkhamEntity") or data.get("entity")
            if not entity:
                return None

            entity_name = entity.get("name", "Unknown")
            entity_type_raw = entity.get("type", "").lower()

            # Map Arkham types to our types
            type_map = {
                "exchange": "exchange",
                "cex": "exchange",
                "dex": "defi",
                "defi": "defi",
                "bridge": "bridge",
                "mixer": "mixer",
                "gambling": "gambling",
                "scam": "scam",
                "sanctioned": "sanctioned",
                "fund": "service",
                "mev": "mev",
                "mining": "mining_pool",
            }
            entity_type = type_map.get(entity_type_raw, "service")

            # Persist to DB
            norm_addr = address if chain == "btc" else address.lower()
            existing = await session.execute(
                select(Label).where(Label.address == norm_addr)
            )
            if not existing.scalar_one_or_none():
                now = datetime.now(timezone.utc).isoformat()
                session.add(Label(
                    address=norm_addr,
                    chain=chain,
                    entity_name=entity_name,
                    entity_type=entity_type,
                    source="arkham",
                    confidence="medium",
                    updated_at=now,
                ))
                await session.commit()
                logger.info("Arkham: labeled %s as %s (%s)", address, entity_name, entity_type)

            return {"entity_name": entity_name, "entity_type": entity_type}

    except Exception as exc:
        logger.debug("Arkham lookup failed for %s: %s", address, exc)
        return None
