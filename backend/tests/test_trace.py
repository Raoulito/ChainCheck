"""Tests for the trace engine (Step 5G)."""
import asyncio
import json
from decimal import Decimal
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from app.jobs.trace_jobs import (
    TraceJob, JobStatus, create_job, get_job, cancel_job, _jobs,
    MAX_CONCURRENT_JOBS,
)
from app.models.schemas import NormalizedTx
from app.services.tracer import run_trace


def _make_tx(
    tx_hash: str = "abc123",
    from_addr: str = "0xsender",
    to_addr: str = "0xreceiver",
    value: str = "1000000000000000000",
    token: str = "ETH",
    chain: str = "eth",
    status: str = "success",
    spam_score: str = "clean",
) -> NormalizedTx:
    return NormalizedTx(
        tx_hash=tx_hash,
        chain=chain,
        from_address=from_addr,
        to_address=to_addr,
        value=value,
        value_human="1.0",
        value_usd_at_time=None,
        decimals=18,
        token=token,
        timestamp=1700000000,
        block=1000,
        confirmations=100,
        finalized=True,
        tx_type="native",
        status=status,
        spam_score=spam_score,
        method_name=None,
        inputs=None,
        outputs=None,
        fee="21000",
        change_output=None,
    )


@pytest.fixture(autouse=True)
def clear_jobs():
    """Clear job store between tests."""
    _jobs.clear()
    yield
    _jobs.clear()


# --- 5G-1: POST returns job_id instantly ---

def test_create_job_returns_job_id():
    job = create_job(address="0xabc", chain="eth")
    assert job.job_id
    assert len(job.job_id) == 8
    assert job.status == JobStatus.QUEUED
    assert job.address == "0xabc"


def test_create_job_is_retrievable():
    job = create_job(address="0xabc", chain="eth")
    retrieved = get_job(job.job_id)
    assert retrieved is job


# --- 5G-3: completed event contains valid metadata ---

@pytest.mark.asyncio
async def test_completed_event_contains_metadata(db_session):
    """Trace completes and emits a completed event with metadata (no nodes/edges in payload)."""
    job = create_job(address="0xroot", chain="eth", max_hops=1)

    tx = _make_tx(from_addr="0xroot", to_addr="0xcounterparty")

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=([tx], 1))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    assert job.status == JobStatus.COMPLETED

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    completed_events = [e for e in events if e["event"] == "completed"]
    assert len(completed_events) == 1

    data = json.loads(completed_events[0]["data"])
    assert "total_nodes" in data
    assert "total_edges" in data
    assert "trace_time_ms" in data
    assert "pruned_at" in data
    # No full node/edge arrays in completed event — only metadata
    assert "nodes" not in data
    assert "edges" not in data


# --- 5G-2: SSE delivers events in order ---

@pytest.mark.asyncio
async def test_events_in_order(db_session):
    """Events should flow: node_discovered -> edge_discovered -> progress -> completed."""
    job = create_job(address="0xroot", chain="eth", max_hops=1)

    tx = _make_tx(from_addr="0xroot", to_addr="0xcounterparty")

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=([tx], 1))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    event_types = [e["event"] for e in events]

    # Root node must come first
    assert event_types[0] == "node_discovered"
    # completed must come last
    assert event_types[-1] == "completed"
    # There must be at least one progress event
    assert "progress" in event_types


# --- 5G-4: cancel returns partial results ---

@pytest.mark.asyncio
async def test_cancel_returns_partial(db_session):
    """Cancelling a job mid-trace should stop the BFS early."""
    job = create_job(address="0xroot", chain="eth", max_hops=5)

    call_count = 0

    async def slow_fetch(address, page=1, per_page=50):
        nonlocal call_count
        call_count += 1
        # Cancel before second hop's fetch
        if call_count == 1:
            cancel_job(job.job_id)
        return (
            [_make_tx(from_addr=address, to_addr=f"0xhop{call_count}")],
            1,
        )

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(side_effect=slow_fetch)
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    assert job.status == JobStatus.CANCELLED
    # Should not have explored many hops since we cancelled early
    assert call_count <= 2


def test_cancel_job_sets_status():
    job = create_job(address="0xabc", chain="eth")
    result = cancel_job(job.job_id)
    assert result is not None
    assert result.status == JobStatus.CANCELLED


# --- 5G-5: max_txs_per_node caps correctly ---

@pytest.mark.asyncio
async def test_max_txs_per_node(db_session):
    """max_txs_per_node should be passed through to fetch_transactions."""
    job = create_job(address="0xroot", chain="eth", max_hops=1, max_txs_per_node=25)

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=([], 0))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    # Verify per_page arg was 25
    mock_provider.fetch_transactions.assert_called_once_with("0xroot", page=1, per_page=25)


# --- 5G-6: API budget distributed across hops ---

@pytest.mark.asyncio
async def test_api_budget_exhaustion(db_session):
    """When API budget is exhausted, trace should stop and emit a warning."""
    job = create_job(address="0xroot", chain="eth", max_hops=3)

    counter = {"calls": 0}

    async def counting_fetch(address, page=1, per_page=50):
        counter["calls"] += 1
        return (
            [_make_tx(from_addr=address, to_addr=f"0xnode{counter['calls']}")],
            1,
        )

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(side_effect=counting_fetch)
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}), \
         patch("app.services.tracer.config") as mock_config:
        mock_config.trace_max_api_calls = 3
        mock_config.trace_max_nodes = 500
        mock_config.dust_floor = {"eth": Decimal("0")}
        await run_trace(job, db_session)

    # Should have stopped at or near the budget
    assert counter["calls"] <= 4  # budget of 3 + 1 tolerance


# --- 5G-7: pruning works ---

@pytest.mark.asyncio
async def test_pruning_exchange(db_session):
    """Nodes labelled as 'exchange' at hop > 0 should be pruned."""
    job = create_job(address="0xroot", chain="eth", max_hops=2)

    tx1 = _make_tx(from_addr="0xroot", to_addr="0xexchange")
    tx2 = _make_tx(from_addr="0xexchange", to_addr="0xfurther")

    call_count = 0

    async def fetch_with_exchange(address, page=1, per_page=50):
        nonlocal call_count
        call_count += 1
        if address == "0xroot":
            return ([tx1], 1)
        return ([tx2], 1)

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(side_effect=fetch_with_exchange)
    mock_provider.close = AsyncMock()

    async def mock_get_label_full(address, session):
        if address == "0xexchange":
            return {"entity_name": "Binance", "entity_type": "exchange", "source": "etherscan_known"}
        return None

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}), \
         patch("app.services.tracer._get_label_full", side_effect=mock_get_label_full):
        await run_trace(job, db_session)

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    pruned_events = [e for e in events if e["event"] == "pruned"]
    assert len(pruned_events) == 1
    pruned_data = json.loads(pruned_events[0]["data"])
    assert pruned_data["address"] == "0xexchange"
    assert pruned_data["reason"] == "exchange"


# --- 5G-8: concurrent traces share global limit ---

def test_max_concurrent_jobs():
    """Creating more than MAX_CONCURRENT_JOBS should raise."""
    for i in range(MAX_CONCURRENT_JOBS):
        create_job(address=f"0x{i}", chain="eth")

    with pytest.raises(RuntimeError, match="concurrent"):
        create_job(address="0xone_too_many", chain="eth")


# --- 5G-9: heartbeat prevents timeout ---
# (heartbeat is in the SSE router layer, not in the trace engine itself.
# Tested indirectly via the event_generator loop in trace.py router.)


# --- 5G-10: dust floor applied within BFS ---

@pytest.mark.asyncio
async def test_dust_floor_filters_in_bfs(db_session):
    """Transactions below dust floor should not generate edges in the trace."""
    job = create_job(address="0xroot", chain="eth", max_hops=1)

    # One above dust, one below
    tx_big = _make_tx(from_addr="0xroot", to_addr="0xbig", value="1000000000000000000")  # 1 ETH
    tx_dust = _make_tx(from_addr="0xroot", to_addr="0xdust", value="1000")  # below default dust

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=([tx_big, tx_dust], 2))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    node_events = [e for e in events if e["event"] == "node_discovered"]
    node_addrs = [json.loads(e["data"])["address"] for e in node_events]

    assert "0xbig" in node_addrs
    assert "0xdust" not in node_addrs


# --- 5G-12: completed event has ONLY metadata ---

@pytest.mark.asyncio
async def test_completed_event_no_full_graph(db_session):
    """The completed SSE event must not contain full node/edge arrays."""
    job = create_job(address="0xroot", chain="eth", max_hops=1)

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=([], 0))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    completed = [e for e in events if e["event"] == "completed"]
    assert len(completed) == 1
    data = json.loads(completed[0]["data"])
    # Should have metadata keys only
    assert set(data.keys()) == {"total_nodes", "total_edges", "trace_time_ms", "pruned_at", "sampling"}


# --- 5G-16: edge batching sends max 10 edges per SSE event ---

@pytest.mark.asyncio
async def test_edge_batching_max_10(db_session):
    """Edge events should contain at most 10 edges each."""
    job = create_job(address="0xroot", chain="eth", max_hops=1)

    # Create 25 transactions to generate 25 edges
    txs = [
        _make_tx(tx_hash=f"tx{i}", from_addr="0xroot", to_addr=f"0xdest{i}")
        for i in range(25)
    ]

    mock_provider = AsyncMock()
    mock_provider.fetch_transactions = AsyncMock(return_value=(txs, 25))
    mock_provider.close = AsyncMock()

    with patch("app.services.tracer.PROVIDERS", {"eth": lambda: mock_provider}):
        await run_trace(job, db_session)

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    edge_events = [e for e in events if e["event"] == "edge_discovered"]
    for ev in edge_events:
        batch = json.loads(ev["data"])
        assert len(batch) <= 10, f"Edge batch has {len(batch)} items, expected <= 10"


# --- 5G: failed provider returns failed status ---

@pytest.mark.asyncio
async def test_unknown_chain_fails(db_session):
    """Requesting an unsupported chain should emit a failed event."""
    job = create_job(address="0xroot", chain="solana", max_hops=1)

    await run_trace(job, db_session)

    assert job.status == JobStatus.FAILED

    events = []
    while not job.events.empty():
        events.append(job.events.get_nowait())

    failed = [e for e in events if e["event"] == "failed"]
    assert len(failed) == 1
    assert "No provider" in json.loads(failed[0]["data"])["error"]


# --- Job expiry ---

def test_job_expiry():
    """Completed jobs older than 30 min should be cleaned up."""
    import time
    job = create_job(address="0xold", chain="eth")
    job.status = JobStatus.COMPLETED
    job.created_at = time.time() - 3600  # 1 hour ago

    # Creating a new job triggers cleanup
    new_job = create_job(address="0xnew", chain="eth")
    assert get_job(job.job_id) is None
    assert get_job(new_job.job_id) is not None
