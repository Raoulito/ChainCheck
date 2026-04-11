import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.jobs.trace_jobs import TraceJob, JobStatus
from app.models.label import Label
from app.providers.registry import PROVIDER_REGISTRY as PROVIDERS

logger = logging.getLogger(__name__)

# API budget split per hop (percentages)
HOP_BUDGET = {1: 0.40, 2: 0.35, 3: 0.25}


async def run_trace(job: TraceJob, session: AsyncSession) -> None:
    """BFS trace engine. Pushes SSE delta events to job.events queue."""
    job.status = JobStatus.RUNNING
    start_time = time.time()

    provider_cls = PROVIDERS.get(job.chain)
    if not provider_cls:
        await _emit(job, "failed", {"error": f"No provider for chain: {job.chain}", "partial": False})
        job.status = JobStatus.FAILED
        return

    provider = provider_cls()
    total_api_budget = config.trace_max_api_calls
    api_calls_used = 0
    min_value = Decimal(job.min_value) if job.min_value != "0" else Decimal("0")

    visited: set[str] = set()
    nodes: list[dict] = []
    edges: list[dict] = []
    pruned: list[dict] = []

    # BTC addresses are case-sensitive; EVM are not
    def _norm(addr: str) -> str:
        return addr if job.chain == "btc" else addr.lower()

    # Track flagged ancestors so we can propagate context to children
    # Maps address -> (flag_type, flag_name, flag_address)
    flagged_context: dict[str, tuple[str, str, str]] = {}

    # BFS queue: (address, hop_level)
    root_addr = _norm(job.address)
    queue: list[tuple[str, int]] = [(root_addr, 0)]
    visited.add(root_addr)

    # Add root node
    root_label_info = await _get_label_full(root_addr, session)
    root_label_text = root_label_info["entity_name"] if root_label_info else None
    if root_label_info and root_label_info["entity_type"] in ("sanctioned", "mixer", "darknet"):
        flag_type = root_label_info["entity_type"]
        flag_name = root_label_info["entity_name"]
        flagged_context[root_addr] = (flag_type, flag_name, root_addr)
        root_label_text = f"{flag_name} ({flag_type})"

    root_node = {
        "address": root_addr,
        "label": root_label_text,
        "risk": _risk_from_type(root_label_info["entity_type"]) if root_label_info else None,
        "hop": 0,
    }
    nodes.append(root_node)
    await _emit(job, "node_discovered", root_node)

    try:
        while queue:
            if job.status == JobStatus.CANCELLED:
                break

            address, hop = queue.pop(0)

            if hop >= job.max_hops:
                continue

            # Budget check
            if api_calls_used >= total_api_budget:
                await _emit(job, "warning", {"message": "API budget exhausted"})
                break

            # Check if address should be pruned (known exchange, etc.)
            addr_label = await _get_label_full(address, session)
            if addr_label and hop > 0:
                if addr_label["entity_type"] in ("exchange", "mixer"):
                    pruned.append({"address": address, "reason": addr_label["entity_type"], "hop": hop})
                    await _emit(job, "pruned", {"address": address, "reason": addr_label["entity_type"], "hop": hop})
                    continue

            # Fetch transactions
            try:
                txs, _ = await provider.fetch_transactions(address, page=1, per_page=job.max_txs_per_node)
                api_calls_used += 1
            except Exception as exc:
                await _emit(job, "warning", {"message": f"Fetch failed for {address[:10]}...: {exc}"})
                continue

            # Peeling chain detection (BTC only, root node only)
            if job.chain == "btc" and hop == 0:
                from app.services.peeling import detect_peeling_chain
                try:
                    peel_result = await detect_peeling_chain(address, txs, session)
                    if peel_result.detected:
                        await _emit(job, "peeling_chain_detected", peel_result.to_dict())
                except Exception as exc:
                    logger.debug("Peeling detection failed for %s: %s", address[:12], exc)

            # Apply dust floor
            dust_floor = config.dust_floor.get(job.chain, Decimal("0"))

            # Process transactions, discover new nodes/edges
            edge_batch: list[dict] = []

            for tx in txs:
                if tx.status == "failed" or tx.spam_score != "clean":
                    continue

                value = Decimal(tx.value)
                if value < min_value or value < dust_floor:
                    continue

                # Determine counterparty based on direction
                counterparty: str | None = None
                if job.direction == "forward":
                    if tx.from_address and _norm(tx.from_address) == address:
                        counterparty = _norm(tx.to_address or "")
                    elif job.chain == "btc" and tx.outputs:
                        for out in tx.outputs:
                            out_addr = _norm(out.get("address", ""))
                            if out_addr and out_addr != address:
                                counterparty = out_addr
                                break
                else:  # backward
                    if tx.to_address and _norm(tx.to_address) == address:
                        counterparty = _norm(tx.from_address or "")
                    elif job.chain == "btc" and tx.inputs:
                        for inp in tx.inputs:
                            inp_addr = _norm(inp.get("address", ""))
                            if inp_addr and inp_addr != address:
                                counterparty = inp_addr
                                break

                if not counterparty or counterparty == address:
                    continue

                # Add edge
                edge = {
                    "from": address,
                    "to": counterparty,
                    "value": str(value),
                    "tx_hash": tx.tx_hash,
                    "token": tx.token,
                    "timestamp": tx.timestamp,
                }
                edges.append(edge)
                edge_batch.append(edge)

                # Batch emit edges (max 10 per event)
                if len(edge_batch) >= 10:
                    await _emit(job, "edge_discovered", edge_batch)
                    edge_batch = []

                # Discover new node
                if counterparty not in visited:
                    visited.add(counterparty)
                    cp_label_info = await _get_label_full(counterparty, session)
                    cp_label_text = cp_label_info["entity_name"] if cp_label_info else None
                    cp_risk: str | None = None

                    # Check if counterparty itself is flagged
                    if cp_label_info and cp_label_info["entity_type"] in ("sanctioned", "mixer", "darknet"):
                        flag_type = cp_label_info["entity_type"]
                        flag_name = cp_label_info["entity_name"]
                        flagged_context[counterparty] = (flag_type, flag_name, counterparty)
                        cp_label_text = f"{flag_name} ({flag_type})"
                        cp_risk = _risk_from_type(flag_type)
                    elif cp_label_info:
                        cp_label_text = f"{cp_label_info['entity_name']} ({cp_label_info['entity_type']})"
                        cp_risk = _risk_from_type(cp_label_info["entity_type"])

                    # Propagate flagged ancestor context and persist label
                    if counterparty not in flagged_context and address in flagged_context:
                        flag_type, flag_name, flag_addr = flagged_context[address]
                        flagged_context[counterparty] = (flag_type, flag_name, flag_addr)
                        hops_away = hop + 1
                        relationship = "direct" if hops_away == 1 else f"{hops_away}-hop indirect"
                        truncated_flag = f"{flag_addr[:6]}...{flag_addr[-4:]}" if len(flag_addr) > 12 else flag_addr
                        context_label = f"{flag_name} indirect link ({relationship}, via {truncated_flag})" if hops_away > 1 else f"direct link to {flag_name} ({flag_type})"
                        cp_label_text = f"{cp_label_text} | {context_label}" if cp_label_text else context_label
                        if not cp_risk:
                            cp_risk = "HIGH" if hops_away <= 5 else "MEDIUM" if hops_away <= 15 else "LOW"

                        # Persist to DB so future lookups benefit
                        if not (cp_label_info and cp_label_info["entity_type"] in _SKIP_ENTITY_TYPES):
                            await _persist_runtime_label(
                                counterparty, job.chain,
                                flag_name, flag_type, flag_addr,
                                hops_away, session,
                            )

                    new_node = {
                        "address": counterparty,
                        "label": cp_label_text,
                        "risk": cp_risk,
                        "hop": hop + 1,
                    }
                    nodes.append(new_node)
                    await _emit(job, "node_discovered", new_node)

                    if hop + 1 < job.max_hops:
                        queue.append((counterparty, hop + 1))

                    # Check limits
                    if len(nodes) >= config.trace_max_nodes:
                        await _emit(job, "warning", {"message": f"Max nodes ({config.trace_max_nodes}) reached"})
                        queue.clear()
                        break

            # Emit remaining edge batch
            if edge_batch:
                await _emit(job, "edge_discovered", edge_batch)

            # Progress update
            await _emit(job, "progress", {
                "hop": hop + 1,
                "max_hops": job.max_hops,
                "nodes_found": len(nodes),
                "edges_found": len(edges),
                "api_calls_used": api_calls_used,
                "api_calls_limit": total_api_budget,
            })

    except asyncio.CancelledError:
        job.status = JobStatus.CANCELLED
        await _emit(job, "failed", {"error": "Trace cancelled", "partial": True})
        return
    except Exception as exc:
        logger.error("Trace failed: %s", exc)
        job.status = JobStatus.FAILED
        job.error = str(exc)
        await _emit(job, "failed", {"error": str(exc), "partial": len(nodes) > 1})
        return
    finally:
        await provider.close()

    elapsed = int((time.time() - start_time) * 1000)
    job.total_nodes = len(nodes)
    job.total_edges = len(edges)
    job.trace_time_ms = elapsed

    if job.status == JobStatus.CANCELLED:
        return

    job.status = JobStatus.COMPLETED

    await _emit(job, "completed", {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "trace_time_ms": elapsed,
        "pruned_at": pruned,
        "sampling": [],
    })


async def _emit(job: TraceJob, event_type: str, data: dict | list) -> None:
    """Push an SSE event to the job's event queue."""
    try:
        job.events.put_nowait({
            "event": event_type,
            "data": json.dumps(data),
        })
    except asyncio.QueueFull:
        logger.warning("Event queue full for job %s, dropping event", job.job_id)


async def _get_label_full(address: str, session: AsyncSession) -> dict | None:
    """Lookup label by address, case-insensitive (needed for BTC)."""
    result = await session.execute(
        select(Label).where(func.lower(Label.address) == address.lower())
    )
    label = result.scalar_one_or_none()
    if not label:
        return None
    return {
        "entity_name": label.entity_name,
        "entity_type": label.entity_type,
        "source": label.source,
    }


def _risk_from_type(entity_type: str) -> str | None:
    """Map entity type to risk level."""
    return {
        "sanctioned": "SEVERE",
        "mixer": "HIGH",
        "darknet": "HIGH",
        "gambling": "MEDIUM",
        "exchange": "LOW",
        "defi": "LOW",
        "flagged_counterparty": "HIGH",
    }.get(entity_type)


# Authoritative sources that runtime labels must never overwrite
_AUTHORITATIVE_SOURCES = {"ofac_sdn", "etherscan_known", "walletexplorer"}

# Entity types that are legitimate services — never flag their counterparties
_SKIP_ENTITY_TYPES = {"exchange", "defi", "historical"}


async def _persist_runtime_label(
    address: str,
    chain: str,
    flag_name: str,
    flag_type: str,
    flag_addr: str,
    hops: int,
    session: AsyncSession,
) -> None:
    """
    Write a runtime-discovered label to the DB.
    Skips if the address already has an authoritative label or is a known entity.
    """
    existing = await _get_label_full(address, session)
    if existing:
        # Never overwrite authoritative sources
        if existing["source"] in _AUTHORITATIVE_SOURCES:
            return
        # Don't flag known legitimate entities
        if existing["entity_type"] in _SKIP_ENTITY_TYPES:
            return
        # Already flagged from a previous trace — update only if this is closer
        if existing["source"] == "runtime_trace":
            return

    relationship = "direct" if hops == 1 else f"{hops}-hop indirect"
    confidence = "high" if hops <= 5 else "medium" if hops <= 15 else "low"
    now = datetime.now(timezone.utc).isoformat()

    label = Label(
        address=address.lower(),
        chain=chain,
        entity_name=f"{flag_name} indirect link ({relationship}, via {flag_addr[:6]}...{flag_addr[-4:]})" if hops > 1 else f"direct link to {flag_name}",
        entity_type="flagged_counterparty",
        source="runtime_trace",
        confidence=confidence,
        updated_at=now,
    )

    try:
        await session.merge(label)
        await session.commit()
    except Exception as exc:
        logger.debug("Runtime label write failed for %s: %s", address[:12], exc)
        await session.rollback()
