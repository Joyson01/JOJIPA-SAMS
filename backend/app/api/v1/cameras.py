from typing import List, Optional
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.database.session import get_db
from backend.app.models.entities import Camera
from backend.app.schemas.camera import (
    CameraCreate,
    CameraResponse,
    CameraTestResult,
    CameraUpdate,
)
from backend.app.services.camera_service import CameraNotFoundError, CameraService

router = APIRouter(prefix="/cameras", tags=["Camera Management"])


@router.post(
    "",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Camera",
    description="Registers a new camera device or RTSP endpoint.",
)
async def create_camera(
    camera_in: CameraCreate,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.create_camera(db, camera_in)


@router.get(
    "",
    response_model=List[CameraResponse],
    summary="List Cameras",
    description="Lists all registered cameras with filtering by location, active status, or assigned class.",
)
async def list_cameras(
    location: Optional[str] = Query(None, description="Filter by location/room"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    assigned_class: Optional[str] = Query(None, description="Filter by assigned class"),
    db: AsyncSession = Depends(get_db),
) -> List[CameraResponse]:
    return await CameraService.list_cameras(db, location=location, is_active=is_active, assigned_class=assigned_class)


@router.get(
    "/{camera_id}",
    response_model=CameraResponse,
    summary="Get Camera Details",
)
async def get_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.get_camera_by_id(db, camera_id)


@router.put(
    "/{camera_id}",
    response_model=CameraResponse,
    summary="Update Camera",
)
async def update_camera(
    camera_id: str,
    update_in: CameraUpdate,
    db: AsyncSession = Depends(get_db),
) -> CameraResponse:
    return await CameraService.update_camera(db, camera_id, update_in)


@router.delete(
    "/{camera_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Camera",
)
async def delete_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    await CameraService.delete_camera(db, camera_id)
    return None


@router.post(
    "/{camera_id}/test",
    response_model=CameraTestResult,
    summary="Test Registered Camera Feed",
    description="Runs a real diagnostic test on a registered camera by its ID.",
)
async def test_registered_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
) -> CameraTestResult:
    cam = await CameraService.get_camera_by_id(db, camera_id)
    return CameraService.test_camera_connection(stream_url=cam.stream_url, device_id=cam.device_id)


@router.post(
    "/test-connection",
    response_model=CameraTestResult,
    summary="Test Camera Connectivity",
    description="Performs an immediate real camera handshake test and returns measured latency, FPS, and resolution.",
)
async def test_connection(
    stream_url: Optional[str] = Body(None, embed=True),
    device_id: Optional[str] = Body(None, embed=True),
) -> CameraTestResult:
    return CameraService.test_camera_connection(stream_url=stream_url, device_id=device_id)


@router.post(
    "/{camera_id}/start",
    summary="Start Camera Worker",
    description="Starts the background RTSP capture worker for continuous frame ingestion.",
)
async def start_camera_worker(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    camera = await CameraService.get_camera_by_id(db, camera_id)
    if not camera.stream_url:
        raise HTTPException(status_code=400, detail="Camera has no stream_url configured.")
    CameraService.start_camera_worker(camera.id, camera.stream_url, name=camera.name)
    return {"status": "started", "camera_id": camera_id}


@router.post(
    "/{camera_id}/stop",
    summary="Stop Camera Worker",
    description="Stops background RTSP capture worker.",
)
async def stop_camera_worker(camera_id: str):
    CameraService.stop_camera_worker(camera_id)
    return {"status": "stopped", "camera_id": camera_id}


@router.post(
    "/mobile-pairing",
    summary="Generate Mobile Camera Pairing Token",
    description="Generates a temporary secure pairing session for smartphone camera streaming without creating duplicate camera records.",
)
async def create_mobile_pairing(
    camera_id: Optional[str] = Query(None, description="Existing camera ID to re-pair"),
    camera_name: str = Query("Mobile Phone Camera", description="Label for the mobile device"),
    location: str = Query("Classroom", description="Location where the phone is deployed"),
    assigned_class: Optional[str] = Query(None, description="Class code"),
    db: AsyncSession = Depends(get_db),
):
    import secrets
    token = secrets.token_urlsafe(16)

    # If existing camera_id provided, re-pair that exact camera
    if camera_id:
        existing_cam = await db.get(Camera, camera_id)
        if existing_cam:
            existing_cam.stream_url = f"mobile://{token}"
            existing_cam.status = "CONNECTED"
            if assigned_class:
                existing_cam.assigned_class = assigned_class
            await db.commit()
            await db.refresh(existing_cam)
            return {
                "token": token,
                "camera_id": existing_cam.id,
                "camera_name": existing_cam.name,
                "location": existing_cam.location,
                "source_type": existing_cam.source_type,
            }

    # Check if a mobile camera already exists with the same name and location
    query = select(Camera).where(
        Camera.source_type == "MOBILE",
        Camera.name == camera_name,
        Camera.location == location,
    )
    res = await db.execute(query)
    found_cam = res.scalars().first()

    if found_cam:
        found_cam.stream_url = f"mobile://{token}"
        found_cam.status = "CONNECTED"
        if assigned_class:
            found_cam.assigned_class = assigned_class
        await db.commit()
        await db.refresh(found_cam)
        return {
            "token": token,
            "camera_id": found_cam.id,
            "camera_name": found_cam.name,
            "location": found_cam.location,
            "source_type": found_cam.source_type,
        }

    # Otherwise create a new single mobile camera record
    cam = await CameraService.create_camera(
        db,
        CameraCreate(
            name=camera_name,
            location=location,
            source_type="MOBILE",
            stream_url=f"mobile://{token}",
            target_fps=15,
            resolution="1280x720",
            assigned_class=assigned_class,
            is_active=True,
        ),
    )
    return {
        "token": token,
        "camera_id": cam.id,
        "camera_name": cam.name,
        "location": cam.location,
        "source_type": cam.source_type,
    }


@router.post(
    "/mobile-frame",
    summary="Process Mobile Camera Frame",
    description="Receives frame captures from a paired mobile phone camera, updates camera health timestamps, and runs the recognition pipeline.",
)
async def process_mobile_frame(
    camera_id: str = Form(..., description="Paired camera identifier"),
    session_id: Optional[str] = Form(None, description="Optional active attendance session ID"),
    token: Optional[str] = Form(None, description="Temporary security token"),
    file: UploadFile = File(..., description="JPEG frame buffer"),
    db: AsyncSession = Depends(get_db),
):
    import cv2
    import numpy as np
    from backend.app.services.recognition_service import get_pipeline, RecognitionService
    from backend.app.services.attendance_service import AttendanceService
    from backend.app.schemas.attendance import AttendanceMarkPayload

    if file is None:
        raise HTTPException(status_code=400, detail="No video frame payload uploaded.")

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode mobile camera frame buffer.")

    # Record real frame activity for camera health tracking
    await CameraService.record_frame_received(db, camera_id)

    pipeline = get_pipeline()
    if pipeline.matcher.total_templates == 0:
        await RecognitionService.sync_gallery_from_db(db)

    results, _ = pipeline.process_frame(image)

    attendance_events = []
    for r in results:
        if r.decision.value == "KNOWN" and r.best_match and session_id:
            try:
                rec = await AttendanceService.mark_attendance(
                    db=db,
                    session_id=session_id,
                    payload=AttendanceMarkPayload(
                        student_id=r.best_match.student_id,
                        camera_id=camera_id,
                        confidence=r.best_match.similarity,
                        liveness_score=r.liveness_score,
                        remarks=f"Mobile camera ({r.best_match.confidence_pct:.1f}%)",
                    ),
                )
                attendance_events.append({
                    "student_name": r.best_match.name,
                    "student_code": r.best_match.student_code,
                    "record_id": rec.id,
                    "status": rec.status,
                })
            except Exception:
                pass

    return {
        "camera_id": camera_id,
        "faces_detected": len(results),
        "results": [
            {
                "decision": r.decision.value,
                "confidence": r.best_match.confidence_pct if r.best_match else 0.0,
                "name": r.best_match.name if r.best_match else "UNKNOWN",
                "student_code": r.best_match.student_code if r.best_match else None,
                "is_live": r.is_live,
                "bbox": r.bbox.to_list() if r.bbox else None,
            }
            for r in results
        ],
        "attendance_marked": attendance_events,
    }
