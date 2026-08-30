from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CandidateDTO(BaseModel):
    student_id: str
    student_code: str
    roll_number: str
    name: str
    similarity: float = Field(..., description="Cosine similarity score in range [-1.0, 1.0]")
    confidence_pct: float = Field(..., description="Normalized confidence percentage (0-100%)")


class DetectedFaceResultDTO(BaseModel):
    face_idx: int
    bbox: List[float] = Field(..., description="[x1, y1, x2, y2, det_score]")
    landmarks: List[List[float]] = Field(..., description="5 fiducial landmark coordinates [[x, y], ...]")
    decision: str = Field(..., description="Decision state: KNOWN | UNKNOWN | UNCERTAIN")
    best_match: Optional[CandidateDTO] = None
    top_candidates: List[CandidateDTO] = []
    sharpness: float
    brightness: float
    is_quality_valid: bool
    pose_type: str
    yaw: float
    pitch: float
    roll: float
    decision_reason: str


class RecognitionResponse(BaseModel):
    total_faces_detected: int
    faces: List[DetectedFaceResultDTO]
    latency_breakdown_ms: Dict[str, float]
    thresholds_applied: Dict[str, float]
    index_student_count: int


class ThresholdsConfig(BaseModel):
    known_threshold: float = Field(0.58, ge=0.0, le=1.0, description="Minimum cosine similarity for KNOWN identity")
    uncertain_threshold: float = Field(0.40, ge=0.0, le=1.0, description="Lower similarity bound below which face is UNKNOWN")
    margin_threshold: float = Field(0.05, ge=0.0, le=0.5, description="Minimum score gap required between top candidate and 2nd candidate")

