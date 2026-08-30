import asyncio
from typing import Any, Dict, List, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.media_attendance import (
    MediaAnalysisResponse,
    MediaJobResponse,
)
from backend.app.services.attendance_service import SessionNotFoundError
from backend.app.services.recognition_service import RecognitionService, get_pipeline
from backend.app.services.media_attendance_service import (
    MediaAttendanceService,
    MAX_IMAGE_SIZE_BYTES,
    MAX_VIDEO_SIZE_BYTES,
)

router = APIRouter(prefix="/media-attendance", tags=["Media Attendance"])


@router.post(
    "/analyze-image",
    summary="Diagnostic Face Detection & Recognition on Image",
    description="Development diagnostic endpoint returning structured face bounding boxes, confidences, and identity matches without modifying session attendance.",
)
async def diagnose_image(
    file: UploadFile = File(..., description="Image JPEG/PNG/WEBP"),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty.")

    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Failed to decode image bytes.")

    pipeline = get_pipeline()
    if pipeline.matcher.total_templates == 0:
        await RecognitionService.sync_gallery_from_db(db)

    results, face_boxes = pipeline.process_frame(image)
    faces_data = []
    for idx, r in enumerate(results):
        box = face_boxes[idx].bbox.to_list()[:4] if idx < len(face_boxes) else []
        conf = round(float(getattr(face_boxes[idx], 'det_score', 1.0)), 4) if idx < len(face_boxes) else 1.0
        identity_name = r.best_match.name if (r.decision.value == "KNOWN" and r.best_match) else "Unknown"
        identity_conf = round(r.best_match.similarity, 4) if r.best_match else 0.0
        faces_data.append({
            "face_index": idx + 1,
            "box": box,
            "confidence": conf,
            "identity": identity_name,
            "identity_confidence": identity_conf,
            "state": r.decision.value,
            "rejection_reason": r.rejection_reason,
        })

    return {
        "faces_detected": len(results),
        "faces": faces_data,
        "recognized_count": sum(1 for f in faces_data if f["state"] == "KNOWN"),
        "unknown_count": sum(1 for f in faces_data if f["state"] == "UNKNOWN"),
        "uncertain_count": sum(1 for f in faces_data if f["state"] == "UNCERTAIN"),
    }


@router.post(
    "/image",
    response_model=MediaAnalysisResponse,
    summary="Analyze Static Image for Attendance",
    description="Runs face detection, quality analysis, embedding extraction, and marks attendance for recognized students in the chosen session.",
)
async def analyze_image_attendance(
    session_id: str = Form(..., description="Attendance session ID"),
    file: UploadFile = File(..., description="Classroom photo JPEG/PNG/WEBP"),
    db: AsyncSession = Depends(get_db),
) -> MediaAnalysisResponse:
    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    file_ext = "." + (file.filename or "").split(".")[-1].lower() if "." in (file.filename or "") else ""
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/pjpeg", "application/octet-stream"}

    if file.content_type not in allowed_types and file_ext not in valid_exts:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image format. Please upload JPEG, PNG, or WEBP.",
        )

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image file exceeds max allowed size of {MAX_IMAGE_SIZE_BYTES // (1024*1024)} MB.",
        )

    try:
        return await MediaAttendanceService.analyze_image(
            db=db,
            session_id=session_id,
            image_bytes=image_bytes,
            filename=file.filename or "classroom_photo.jpg",
        )
    except SessionNotFoundError as s_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(s_err))
    except ValueError as v_err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(v_err))


@router.post(
    "/video",
    response_model=MediaJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload Video for Attendance Processing",
    description="Uploads a recorded lecture/classroom video and starts background frame extraction, face tracking, and temporal attendance verification.",
)
async def process_video_attendance(
    session_id: str = Form(..., description="Attendance session ID"),
    sample_fps: float = Form(3.0, description="Sampling FPS for frame extraction"),
    file: UploadFile = File(..., description="Recorded video file (MP4, AVI, MKV, MOV, WebM)"),
    db: AsyncSession = Depends(get_db),
) -> MediaJobResponse:
    allowed_exts = {".mp4", ".avi", ".mkv", ".mov", ".webm"}
    file_ext = "." + (file.filename or "video.mp4").split(".")[-1].lower()
    if file_ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported video format '{file_ext}'. Allowed formats: {sorted(allowed_exts)}",
        )

    video_bytes = await file.read()
    if len(video_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded video is empty.")

    if len(video_bytes) > MAX_VIDEO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video file exceeds max size of {MAX_VIDEO_SIZE_BYTES // (1024*1024)} MB.",
        )

    try:
        job = await MediaAttendanceService.create_video_job(
            db=db,
            session_id=session_id,
            video_bytes=video_bytes,
            filename=file.filename or "recorded_lecture.mp4",
        )

        # Launch background processing task
        asyncio.create_task(
            MediaAttendanceService.process_video_background(
                job_id=job.id,
                sample_fps=sample_fps,
            )
        )

        job_resp = await MediaAttendanceService.get_job_by_id(db, job.id)
        return job_resp or MediaJobResponse.model_validate(job)
    except SessionNotFoundError as s_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(s_err))
    except ValueError as v_err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(v_err))


@router.get(
    "/jobs",
    response_model=List[MediaJobResponse],
    summary="List Media Processing Jobs",
    description="Lists historical media processing jobs with status, progress, and detection summaries.",
)
async def list_media_jobs(
    session_id: Optional[str] = Query(None, description="Filter by attendance session"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> List[MediaJobResponse]:
    return await MediaAttendanceService.list_jobs(db, session_id=session_id, limit=limit)


@router.get(
    "/jobs/{job_id}",
    response_model=MediaJobResponse,
    summary="Get Media Job Status & Summary",
)
async def get_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> MediaJobResponse:
    job = await MediaAttendanceService.get_job_by_id(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media job not found.")
    return job


@router.post(
    "/jobs/{job_id}/cancel",
    summary="Cancel Running Video Processing Job",
)
async def cancel_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    cancelled = await MediaAttendanceService.cancel_job(db, job_id)
    if not cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job could not be cancelled or was not active.")
    return {"status": "cancelled", "job_id": job_id}


@router.delete(
    "/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Media Job and Storage File",
)
async def delete_media_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    deleted = await MediaAttendanceService.delete_job(db, job_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media job not found.")
