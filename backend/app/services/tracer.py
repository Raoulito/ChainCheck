import asyncio
import json
import logging
import time
from decimal import Decimal

from sqlalchemy import select
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

    # BFS queue: (address, hop_level)
    queue: list[tuple[str, int]] = [(job.address.lower(), 0)]
    visited.add(job.address.lower())

    # Add root node
    root_label = await _get_label(job.address.lower(), session)
    root_node = {
        "address": job.address.lower(),
        "label": root_label,
        "risk": None,
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
            hop_budget = int(total_api_budget * HOP_BUDGET.get(hop + 1, 0.25))
            if api_calls_used >= total_api_budget:
                await _emit(job, "warning", {"message": "API budget exhausted"})
                break

            # Check if address should be pruned (known exchange, etc.)
            label_name = await _get_label(address, session)
            if label_name and hop > 0:
                entity_type = await _get_entity_type(address, session)
                if entity_type in ("exchange", "mixer"):
                    pruned.append({"address": address, "reason": entity_type, "hop": hop})
                    await _emit(job, "pruned", {"address": address, "reason": entity_type, "hop": hop})
                    continue

            # Fetch transactions
            try:
                txs, _ = await provider.fetch_transactions(address, page=1, per_page=job.max_txs_per_node)
                api_calls_used += 1
            except Exception as exc:
                await _emit(job, "warning", {"message": f"Fetch failed for {address[:10]}...: {exc}"})
                continue

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
                    if tx.from_address and tx.from_address.lower() == address:
                        counterparty = (tx.to_address or "").lower()
                    elif job.chain == "btc" and tx.outputs:
                        for out in tx.outputs:
                            out_addr = out.get("address", "").lower()
                            if out_addr and out_addr != address:
                                counterparty = out_addr
                                break
                else:  # backward
                    if tx.to_address and tx.to_address.lower() == address:
                        counterparty = (tx.from_address or "").lower()
                    elif job.chain == "btc" and tx.inputs:
                        for inp in tx.inputs:
                            inp_addr = inp.get("address", "").lower()
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
                    cp_label = await _get_label(counterparty, session)
                    new_node = {
                        "address": counterparty,
                        "label": cp_label,
                        "risk": None,
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


async def _get_label(address: str, session: AsyncSession) -> str | None:
    result = await session.execute(
        select(Label.entity_name).where(Label.address == address)
    )
    row = result.scalar_one_or_none()
    return row


async def _get_entity_type(address: str, session: AsyncSession) -> str | None:
    result = await session.execute(
        select(Label.entity_type).where(Label.address == address)
    )
    return result.scalar_one_or_none()
