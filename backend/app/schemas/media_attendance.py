from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class MediaAttendanceItem(BaseModel):
    student_id: Optional[str] = None
    student_name: str
    student_code: Optional[str] = None
    roll_number: Optional[str] = None
    confidence: float = 0.0
    confidence_pct: float = 0.0
    attendance_status: str = "PRESENT"
    decision: str = "KNOWN"  # KNOWN, UNKNOWN, UNCERTAIN
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None
    observation_count: int = 1
    remarks: Optional[str] = None


class UnresolvedFaceItem(BaseModel):
    face_id: str
    decision: str  # UNKNOWN, UNCERTAIN
    confidence: float = 0.0
    confidence_pct: float = 0.0
    timestamp_sec: Optional[float] = None
    frame_number: Optional[int] = None
    bbox: List[float] = Field(default_factory=list)
    quality_score: float = 1.0
    rejection_reason: Optional[str] = None


class MediaAnalysisResponse(BaseModel):
    job_id: Optional[str] = None
    session_id: str
    session_subject: str
    session_class: str
    media_type: str  # IMAGE, VIDEO
    filename: str
    duration_sec: Optional[float] = None
    resolution: Optional[str] = None
    faces_detected: int = 0
    recognized_count: int = 0
    unknown_count: int = 0
    uncertain_count: int = 0
    attendance_marked_count: int = 0
    recognized_students: List[MediaAttendanceItem] = Field(default_factory=list)
    unresolved_faces: List[UnresolvedFaceItem] = Field(default_factory=list)
    processing_time_ms: float = 0.0
    status: str = "COMPLETED"


class MediaJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    session_subject: Optional[str] = None
    session_class: Optional[str] = None
    media_type: str
    filename: str
    file_size_bytes: Optional[int] = None
    duration_sec: Optional[float] = None
    resolution: Optional[str] = None
    status: str
    progress_pct: float = 0.0
    frames_total: int = 0
    frames_processed: int = 0
    faces_detected_total: int = 0
    recognized_count: int = 0
    unknown_count: int = 0
    uncertain_count: int = 0
    attendance_marked_count: int = 0
    summary_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
