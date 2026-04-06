import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.label import Label
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
