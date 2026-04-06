import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.label import Label
from app.models.sync_log import SyncLog
from app.models.schemas import LabelInfo
from app.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_label_info(label: Label) -> LabelInfo:
    return LabelInfo(
        address=label.address,
        chain=label.chain,
        entity_name=label.entity_name,
        entity_type=label.entity_type,
        source=label.source,
        confidence=label.confidence,
    )


class CreateLabelRequest(BaseModel):
    address: str
    chain: str
    entity_name: str
    entity_type: str
    source: str = "manual"
    confidence: str = "medium"


class BatchLabelRequest(BaseModel):
    addresses: list[str]


class BatchCreateLabelRequest(BaseModel):
    addresses: list[str]
    chain: str
    entity_name: str
    entity_type: str
    source: str = "manual"
    confidence: str = "medium"


class BatchCreateLabelResponse(BaseModel):
    created: int
    updated: int
    total: int


class BatchLabelResponse(BaseModel):
    labels: dict[str, LabelInfo | None]


class LabelStatusResponse(BaseModel):
    total_labels: int
    by_source: dict[str, int]
    by_type: dict[str, int]
    by_chain: dict[str, int]


@router.get("/labels/{address}")
async def get_label(
    address: str,
    session: AsyncSession = Depends(get_session),
) -> LabelInfo | None:
    result = await session.execute(
        select(Label).where(Label.address == address.lower())
    )
    label = result.scalar_one_or_none()
    if not label:
        return None
    return _to_label_info(label)


@router.post("/labels/batch")
@limiter.limit("20/minute")
async def batch_labels(
    request: Request,
    body: BatchLabelRequest,
    session: AsyncSession = Depends(get_session),
) -> BatchLabelResponse:
    if len(body.addresses) > 200:
        from app.errors import ValidationError
        raise ValidationError("Maximum 200 addresses per batch request")

    addresses_lower = [a.lower() for a in body.addresses]
    result = await session.execute(
        select(Label).where(Label.address.in_(addresses_lower))
    )
    labels_map: dict[str, LabelInfo | None] = {a: None for a in addresses_lower}

    for label in result.scalars():
        labels_map[label.address] = _to_label_info(label)

    return BatchLabelResponse(labels=labels_map)


@router.get("/labels/search")
async def search_labels(
    entity: str,
    session: AsyncSession = Depends(get_session),
) -> list[LabelInfo]:
    result = await session.execute(
        select(Label).where(Label.entity_name.ilike(f"%{entity}%")).limit(50)
    )
    return [_to_label_info(l) for l in result.scalars()]


@router.post("/labels/batch/create")
@limiter.limit("5/minute")
async def batch_create_labels(
    request: Request,
    body: BatchCreateLabelRequest,
    session: AsyncSession = Depends(get_session),
) -> BatchCreateLabelResponse:
    if len(body.addresses) > 500:
        from app.errors import ValidationError
        raise ValidationError("Maximum 500 addresses per batch create")

    now = datetime.now(timezone.utc).isoformat()
    addresses_lower = [a.strip().lower() for a in body.addresses if a.strip()]

    # Fetch existing labels in one query
    existing_result = await session.execute(
        select(Label).where(Label.address.in_(addresses_lower))
    )
    existing_map = {l.address: l for l in existing_result.scalars()}

    created = 0
    updated = 0

    for addr in addresses_lower:
        if addr in existing_map:
            lbl = existing_map[addr]
            lbl.entity_name = body.entity_name
            lbl.entity_type = body.entity_type
            lbl.source = body.source
            lbl.confidence = body.confidence
            lbl.updated_at = now
            updated += 1
        else:
            session.add(Label(
                address=addr,
                chain=body.chain,
                entity_name=body.entity_name,
                entity_type=body.entity_type,
                source=body.source,
                confidence=body.confidence,
                updated_at=now,
            ))
            created += 1

    await session.commit()
    logger.info("Batch label create: %d created, %d updated for entity '%s'", created, updated, body.entity_name)

    return BatchCreateLabelResponse(created=created, updated=updated, total=created + updated)


@router.post("/labels")
async def create_label(
    body: CreateLabelRequest,
    session: AsyncSession = Depends(get_session),
) -> LabelInfo:
    now = datetime.now(timezone.utc).isoformat()

    existing = await session.execute(
        select(Label).where(Label.address == body.address.lower())
    )
    existing_label = existing.scalar_one_or_none()

    if existing_label:
        existing_label.entity_name = body.entity_name
        existing_label.entity_type = body.entity_type
        existing_label.source = body.source
        existing_label.confidence = body.confidence
        existing_label.updated_at = now
    else:
        label = Label(
            address=body.address.lower(),
            chain=body.chain,
            entity_name=body.entity_name,
            entity_type=body.entity_type,
            source=body.source,
            confidence=body.confidence,
            updated_at=now,
        )
        session.add(label)

    await session.commit()

    return _to_label_info(existing_label if existing_label else label)


@router.get("/labels/sync/status")
async def sync_status(
    session: AsyncSession = Depends(get_session),
):
    """Return last sync timestamp and counts per source."""
    result = await session.execute(select(SyncLog))
    logs = {log.source: {
        "last_synced_at": log.last_synced_at,
        "labels_added": log.labels_added,
        "total_labels": log.total_labels,
    } for log in result.scalars()}
    return {"sources": logs}


@router.get("/labels/sync/stream")
async def trigger_label_sync_stream(request: Request):
    """SSE endpoint — streams progress as each label source completes."""
    import json as _json
    from starlette.responses import StreamingResponse
    from app.config import config as app_config
    from app.db import async_session
    from app.services.label_importers import (
        import_etherscan_labels,
        import_ofac_sdn,
        import_opensanctions,
        import_walletexplorer_btc,
        import_chainabuse,
    )

    sources = [
        ("etherscan", lambda s: import_etherscan_labels(s)),
        ("ofac_sdn", lambda s: import_ofac_sdn(s)),
        ("opensanctions", lambda s: import_opensanctions(s)),
        ("walletexplorer", lambda s: import_walletexplorer_btc(s)),
        ("chainabuse", lambda s: import_chainabuse(s, app_config.chainabuse_api_key)),
    ]
    total_sources = len(sources)

    # Load previous sync logs so we can send them with source_start
    prev_logs: dict[str, dict] = {}
    try:
        async with async_session() as session:
            result = await session.execute(select(SyncLog))
            for log in result.scalars():
                prev_logs[log.source] = {
                    "last_synced_at": log.last_synced_at,
                    "total_labels": log.total_labels,
                }
    except Exception:
        pass

    async def event_generator():
        results: dict[str, int] = {}
        for idx, (name, importer_fn) in enumerate(sources):
            prev = prev_logs.get(name)
            yield f"data: {_json.dumps({'event': 'source_start', 'source': name, 'index': idx, 'total': total_sources, 'prev': prev})}\n\n"
            try:
                async with async_session() as session:
                    count = await importer_fn(session)
                results[name] = count
            except Exception as exc:
                results[name] = 0
                logger.error("Sync importer '%s' failed: %s", name, exc)
            yield f"data: {_json.dumps({'event': 'source_done', 'source': name, 'count': results[name], 'index': idx, 'total': total_sources})}\n\n"

        # Persist sync log per source
        now = datetime.now(timezone.utc).isoformat()
        try:
            async with async_session() as session:
                # Count labels per source in DB
                label_result = await session.execute(select(Label))
                source_counts: dict[str, int] = {}
                for lbl in label_result.scalars():
                    source_counts[lbl.source] = source_counts.get(lbl.source, 0) + 1

                for name, added in results.items():
                    log_entry = SyncLog(
                        source=name,
                        last_synced_at=now,
                        labels_added=added,
                        total_labels=source_counts.get(name, 0),
                    )
                    await session.merge(log_entry)
                await session.commit()
        except Exception as exc:
            logger.error("Failed to persist sync log: %s", exc)

        total_new = sum(results.values())
        yield f"data: {_json.dumps({'event': 'completed', 'results': results, 'total_new': total_new})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/labels/status")
async def label_status(
    session: AsyncSession = Depends(get_session),
) -> LabelStatusResponse:
    result = await session.execute(select(Label))
    labels = list(result.scalars())

    by_source: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_chain: dict[str, int] = {}

    for l in labels:
        by_source[l.source] = by_source.get(l.source, 0) + 1
        by_type[l.entity_type] = by_type.get(l.entity_type, 0) + 1
        by_chain[l.chain] = by_chain.get(l.chain, 0) + 1

    return LabelStatusResponse(
        total_labels=len(labels),
        by_source=by_source,
        by_type=by_type,
        by_chain=by_chain,
    )
