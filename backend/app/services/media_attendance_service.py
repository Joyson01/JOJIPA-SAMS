import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

import cv2
import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.models.entities import (
    AttendanceRecord,
    AttendanceSession,
    AuditLog,
    MediaProcessingJob,
    Student,
)
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.schemas.media_attendance import (
    MediaAnalysisResponse,
    MediaAttendanceItem,
    MediaJobResponse,
    UnresolvedFaceItem,
)
from backend.app.services.attendance_service import AttendanceService, SessionNotFoundError
from backend.app.services.recognition_service import RecognitionService, get_pipeline

logger = logging.getLogger('jojipa_sams.media_attendance')

# Global map of active job cancellation events
_active_cancellation_events: Dict[str, asyncio.Event] = {}

UPLOAD_DIR = Path("data/uploads/media")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MediaAttendanceService:
    @classmethod
    async def analyze_image(
        cls,
        db: AsyncSession,
        session_id: str,
        image_bytes: bytes,
        filename: str = "uploaded_image.jpg",
        created_by: Optional[str] = None,
    ) -> MediaAnalysisResponse:
        """Processes a single static image for classroom attendance using the common AI pipeline."""
        t0 = time.perf_counter()

        # 1. Verify session exists
        session_res = await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == session_id)
        )
        session_obj = session_res.scalars().first()
        if not session_obj:
            raise SessionNotFoundError(f"Attendance session '{session_id}' not found.")

        # 2. Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image bytes. Unsupported or corrupted format.")

        h, w = image.shape[:2]
        resolution_str = f"{w}x{h}"

        # 3. Ensure gallery is synchronized
        pipeline = get_pipeline()
        if pipeline.matcher.total_templates == 0:
            await RecognitionService.sync_gallery_from_db(db)

        # 4. Run full recognition pipeline
        results, face_boxes = pipeline.process_frame(image)

        recognized_items: List[MediaAttendanceItem] = []
        unresolved_items: List[UnresolvedFaceItem] = []
        marked_student_ids: Set[str] = set()

        # Fetch enrolled student details
        student_lookup: Dict[str, Student] = {}
        all_students_res = await db.execute(select(Student))
        for st in all_students_res.scalars().all():
            student_lookup[st.id] = st

        for idx, r in enumerate(results):
            face_box = face_boxes[idx].bbox.to_list()[:4] if idx < len(face_boxes) else []
            quality_score = round(float(getattr(face_boxes[idx], 'det_score', 1.0)), 3) if idx < len(face_boxes) else 1.0

            if r.decision.value == "KNOWN" and r.best_match:
                st_id = r.best_match.student_id
                st_ent = student_lookup.get(st_id)
                st_name = st_ent.full_name if st_ent else r.best_match.name
                st_code = st_ent.student_code if st_ent else ""
                st_roll = st_ent.roll_number if st_ent else ""

                # Mark attendance with MEDIA_IMAGE source
                if st_id not in marked_student_ids:
                    try:
                        await AttendanceService.mark_attendance(
                            db=db,
                            session_id=session_id,
                            payload=AttendanceMarkPayload(
                                student_id=st_id,
                                confidence=r.best_match.similarity,
                                liveness_score=1.0,
                                remarks=f"Media Image: {filename} ({r.best_match.confidence_pct:.1f}%)",
                            ),
                        )
                        marked_student_ids.add(st_id)
                    except Exception as e:
                        logger.warning(f"Attendance mark error for {st_name}: {e}")

                recognized_items.append(
                    MediaAttendanceItem(
                        student_id=st_id,
                        student_name=st_name,
                        student_code=st_code,
                        roll_number=st_roll,
                        confidence=round(r.best_match.similarity, 4),
                        confidence_pct=round(r.best_match.confidence_pct, 1),
                        attendance_status="PRESENT",
                        decision="KNOWN",
                        first_seen="Image Capture",
                        last_seen="Image Capture",
                        observation_count=1,
                        remarks=f"Confidence {r.best_match.confidence_pct:.1f}%",
                    )
                )
            else:
                # UNKNOWN or UNCERTAIN face -> DO NOT mark attendance
                unresolved_items.append(
                    UnresolvedFaceItem(
                        face_id=f"face_{idx + 1}",
                        decision=r.decision.value,
                        confidence=round(r.best_match.similarity, 4) if r.best_match else 0.0,
                        confidence_pct=round(r.best_match.confidence_pct, 1) if r.best_match else 0.0,
                        bbox=face_box,
                        quality_score=quality_score,
                        rejection_reason=r.rejection_reason or ("Unrecognized student" if r.decision.value == "UNKNOWN" else "Ambiguous similarity"),
                    )
                )

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        # Save media processing job record in DB
        job = MediaProcessingJob(
            session_id=session_id,
            media_type="IMAGE",
            filename=filename,
            file_path="",
            file_size_bytes=len(image_bytes),
            duration_sec=0.0,
            resolution=resolution_str,
            status="COMPLETED",
            progress_pct=100.0,
            frames_total=1,
            frames_processed=1,
            faces_detected_total=len(results),
            recognized_count=len(recognized_items),
            unknown_count=sum(1 for u in unresolved_items if u.decision == "UNKNOWN"),
            uncertain_count=sum(1 for u in unresolved_items if u.decision == "UNCERTAIN"),
            attendance_marked_count=len(marked_student_ids),
            summary_json={
                "recognized": [item.model_dump() for item in recognized_items],
                "unresolved": [item.model_dump() for item in unresolved_items],
            },
            created_by=created_by,
            started_at=_utc_now(),
            completed_at=_utc_now(),
        )
        db.add(job)

        # Audit log
        db.add(
            AuditLog(
                action="MEDIA_IMAGE_ATTENDANCE",
                entity_type="attendance_sessions",
                entity_id=session_id,
                new_values={
                    "filename": filename,
                    "faces_detected": len(results),
                    "recognized": len(recognized_items),
                    "attendance_marked": len(marked_student_ids),
                },
            )
        )
        await db.commit()
        await db.refresh(job)

        return MediaAnalysisResponse(
            job_id=job.id,
            session_id=session_id,
            session_subject=session_obj.subject,
            session_class=session_obj.class_name,
            media_type="IMAGE",
            filename=filename,
            duration_sec=0.0,
            resolution=resolution_str,
            faces_detected=len(results),
            recognized_count=len(recognized_items),
            unknown_count=sum(1 for u in unresolved_items if u.decision == "UNKNOWN"),
            uncertain_count=sum(1 for u in unresolved_items if u.decision == "UNCERTAIN"),
            attendance_marked_count=len(marked_student_ids),
            recognized_students=recognized_items,
            unresolved_faces=unresolved_items,
            processing_time_ms=elapsed_ms,
            status="COMPLETED",
        )

    @classmethod
    async def create_video_job(
        cls,
        db: AsyncSession,
        session_id: str,
        video_bytes: bytes,
        filename: str,
        created_by: Optional[str] = None,
    ) -> MediaProcessingJob:
        """Uploads a video and initializes a background MediaProcessingJob."""
        # 1. Verify session exists
        session_res = await db.execute(
            select(AttendanceSession).where(AttendanceSession.id == session_id)
        )
        session_obj = session_res.scalars().first()
        if not session_obj:
            raise SessionNotFoundError(f"Attendance session '{session_id}' not found.")

        # 2. Save video file to disk
        file_id = os.urandom(8).hex()
        safe_name = Path(filename).name.replace(" ", "_")
        stored_path = UPLOAD_DIR / f"{file_id}_{safe_name}"
        stored_path.write_bytes(video_bytes)

        # 3. Read video metadata
        cap = cv2.VideoCapture(str(stored_path))
        if not cap.isOpened():
            stored_path.unlink(missing_ok=True)
            raise ValueError("Uploaded file is not a valid or decodable video.")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = round(total_frames / video_fps, 2) if video_fps > 0 else 0.0
        cap.release()

        job = MediaProcessingJob(
            session_id=session_id,
            media_type="VIDEO",
            filename=filename,
            file_path=str(stored_path),
            file_size_bytes=len(video_bytes),
            duration_sec=duration_sec,
            resolution=f"{width}x{height}",
            status="QUEUED",
            progress_pct=0.0,
            frames_total=total_frames,
            frames_processed=0,
            faces_detected_total=0,
            recognized_count=0,
            unknown_count=0,
            uncertain_count=0,
            attendance_marked_count=0,
            created_by=created_by,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        return job

    @classmethod
    async def process_video_background(
        cls,
        job_id: str,
        sample_fps: float = 3.0,
    ) -> None:
        """Background worker task that extracts frames, tracks faces, runs recognition, and marks attendance."""
        from backend.app.database.session import AsyncSessionLocal

        cancel_event = asyncio.Event()
        _active_cancellation_events[job_id] = cancel_event

        async with AsyncSessionLocal() as db:
            job_res = await db.execute(
                select(MediaProcessingJob).where(MediaProcessingJob.id == job_id)
            )
            job = job_res.scalars().first()
            if not job:
                logger.error(f"Job {job_id} not found for background execution.")
                return

            job.status = "PROCESSING"
            job.started_at = _utc_now()
            await db.commit()

            file_path = job.file_path
            session_id = job.session_id

        # Video frame analysis loop
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            async with AsyncSessionLocal() as db:
                j = await db.get(MediaProcessingJob, job_id)
                if j:
                    j.status = "FAILED"
                    j.error_message = "Could not open video file for frame processing."
                    j.completed_at = _utc_now()
                    await db.commit()
            _active_cancellation_events.pop(job_id, None)
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_interval = max(1, int(round(orig_fps / sample_fps)))

        pipeline = get_pipeline()
        async with AsyncSessionLocal() as db:
            if pipeline.matcher.total_templates == 0:
                await RecognitionService.sync_gallery_from_db(db)

            # Pre-load student details
            st_res = await db.execute(select(Student))
            student_lookup = {st.id: st for st in st_res.scalars().all()}

        # Student recognition accumulator over time
        # student_id -> { count: int, max_conf: float, first_seen_sec: float, last_seen_sec: float }
        student_observations: Dict[str, Dict[str, Any]] = {}
        unresolved_faces: List[UnresolvedFaceItem] = []
        total_faces_detected = 0
        frames_processed_count = 0
        frame_idx = 0

        try:
            while cap.isOpened():
                if cancel_event.is_set():
                    logger.info(f"Job {job_id} was cancelled by user.")
                    break

                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_interval == 0:
                    frames_processed_count += 1
                    sec_offset = round(frame_idx / orig_fps, 2)

                    # Process frame
                    results, face_boxes = pipeline.process_frame(frame)
                    total_faces_detected += len(results)

                    for idx, r in enumerate(results):
                        if r.decision.value == "KNOWN" and r.best_match:
                            s_id = r.best_match.student_id
                            if s_id not in student_observations:
                                student_observations[s_id] = {
                                    "count": 1,
                                    "max_conf": r.best_match.similarity,
                                    "max_conf_pct": r.best_match.confidence_pct,
                                    "first_seen_sec": sec_offset,
                                    "last_seen_sec": sec_offset,
                                    "name": r.best_match.name,
                                }
                            else:
                                obs = student_observations[s_id]
                                obs["count"] += 1
                                obs["last_seen_sec"] = sec_offset
                                if r.best_match.similarity > obs["max_conf"]:
                                    obs["max_conf"] = r.best_match.similarity
                                    obs["max_conf_pct"] = r.best_match.confidence_pct
                        else:
                            # Keep sample of unresolved faces (capped at 50 to avoid huge JSON)
                            if len(unresolved_faces) < 50:
                                bbox = face_boxes[idx].bbox.to_list()[:4] if idx < len(face_boxes) else []
                                unresolved_faces.append(
                                    UnresolvedFaceItem(
                                        face_id=f"v_{frame_idx}_{idx}",
                                        decision=r.decision.value,
                                        confidence=round(r.best_match.similarity, 4) if r.best_match else 0.0,
                                        confidence_pct=round(r.best_match.confidence_pct, 1) if r.best_match else 0.0,
                                        timestamp_sec=sec_offset,
                                        frame_number=frame_idx,
                                        bbox=bbox,
                                        quality_score=round(float(getattr(face_boxes[idx], 'det_score', 1.0)), 3) if idx < len(face_boxes) else 1.0,
                                        rejection_reason=r.rejection_reason or ("Unrecognized" if r.decision.value == "UNKNOWN" else "Uncertain"),
                                    )
                                )

                    # Periodic DB progress update every 15 sampled frames
                    if frames_processed_count % 15 == 0:
                        progress = round((frame_idx / max(1, total_frames)) * 100.0, 1)
                        async with AsyncSessionLocal() as db:
                            j = await db.get(MediaProcessingJob, job_id)
                            if j and j.status == "PROCESSING":
                                j.progress_pct = progress
                                j.frames_processed = frames_processed_count
                                j.faces_detected_total = total_faces_detected
                                j.recognized_count = len(student_observations)
                                await db.commit()

                    # Yield control to event loop
                    await asyncio.sleep(0.001)

                frame_idx += 1

        except Exception as proc_err:
            logger.error(f"Error during video processing job {job_id}: {proc_err}", exc_info=True)
            async with AsyncSessionLocal() as db:
                j = await db.get(MediaProcessingJob, job_id)
                if j:
                    j.status = "FAILED"
                    j.error_message = str(proc_err)
                    j.completed_at = _utc_now()
                    await db.commit()
            cap.release()
            _active_cancellation_events.pop(job_id, None)
            return

        cap.release()

        # Handle Cancellation
        if cancel_event.is_set():
            async with AsyncSessionLocal() as db:
                j = await db.get(MediaProcessingJob, job_id)
                if j:
                    j.status = "CANCELLED"
                    j.completed_at = _utc_now()
                    await db.commit()
            _active_cancellation_events.pop(job_id, None)
            return

        # 4. Finalize attendance marking for all verified students (ONE RECORD PER STUDENT PER SESSION)
        recognized_items: List[MediaAttendanceItem] = []
        marked_count = 0

        async with AsyncSessionLocal() as db:
            for s_id, obs in student_observations.items():
                st_ent = student_lookup.get(s_id)
                st_name = st_ent.full_name if st_ent else obs["name"]
                st_code = st_ent.student_code if st_ent else ""
                st_roll = st_ent.roll_number if st_ent else ""

                # Format timestamps
                m_start, s_start = divmod(int(obs["first_seen_sec"]), 60)
                m_end, s_end = divmod(int(obs["last_seen_sec"]), 60)
                time_range_str = f"{m_start:02d}:{s_start:02d} - {m_end:02d}:{s_end:02d}"

                try:
                    await AttendanceService.mark_attendance(
                        db=db,
                        session_id=session_id,
                        payload=AttendanceMarkPayload(
                            student_id=s_id,
                            confidence=obs["max_conf"],
                            liveness_score=1.0,
                            remarks=f"Media Video: {time_range_str} ({obs['count']} observations, {obs['max_conf_pct']:.1f}%)",
                        ),
                    )
                    marked_count += 1
                except Exception as e:
                    logger.warning(f"Attendance mark error for {st_name}: {e}")

                recognized_items.append(
                    MediaAttendanceItem(
                        student_id=s_id,
                        student_name=st_name,
                        student_code=st_code,
                        roll_number=st_roll,
                        confidence=round(obs["max_conf"], 4),
                        confidence_pct=round(obs["max_conf_pct"], 1),
                        attendance_status="PRESENT",
                        decision="KNOWN",
                        first_seen=f"{m_start:02d}:{s_start:02d}",
                        last_seen=f"{m_end:02d}:{s_end:02d}",
                        observation_count=obs["count"],
                        remarks=f"Observed {obs['count']} times ({time_range_str})",
                    )
                )

            # Update final job state
            j = await db.get(MediaProcessingJob, job_id)
            if j:
                j.status = "COMPLETED"
                j.progress_pct = 100.0
                j.frames_processed = frames_processed_count
                j.faces_detected_total = total_faces_detected
                j.recognized_count = len(recognized_items)
                j.unknown_count = sum(1 for u in unresolved_faces if u.decision == "UNKNOWN")
                j.uncertain_count = sum(1 for u in unresolved_faces if u.decision == "UNCERTAIN")
                j.attendance_marked_count = marked_count
                j.summary_json = {
                    "recognized": [item.model_dump() for item in recognized_items],
                    "unresolved": [item.model_dump() for item in unresolved_faces],
                }
                j.completed_at = _utc_now()

            # Audit log
            db.add(
                AuditLog(
                    action="MEDIA_VIDEO_ATTENDANCE_COMPLETED",
                    entity_type="media_processing_jobs",
                    entity_id=job_id,
                    new_values={
                        "session_id": session_id,
                        "frames_processed": frames_processed_count,
                        "faces_detected": total_faces_detected,
                        "recognized": len(recognized_items),
                        "attendance_marked": marked_count,
                    },
                )
            )
            await db.commit()

        _active_cancellation_events.pop(job_id, None)
        logger.info(f"Job {job_id} completed successfully. Marked {marked_count} students.")

    @classmethod
    async def cancel_job(cls, db: AsyncSession, job_id: str) -> bool:
        """Signals cancellation to a running background video job."""
        if job_id in _active_cancellation_events:
            _active_cancellation_events[job_id].set()

        job = await db.get(MediaProcessingJob, job_id)
        if not job:
            return False

        if job.status in ["QUEUED", "PROCESSING"]:
            job.status = "CANCELLED"
            job.completed_at = _utc_now()
            await db.commit()
            return True
        return False

    @classmethod
    async def list_jobs(
        cls,
        db: AsyncSession,
        session_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[MediaJobResponse]:
        """Lists recent media processing jobs."""
        query = (
            select(MediaProcessingJob, AttendanceSession.subject, AttendanceSession.class_name)
            .join(AttendanceSession, MediaProcessingJob.session_id == AttendanceSession.id, isouter=True)
            .order_by(desc(MediaProcessingJob.created_at))
            .limit(limit)
        )
        if session_id:
            query = query.where(MediaProcessingJob.session_id == session_id)

        res = await db.execute(query)
        rows = res.all()

        results = []
        for job_ent, subj, cls_name in rows:
            resp = MediaJobResponse.model_validate(job_ent)
            resp.session_subject = subj or ""
            resp.session_class = cls_name or ""
            results.append(resp)
        return results

    @classmethod
    async def get_job_by_id(
        cls,
        db: AsyncSession,
        job_id: str,
    ) -> Optional[MediaJobResponse]:
        """Retrieves details for a specific media processing job."""
        query = (
            select(MediaProcessingJob, AttendanceSession.subject, AttendanceSession.class_name)
            .join(AttendanceSession, MediaProcessingJob.session_id == AttendanceSession.id, isouter=True)
            .where(MediaProcessingJob.id == job_id)
        )
        res = await db.execute(query)
        row = res.first()
        if not row:
            return None

        job_ent, subj, cls_name = row
        resp = MediaJobResponse.model_validate(job_ent)
        resp.session_subject = subj or ""
        resp.session_class = cls_name or ""
        return resp

    @classmethod
    async def delete_job(cls, db: AsyncSession, job_id: str) -> bool:
        """Deletes a media processing job and removes the uploaded file."""
        job = await db.get(MediaProcessingJob, job_id)
        if not job:
            return False

        if job.file_path and os.path.exists(job.file_path):
            try:
                os.remove(job.file_path)
            except Exception as e:
                logger.warning(f"Failed to delete media file {job.file_path}: {e}")

        await db.delete(job)
        await db.commit()
        return True
