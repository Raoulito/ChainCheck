import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TraceJob:
    job_id: str
    address: str
    chain: str
    direction: str
    max_hops: int
    min_value: str
    max_txs_per_node: int
    status: JobStatus = JobStatus.QUEUED
    created_at: float = field(default_factory=time.time)
    task: asyncio.Task | None = field(default=None, repr=False)
    events: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=1000), repr=False)
    total_nodes: int = 0
    total_edges: int = 0
    trace_time_ms: int = 0
    error: str | None = None


# In-memory job store
_jobs: dict[str, TraceJob] = {}
MAX_CONCURRENT_JOBS = 3
JOB_EXPIRY_SECONDS = 30 * 60  # 30 minutes


def create_job(
    address: str,
    chain: str,
    direction: str = "forward",
    max_hops: int = 3,
    min_value: str = "0",
    max_txs_per_node: int = 50,
) -> TraceJob:
    """Create a new trace job. Raises if at max capacity."""
    _cleanup_expired()

    active = sum(1 for j in _jobs.values() if j.status in (JobStatus.QUEUED, JobStatus.RUNNING))
    if active >= MAX_CONCURRENT_JOBS:
        raise RuntimeError(f"Maximum {MAX_CONCURRENT_JOBS} concurrent trace jobs reached")

    job_id = str(uuid.uuid4())[:8]
    job = TraceJob(
        job_id=job_id,
        address=address,
        chain=chain,
        direction=direction,
        max_hops=max_hops,
        min_value=min_value,
        max_txs_per_node=max_txs_per_node,
    )
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> TraceJob | None:
    return _jobs.get(job_id)


def cancel_job(job_id: str) -> TraceJob | None:
    job = _jobs.get(job_id)
    if not job:
        return None
    if job.task and not job.task.done():
        job.task.cancel()
    job.status = JobStatus.CANCELLED
    return job


def _cleanup_expired():
    now = time.time()
    expired = [
        jid for jid, j in _jobs.items()
        if j.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)
        and now - j.created_at > JOB_EXPIRY_SECONDS
    ]
    for jid in expired:
        del _jobs[jid]
