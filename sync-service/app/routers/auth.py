"""Auth router — register, login, refresh, me."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Device, User

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_name: str = "Unknown Device"
    platform: str = "unknown"


class TokenResponse(BaseModel):
    token: str
    user_id: str
    email: str
    name: str
    role: str
    device_id: str | None = None


class UserInfo(BaseModel):
    user_id: str
    email: str
    name: str
    role: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        name=req.name or req.email.split("@")[0],
        password_hash=hash_password(req.password),
        role="user",
    )
    db.add(user)
    await db.commit()

    token = create_token(user.id, user.role)
    return TokenResponse(token=token, user_id=user.id, email=user.email, name=user.name, role=user.role)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Register device
    device = Device(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=req.device_name,
        platform=req.platform,
    )
    db.add(device)
    await db.commit()

    token = create_token(user.id, user.role)
    return TokenResponse(token=token, user_id=user.id, email=user.email, name=user.name, role=user.role, device_id=device.id)


@router.get("/me", response_model=UserInfo)
async def me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == current_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserInfo(user_id=user.id, email=user.email, name=user.name, role=user.role)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == current_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    token = create_token(user.id, user.role)
    return TokenResponse(token=token, user_id=user.id, email=user.email, name=user.name, role=user.role)
