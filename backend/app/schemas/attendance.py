from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SessionCreate(BaseModel):
    session_code: str = Field(..., min_length=2, max_length=64, description="Unique session code or batch identifier")
    class_name: str = Field(..., min_length=1, max_length=32, description="Target class/batch (e.g., CSE-4A)")
    subject: str = Field(..., min_length=1, max_length=64, description="Course or subject name")
    room: str = Field(..., min_length=1, max_length=32, description="Classroom or hall number")
    scheduled_date: Optional[date] = Field(default_factory=date.today)
    start_time: time
    end_time: time
    camera_ids: List[str] = Field(default_factory=list)

    @field_validator("session_code", "class_name", "subject", "room", mode="before")
    @classmethod
    def strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class SessionUpdate(BaseModel):
    subject: Optional[str] = None
    room: Optional[str] = None
    status: Optional[str] = None  # SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED
    camera_ids: Optional[List[str]] = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_code: str
    class_name: str
    subject: str
    room: str
    scheduled_date: date
    start_time: time
    end_time: time
    status: str
    camera_ids: List[str]
    total_records: int = 0
    present_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    created_at: datetime
    updated_at: datetime


class AttendanceMarkPayload(BaseModel):
    student_id: str = Field(..., description="UUID of the student")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Recognition confidence score")
    track_id: Optional[int] = None
    camera_id: Optional[str] = None
    liveness_score: float = Field(1.0, ge=0.0, le=1.0)
    verification_metadata: Dict[str, Any] = Field(default_factory=dict)
    remarks: Optional[str] = None


class BatchAttendanceMarkPayload(BaseModel):
    records: List[AttendanceMarkPayload]


class AttendanceRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    student_id: str
    student_name: str
    student_code: str
    roll_number: str
    status: str  # PRESENT, LATE, ABSENT, MANUAL_PRESENT, MANUAL_ABSENT
    confidence: float
    first_seen: datetime
    last_seen: datetime
    track_id: Optional[int]
    liveness_score: float
    remarks: Optional[str]
    created_at: datetime
    updated_at: datetime


class AttendanceOverridePayload(BaseModel):
    status: str = Field(..., description="New status: PRESENT, ABSENT, MANUAL_PRESENT, MANUAL_ABSENT")
    remarks: str = Field(..., min_length=3, description="Required explanation for manual override")
    modified_by_user_id: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = {"PRESENT", "ABSENT", "LATE", "MANUAL_PRESENT", "MANUAL_ABSENT"}
        if v.upper() not in valid:
            raise ValueError(f"Invalid attendance status '{v}'. Allowed: {sorted(valid)}")
        return v.upper()


class StudentAttendanceSummary(BaseModel):
    student_id: str
    total_sessions: int
    present_sessions: int
    late_sessions: int
    absent_sessions: int
    attendance_rate_pct: float
    records: List[AttendanceRecordResponse]

