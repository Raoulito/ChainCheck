import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.jobs.trace_jobs import create_job, get_job, cancel_job, JobStatus
from app.rate_limiter import limiter
from app.services.tracer import run_trace

logger = logging.getLogger(__name__)

router = APIRouter()


class TraceRequest(BaseModel):
    address: str
    chain: str
    direction: str = "forward"
    max_hops: int = 3
    min_value: str = "0"
    max_txs_per_node: int = 50


class TraceResponse(BaseModel):
    job_id: str
    status: str
    stream_url: str


@router.post("/trace")
@limiter.limit("5/minute")
async def start_trace(
    request: Request,
    body: TraceRequest,
    session: AsyncSession = Depends(get_session),
) -> TraceResponse:
    try:
        job = create_job(
            address=body.address,
            chain=body.chain,
            direction=body.direction,
            max_hops=min(body.max_hops, 5),
            min_value=body.min_value,
            max_txs_per_node=min(body.max_txs_per_node, 100),
        )
    except RuntimeError as exc:
        from app.errors import ValidationError
        raise ValidationError(str(exc))

    # Launch BFS as background task
    job.task = asyncio.create_task(run_trace(job, session))

    return TraceResponse(
        job_id=job.job_id,
        status=job.status.value,
        stream_url=f"/api/trace/{job.job_id}/stream",
    )


@router.get("/trace/{job_id}/stream")
async def trace_stream(job_id: str, request: Request):
    job = get_job(job_id)
    if not job:
        from app.errors import ValidationError
        raise ValidationError(f"Job not found: {job_id}")

    async def event_generator():
        heartbeat_interval = 15
        last_heartbeat = asyncio.get_event_loop().time()

        while True:
            # Check client disconnect
            if await request.is_disconnected():
                cancel_job(job_id)
                break

            # Try to get an event from the queue
            try:
                event = job.events.get_nowait()
                yield {
                    "event": event["event"],
                    "data": event["data"],
                }

                # If completed or failed, stop streaming
                if event["event"] in ("completed", "failed"):
                    break

            except asyncio.QueueEmpty:
                # Send heartbeat if needed
                now = asyncio.get_event_loop().time()
                if now - last_heartbeat >= heartbeat_interval:
                    yield {"event": "heartbeat", "data": "{}"}
                    last_heartbeat = now

                # Check if job is done
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                    break

                await asyncio.sleep(0.1)

    return EventSourceResponse(event_generator())


@router.post("/trace/{job_id}/cancel")
async def cancel_trace(job_id: str) -> dict:
    job = cancel_job(job_id)
    if not job:
        from app.errors import ValidationError
        raise ValidationError(f"Job not found: {job_id}")

    return {
        "job_id": job.job_id,
        "status": job.status.value,
        "total_nodes": job.total_nodes,
        "total_edges": job.total_edges,
    }


@router.get("/trace/{job_id}")
async def trace_status(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        from app.errors import ValidationError
        raise ValidationError(f"Job not found: {job_id}")

    return {
        "job_id": job.job_id,
        "status": job.status.value,
        "total_nodes": job.total_nodes,
        "total_edges": job.total_edges,
        "trace_time_ms": job.trace_time_ms,
        "error": job.error,
    }
