from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field("FACULTY", description="ADMIN, FACULTY, OPERATOR, STUDENT")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid = {"ADMIN", "FACULTY", "OPERATOR", "STUDENT"}
        if v.upper() not in valid:
            raise ValueError(f"Invalid role '{v}'. Allowed: {sorted(valid)}")
        return v.upper()


class UserLoginRequest(BaseModel):
    username_or_email: str = Field(...)
    password: str = Field(...)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserResponse

