import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.db import get_session
from app.errors import ValidationError
from app.models.user import User
from app.rate_limiter import limiter

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    display_name: str


class UserResponse(BaseModel):
    user_id: str
    email: str
    display_name: str


@router.post("/auth/register")
@limiter.limit("5/minute")
async def register(
    request: Request,
    body: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    # Check duplicate
    result = await session.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise ValidationError("Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        is_active=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(user)
    await session.commit()

    token = create_access_token(user.id)
    return AuthResponse(token=token, user_id=user.id, email=user.email, display_name=user.display_name)


@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> AuthResponse:
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise ValidationError("Invalid email or password")

    if not user.is_active:
        raise ValidationError("Account is inactive")

    token = create_access_token(user.id)
    return AuthResponse(token=token, user_id=user.id, email=user.email, display_name=user.display_name)


@router.get("/auth/me")
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(user_id=user.id, email=user.email, display_name=user.display_name)
