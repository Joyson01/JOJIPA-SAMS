from datetime import timedelta
from typing import Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, hash_password, verify_password
from backend.app.models.entities import User
from backend.app.schemas.auth import TokenResponse, UserRegisterRequest, UserResponse


class AuthService:
    """Service managing user registration, secure credential verification, and JWT issuance."""

    @classmethod
    async def register_user(cls, db: AsyncSession, register_in: UserRegisterRequest) -> UserResponse:
        """Registers a new system user with hashed credentials."""
        # Check uniqueness
        query = select(User).where(
            or_(
                User.username == register_in.username,
                User.email == register_in.email,
            )
        )
        existing = (await db.execute(query)).scalars().first()
        if existing:
            if existing.username == register_in.username:
                raise HTTPException(status_code=409, detail=f"Username '{register_in.username}' is already registered.")
            raise HTTPException(status_code=409, detail=f"Email '{register_in.email}' is already registered.")

        hashed = hash_password(register_in.password)
        user = User(
            username=register_in.username,
            email=register_in.email,
            password_hash=hashed,
            full_name=register_in.full_name,
            role=register_in.role.upper(),
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"Registered new user: {user.username} ({user.role})")
        return UserResponse.model_validate(user)

    @classmethod
    async def authenticate_user(
        cls,
        db: AsyncSession,
        username_or_email: str,
        password: str,
    ) -> TokenResponse:
        """Authenticates user and returns signed JWT access token."""
        query = select(User).where(
            or_(
                User.username == username_or_email,
                User.email == username_or_email,
            )
        )
        user = (await db.execute(query)).scalars().first()

        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username/email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This user account has been disabled.",
            )

        # Generate JWT
        expires_minutes = ACCESS_TOKEN_EXPIRE_MINUTES
        token = create_access_token(
            data={"sub": user.id, "username": user.username, "role": user.role},
            expires_delta=timedelta(minutes=expires_minutes),
        )

        logger.info(f"User login successful: {user.username} (Role: {user.role})")
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in_seconds=expires_minutes * 60,
            user=UserResponse.model_validate(user),
        )

