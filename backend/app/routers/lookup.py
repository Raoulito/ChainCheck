import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.db import get_session
from app.models.cached_transaction import CachedTransaction
from app.models.schemas import (
    AddressStats,
    LookupResponse,
    NormalizedTx,
)
from app.providers.registry import PROVIDER_REGISTRY as PROVIDERS
from app.rate_limiter import limiter
from app.services.address_validator import validate_address
from app.services.change_detect import detect_change_output
from app.services.method_decoder import batch_decode_methods
from app.services.spam_filter import apply_spam_filter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/lookup/{chain}/{address}")
@limiter.limit("30/minute")
async def lookup_address(
    request: Request,
    chain: str,
    address: str,
    page: int = 1,
    per_page: int = 50,
    session: AsyncSession = Depends(get_session),
) -> LookupResponse:
    validate_address(chain, address)

    provider_cls = PROVIDERS.get(chain)
    if not provider_cls:
        from app.errors import ValidationError
        raise ValidationError(f"No provider for chain: {chain}")

    provider = provider_cls()

    try:
        # Fetch with raised page cap (20 pages × 10k = 200k txs per endpoint)
        # so stats cover the full history for most addresses.
        all_txs, total_from_provider = await provider.fetch_transactions(
            address, page=1, per_page=10000, max_pages=20,
        )
        # Get the real on-chain balance instead of computing from partial tx history
        on_chain_balance = await provider.get_balance(address)
    finally:
        await provider.close()

    # Pipeline: spam filter → dust floor → change detect → method decode → stats

    # 1. Spam filter
    all_txs, spam_count = apply_spam_filter(all_txs)

    # 2. Dust floor
    clean_txs = [tx for tx in all_txs if tx.spam_score == "clean"]
    spam_txs = [tx for tx in all_txs if tx.spam_score != "clean"]
    clean_txs, dust_count = provider._apply_dust_floor(clean_txs)
    all_txs = clean_txs + spam_txs

    # 3. Compute stats from the FULL set (exclude failed, spam, dust)
    failed_count = sum(1 for tx in all_txs if tx.status == "failed")
    stats = _compute_stats(all_txs, address, chain, on_chain_balance)

    # 4. Sort and paginate for display
    all_txs.sort(key=lambda t: t.timestamp, reverse=True)
    total_all = len(all_txs)
    start = (page - 1) * per_page
    end = start + per_page
    page_txs = all_txs[start:end]

    # 5. Change detection (BTC only, display page only)
    if chain == "btc":
        for i, tx in enumerate(page_txs):
            if tx.change_output is None and tx.outputs and len(tx.outputs) >= 2:
                change = await detect_change_output(tx)
                if change:
                    page_txs[i] = tx.model_copy(update={"change_output": change})

    # 6. Method decode (ETH only, display page only)
    if chain in ("eth", "bsc", "polygon"):
        selectors = [
            tx.method_name for tx in page_txs
            if tx.method_name and tx.method_name.startswith("0x")
        ]
        if selectors:
            decoded = await batch_decode_methods(selectors, session)
            for i, tx in enumerate(page_txs):
                if tx.method_name and tx.method_name in decoded and decoded[tx.method_name]:
                    page_txs[i] = tx.model_copy(update={"method_name": decoded[tx.method_name]})

    # 7. Cache finalized transactions
    await _cache_finalized(page_txs, chain, session)

    return LookupResponse(
        address=address,
        chain=chain,
        transactions=page_txs,
        total=total_all,
        page=page,
        per_page=per_page,
        spam_filtered=spam_count,
        failed_filtered=failed_count,
        dust_filtered=dust_count,
        stats=stats,
        warnings=[],
    )


def _compute_stats(
    txs: list[NormalizedTx], address: str, chain: str,
    on_chain_balance: str | None = None,
) -> AddressStats:
    """Compute address stats from successful, non-spam, non-dust transactions."""
    total_received = Decimal("0")
    total_sent = Decimal("0")
    balance_unconfirmed = Decimal("0")
    timestamps: list[int] = []

    for tx in txs:
        if tx.status == "failed" or tx.spam_score != "clean":
            continue

        value = Decimal(tx.value)

        # Determine direction
        is_received = False
        if chain in ("eth", "bsc", "polygon"):
            is_received = (tx.to_address or "").lower() == address.lower()
        elif chain == "btc":
            if tx.outputs:
                for out in tx.outputs:
                    if out.get("address", "").lower() == address.lower():
                        is_received = True
                        break

        if is_received:
            total_received += value
        else:
            total_sent += value

        if not tx.finalized:
            if is_received:
                balance_unconfirmed += value
            else:
                balance_unconfirmed -= value

        if tx.timestamp > 0:
            timestamps.append(tx.timestamp)

    # Use real on-chain balance and reconcile received/sent so the math is consistent.
    # The tx-derived totals miss gas fees, internal transfers, contract interactions, etc.
    # We adjust sent so that: received - sent = on-chain balance.
    if on_chain_balance is not None:
        real_balance = Decimal(on_chain_balance)
        # The gap is everything we missed (gas, partial history, internal txs, etc.)
        gap = (total_received - total_sent) - real_balance
        # Attribute the gap to sent (gas fees, missed outgoing txs)
        total_sent += gap
        balance = on_chain_balance
    else:
        balance = str(total_received - total_sent)

    count = sum(1 for tx in txs if tx.status != "failed" and tx.spam_score == "clean")

    return AddressStats(
        total_received=str(total_received),
        total_sent=str(total_sent),
        balance=balance,
        balance_unconfirmed=str(balance_unconfirmed),
        tx_count=count,
        first_seen=min(timestamps) if timestamps else None,
        last_seen=max(timestamps) if timestamps else None,
    )


async def _cache_finalized(
    txs: list[NormalizedTx], chain: str, session: AsyncSession
) -> None:
    """Cache finalized transactions in the database."""
    now = datetime.now(timezone.utc).isoformat()

    for tx in txs:
        if not tx.finalized:
            continue

        try:
            existing = await session.execute(
                select(CachedTransaction).where(
                    CachedTransaction.tx_hash == tx.tx_hash,
                    CachedTransaction.chain == chain,
                )
            )
            if existing.scalar_one_or_none():
                continue

            cached = CachedTransaction(
                tx_hash=tx.tx_hash,
                chain=chain,
                block=tx.block,
                data=tx.model_dump_json(),
                finalized=True,
                cached_at=now,
            )
            session.add(cached)
        except Exception as exc:
            logger.debug("Cache write failed for %s: %s", tx.tx_hash, exc)

    try:
        await session.commit()
    except Exception:
        await session.rollback()
