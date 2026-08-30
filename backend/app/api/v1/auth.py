from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import get_current_user
from backend.app.database.session import get_db
from backend.app.models.entities import User
from backend.app.schemas.auth import TokenResponse, UserLoginRequest, UserRegisterRequest, UserResponse
from backend.app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User",
    description="Registers a new user account with hashed password and role assignment.",
)
async def register(
    register_in: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    return await AuthService.register_user(db, register_in)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login",
    description="Authenticates username/password and issues a signed JWT Bearer token.",
)
async def login(
    login_in: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await AuthService.authenticate_user(db, login_in.username_or_email, login_in.password)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User Profile",
    description="Returns the profile and role claims of the currently authenticated user.",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)

