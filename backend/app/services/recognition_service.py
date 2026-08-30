import asyncio
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_engine.base import DecisionState, RecognitionResult
from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
from ai_engine.recognition.vector_matcher import EnrolledTemplate
from backend.app.core.logging import logger
from backend.app.models.entities import FaceProfile, Student
from backend.app.schemas.recognition import (
    CandidateDTO,
    DetectedFaceResultDTO,
    RecognitionResponse,
    ThresholdsConfig,
)

_pipeline_instance: Optional[FaceRecognitionPipeline] = None
_pipeline_lock = asyncio.Lock()


def get_pipeline() -> FaceRecognitionPipeline:
    """Singleton getter for the FaceRecognitionPipeline."""
    global _pipeline_instance
    if _pipeline_instance is None:
        logger.info("Initializing FaceRecognitionPipeline instance...")
        _pipeline_instance = FaceRecognitionPipeline()
    return _pipeline_instance


class RecognitionService:
    """Service orchestrating face recognition and gallery synchronization with PostgreSQL."""

    @classmethod
    async def sync_gallery_from_db(cls, db: AsyncSession) -> int:
        """Loads all active face profiles from the database into the in-memory vector index."""
        pipeline = get_pipeline()

        query = (
            select(FaceProfile)
            .join(Student, FaceProfile.student_id == Student.id)
            .where(Student.status == "ACTIVE")
            .options(selectinload(FaceProfile.student))
        )
        result = await db.execute(query)
        profiles = result.scalars().all()

        templates: List[EnrolledTemplate] = []
        for p in profiles:
            student = p.student
            if not student:
                continue

            emb_data = p.embedding_data
            if isinstance(emb_data, list) and len(emb_data) == 512:
                template = EnrolledTemplate(
                    profile_id=p.id,
                    student_id=student.id,
                    student_code=student.student_code,
                    roll_number=student.roll_number,
                    name=f"{student.first_name} {student.last_name}",
                    embedding=np.array(emb_data, dtype=np.float32),
                    quality_score=p.quality_score,
                    pose_type=p.pose_type,
                )
                templates.append(template)

        async with _pipeline_lock:
            pipeline.load_gallery(templates)

        logger.info(f"Synchronized gallery index: {len(templates)} templates across {pipeline.matcher.total_students} students.")
        return len(templates)

    @classmethod
    async def process_image_bytes(
        cls,
        db: AsyncSession,
        image_bytes: bytes,
        top_k: int = 3,
        run_quality_check: bool = True,
    ) -> RecognitionResponse:
        """Runs face recognition on an uploaded image."""
        pipeline = get_pipeline()

        # If gallery is empty, sync from database
        if pipeline.matcher.total_templates == 0:
            await cls.sync_gallery_from_db(db)

        # Decode image
        np_arr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image. Please provide a valid JPEG or PNG file.")

        results, latencies = pipeline.process_frame(
            image=image,
            run_quality_check=run_quality_check,
            top_k=top_k,
        )

        face_dtos: List[DetectedFaceResultDTO] = []
        for r in results:
            best_cand_dto = None
            if r.best_match:
                best_cand_dto = CandidateDTO(
                    student_id=r.best_match.student_id,
                    student_code=r.best_match.student_code,
                    roll_number=r.best_match.roll_number,
                    name=r.best_match.name,
                    similarity=r.best_match.similarity,
                    confidence_pct=r.best_match.confidence_pct,
                )

            top_dtos = [
                CandidateDTO(
                    student_id=c.student_id,
                    student_code=c.student_code,
                    roll_number=c.roll_number,
                    name=c.name,
                    similarity=c.similarity,
                    confidence_pct=c.confidence_pct,
                )
                for c in r.top_candidates
            ]

            face_dtos.append(
                DetectedFaceResultDTO(
                    face_idx=r.face_idx,
                    bbox=r.bbox.to_list(),
                    landmarks=r.landmarks.tolist() if r.landmarks is not None else [],
                    decision=r.decision.value,
                    best_match=best_cand_dto,
                    top_candidates=top_dtos,
                    sharpness=r.quality.sharpness if r.quality else 0.0,
                    brightness=r.quality.brightness if r.quality else 0.0,
                    is_quality_valid=r.quality.is_valid if r.quality else False,
                    pose_type=r.pose.pose_type if r.pose else "UNKNOWN",
                    yaw=r.pose.yaw if r.pose else 0.0,
                    pitch=r.pose.pitch if r.pose else 0.0,
                    roll=r.pose.roll if r.pose else 0.0,
                    decision_reason=r.decision_reason,
                )
            )

        thresholds = {
            "known_threshold": pipeline.matcher.known_threshold,
            "uncertain_threshold": pipeline.matcher.uncertain_threshold,
            "margin_threshold": pipeline.matcher.margin_threshold,
        }

        return RecognitionResponse(
            total_faces_detected=len(results),
            faces=face_dtos,
            latency_breakdown_ms=latencies,
            thresholds_applied=thresholds,
            index_student_count=pipeline.matcher.total_students,
        )

    @classmethod
    def get_thresholds(cls) -> ThresholdsConfig:
        pipeline = get_pipeline()
        return ThresholdsConfig(
            known_threshold=pipeline.matcher.known_threshold,
            uncertain_threshold=pipeline.matcher.uncertain_threshold,
            margin_threshold=pipeline.matcher.margin_threshold,
        )

    @classmethod
    def set_thresholds(cls, config: ThresholdsConfig) -> ThresholdsConfig:
        pipeline = get_pipeline()
        pipeline.matcher.set_thresholds(
            known_threshold=config.known_threshold,
            uncertain_threshold=config.uncertain_threshold,
            margin_threshold=config.margin_threshold,
        )
        logger.info(f"Updated recognition thresholds: known={config.known_threshold}, uncertain={config.uncertain_threshold}, margin={config.margin_threshold}")
        return cls.get_thresholds()

