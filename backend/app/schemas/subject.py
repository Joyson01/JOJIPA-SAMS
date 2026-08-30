from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubjectCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32, description="Unique subject code, e.g. CS401")
    name: str = Field(..., min_length=2, max_length=128, description="Subject name, e.g. Computer Networks")
    short_name: Optional[str] = Field(None, max_length=32, description="Abbreviation, e.g. CN")
    department: str = Field(..., min_length=2, max_length=64, description="Department, e.g. Computer Science")
    credits: int = Field(4, ge=1, le=10)
    semester: int = Field(1, ge=1, le=12)
    academic_year: str = Field("2026-2027", max_length=32)
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    department: Optional[str] = None
    credits: Optional[int] = None
    semester: Optional[int] = None
    academic_year: Optional[str] = None
    status: Optional[str] = None


class SubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    short_name: Optional[str] = None
    department: str
    credits: int
    semester: int
    academic_year: str
    status: str
    total_sessions_count: int = 0
    created_at: datetime
    updated_at: datetime

