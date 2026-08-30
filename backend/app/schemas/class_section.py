from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClassSectionCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=64, description="Class name, e.g. CSE-4A")
    department: str = Field(..., min_length=2, max_length=64, description="Department, e.g. Computer Science")
    year: int = Field(4, ge=1, le=6)
    semester: int = Field(4, ge=1, le=12)
    section: str = Field("A", max_length=16)
    academic_year: str = Field("2026-2027", max_length=32)
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip().upper()


class ClassSectionUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    year: Optional[int] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    academic_year: Optional[str] = None
    status: Optional[str] = None


class ClassSectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    department: str
    year: int
    semester: int
    section: str
    academic_year: str
    status: str
    student_count: int = 0
    created_at: datetime
    updated_at: datetime

