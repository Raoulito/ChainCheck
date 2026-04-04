import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.errors import ValidationError
from app.models.investigation import (
    Investigation,
    InvestigationSnapshot,
    Note,
    Tag,
    AuditLog,
)
from app.models.user import User

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _audit(
    session: AsyncSession,
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    detail: str | None = None,
):
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        timestamp=_now(),
    )
    session.add(log)


# --- Investigation CRUD ---

class CreateInvestigationRequest(BaseModel):
    title: str
    description: str | None = None
    root_address: str
    root_chain: str


class UpdateInvestigationRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    graph_data: str | None = None
    status: str | None = None


class InvestigationResponse(BaseModel):
    id: str
    title: str
    description: str | None
    root_address: str
    root_chain: str
    status: str
    created_at: str
    updated_at: str
    version: int


@router.post("/investigations")
async def create_investigation(
    body: CreateInvestigationRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> InvestigationResponse:
    now = _now()
    inv = Investigation(
        id=str(uuid.uuid4()),
        user_id=user.id,
        title=body.title,
        description=body.description,
        root_address=body.root_address,
        root_chain=body.root_chain,
        status="active",
        created_at=now,
        updated_at=now,
        version=1,
    )
    session.add(inv)
    await _audit(session, user.id, "create", "investigation", inv.id, body.title)
    await session.commit()

    return InvestigationResponse(
        id=inv.id, title=inv.title, description=inv.description,
        root_address=inv.root_address, root_chain=inv.root_chain,
        status=inv.status, created_at=inv.created_at,
        updated_at=inv.updated_at, version=inv.version,
    )


@router.get("/investigations")
async def list_investigations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[InvestigationResponse]:
    result = await session.execute(
        select(Investigation)
        .where(Investigation.user_id == user.id, Investigation.status != "deleted")
        .order_by(Investigation.updated_at.desc())
    )
    investigations = result.scalars().all()
    return [
        InvestigationResponse(
            id=inv.id, title=inv.title, description=inv.description,
            root_address=inv.root_address, root_chain=inv.root_chain,
            status=inv.status, created_at=inv.created_at,
            updated_at=inv.updated_at, version=inv.version,
        )
        for inv in investigations
    ]


@router.get("/investigations/{investigation_id}")
async def get_investigation(
    investigation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    inv = await _get_user_investigation(investigation_id, user.id, session)
    return {
        "id": inv.id,
        "title": inv.title,
        "description": inv.description,
        "root_address": inv.root_address,
        "root_chain": inv.root_chain,
        "graph_data": inv.graph_data,
        "status": inv.status,
        "created_at": inv.created_at,
        "updated_at": inv.updated_at,
        "version": inv.version,
    }


@router.put("/investigations/{investigation_id}")
async def update_investigation(
    investigation_id: str,
    body: UpdateInvestigationRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> InvestigationResponse:
    inv = await _get_user_investigation(investigation_id, user.id, session)

    if body.title is not None:
        inv.title = body.title
    if body.description is not None:
        inv.description = body.description
    if body.graph_data is not None:
        # Save snapshot before overwriting
        snapshot = InvestigationSnapshot(
            id=str(uuid.uuid4()),
            investigation_id=inv.id,
            version=inv.version,
            graph_data=inv.graph_data,
            created_at=_now(),
        )
        session.add(snapshot)
        inv.graph_data = body.graph_data
        inv.version += 1
    if body.status is not None:
        inv.status = body.status

    inv.updated_at = _now()
    await _audit(session, user.id, "update", "investigation", inv.id)
    await session.commit()

    return InvestigationResponse(
        id=inv.id, title=inv.title, description=inv.description,
        root_address=inv.root_address, root_chain=inv.root_chain,
        status=inv.status, created_at=inv.created_at,
        updated_at=inv.updated_at, version=inv.version,
    )


@router.delete("/investigations/{investigation_id}")
async def delete_investigation(
    investigation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    inv = await _get_user_investigation(investigation_id, user.id, session)
    inv.status = "deleted"
    inv.updated_at = _now()
    await _audit(session, user.id, "delete", "investigation", inv.id)
    await session.commit()
    return {"status": "deleted"}


# --- Notes ---

class CreateNoteRequest(BaseModel):
    target_type: str  # address, tx, general
    target_id: str | None = None
    content: str


class NoteResponse(BaseModel):
    id: str
    target_type: str
    target_id: str | None
    content: str
    created_at: str
    updated_at: str


@router.post("/investigations/{investigation_id}/notes")
async def create_note(
    investigation_id: str,
    body: CreateNoteRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NoteResponse:
    await _get_user_investigation(investigation_id, user.id, session)
    now = _now()
    note = Note(
        id=str(uuid.uuid4()),
        investigation_id=investigation_id,
        user_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        content=body.content,
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    await _audit(session, user.id, "create", "note", note.id)
    await session.commit()

    return NoteResponse(
        id=note.id, target_type=note.target_type, target_id=note.target_id,
        content=note.content, created_at=note.created_at, updated_at=note.updated_at,
    )


@router.get("/investigations/{investigation_id}/notes")
async def list_notes(
    investigation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[NoteResponse]:
    await _get_user_investigation(investigation_id, user.id, session)
    result = await session.execute(
        select(Note)
        .where(Note.investigation_id == investigation_id)
        .order_by(Note.created_at.desc())
    )
    return [
        NoteResponse(
            id=n.id, target_type=n.target_type, target_id=n.target_id,
            content=n.content, created_at=n.created_at, updated_at=n.updated_at,
        )
        for n in result.scalars().all()
    ]


# --- Tags ---

class CreateTagRequest(BaseModel):
    name: str
    target_type: str
    target_id: str


@router.post("/investigations/{investigation_id}/tags")
async def create_tag(
    investigation_id: str,
    body: CreateTagRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _get_user_investigation(investigation_id, user.id, session)
    tag = Tag(
        id=str(uuid.uuid4()),
        investigation_id=investigation_id,
        name=body.name,
        target_type=body.target_type,
        target_id=body.target_id,
    )
    session.add(tag)
    await _audit(session, user.id, "create", "tag", tag.id, body.name)
    await session.commit()
    return {"id": tag.id, "name": tag.name}


@router.get("/investigations/{investigation_id}/tags")
async def list_tags(
    investigation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await _get_user_investigation(investigation_id, user.id, session)
    result = await session.execute(
        select(Tag).where(Tag.investigation_id == investigation_id)
    )
    return [
        {"id": t.id, "name": t.name, "target_type": t.target_type, "target_id": t.target_id}
        for t in result.scalars().all()
    ]


# --- Audit Log ---

@router.get("/investigations/{investigation_id}/audit")
async def get_audit_log(
    investigation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await _get_user_investigation(investigation_id, user.id, session)
    result = await session.execute(
        select(AuditLog)
        .where(AuditLog.resource_id == investigation_id)
        .order_by(AuditLog.timestamp.desc())
    )
    return [
        {
            "id": a.id,
            "action": a.action,
            "resource_type": a.resource_type,
            "detail": a.detail,
            "timestamp": a.timestamp,
        }
        for a in result.scalars().all()
    ]


# --- Helpers ---

async def _get_user_investigation(
    investigation_id: str, user_id: str, session: AsyncSession
) -> Investigation:
    result = await session.execute(
        select(Investigation).where(
            Investigation.id == investigation_id,
            Investigation.user_id == user_id,
            Investigation.status != "deleted",
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise ValidationError("Investigation not found")
    return inv
