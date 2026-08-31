import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import cv2
from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import StreamingResponse
import numpy as np
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.models.entities import Camera
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.schemas.camera import (
    CameraCreate,
    CameraResponse,
    CameraTestResult,
    CameraUpdate,
    MobilePairingResponse,
    ONVIFDiscoveryResponse,
)
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.camera_service import CameraNotFoundError, CameraService
from backend.app.services.recognition_service import RecognitionService, get_pipeline

router = APIRouter(prefix="/cameras", tags=["Camera Management"])


@router.post(
    "",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Camera",
    description="Registers a new camera device (Hardware Webcam, Mobile, CCTV / RTSP, or Video File).",
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
    "/discover-onvif",
    response_model=ONVIFDiscoveryResponse,
    summary="Discover ONVIF IP Cameras",
    description="Probes the local area network subnet for discoverable ONVIF IP cameras using WS-Discovery.",
)
async def discover_onvif(
    timeout: float = Query(1.5, ge=0.5, le=5.0, description="Probe timeout in seconds"),
) -> ONVIFDiscoveryResponse:
    return CameraService.discover_onvif_cameras(timeout_sec=timeout)


@router.post(
    "/mobile-pairing",
    response_model=MobilePairingResponse,
    summary="Generate Mobile Camera Pairing Token (POST)",
    description="Generates or renews a QR pairing session for smartphone video streaming.",
)
@router.get(
    "/mobile-pairing",
    response_model=MobilePairingResponse,
    summary="Generate Mobile Camera Pairing Token (GET)",
    description="Generates or renews a QR pairing session for smartphone video streaming.",
)
async def create_mobile_pairing(
    camera_id: Optional[str] = Query(None, description="Existing camera ID to renew pairing for"),
    camera_name: str = Query("Mobile Phone Camera", description="Display name for newly created mobile camera"),
    location: str = Query("Classroom", description="Physical location or room name"),
    assigned_class: Optional[str] = Query(None, description="Class assigned to this camera"),
    db: AsyncSession = Depends(get_db),
) -> MobilePairingResponse:
    return await CameraService.create_or_renew_mobile_pairing(
        db=db,
        camera_id=camera_id,
        camera_name=camera_name,
        location=location,
        assigned_class=assigned_class,
    )


@router.get(
    "/pairing-session/{token}",
    summary="Validate Mobile Pairing Session",
    description="Verifies a mobile QR pairing token and returns camera metadata for the smartphone capture station.",
)
async def get_pairing_session(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await CameraService.validate_pairing_session(db, token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pairing session is invalid, expired, or was revoked by administrator.",
        )
    camera, session = result
    return {
        "valid": True,
        "camera_id": camera.id,
        "camera_name": camera.name,
        "location": camera.location,
        "assigned_class": camera.assigned_class,
        "target_fps": camera.target_fps,
        "resolution": camera.resolution,
        "session_status": session.status,
    }


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


@router.get(
    "/{camera_id}/test",
    response_model=CameraTestResult,
    summary="Test Registered Camera Feed (GET)",
    description="Runs a real diagnostic test on a registered camera by its ID.",
)
@router.post(
    "/{camera_id}/test",
    response_model=CameraTestResult,
    summary="Test Registered Camera Feed (POST)",
    description="Runs a real diagnostic test on a registered camera by its ID.",
)
async def test_registered_camera(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
) -> CameraTestResult:
    cam_model = await db.get(Camera, camera_id)
    if not cam_model:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return await asyncio.to_thread(CameraService.test_camera_connection, stream_url=cam_model.stream_url, device_id=cam_model.device_id)


class CameraTestInput(BaseModel):
    stream_url: Optional[str] = None
    device_id: Optional[str] = None


@router.post(
    "/test-connection",
    response_model=CameraTestResult,
    summary="Test Camera Connectivity",
    description="Performs an immediate real camera handshake test and returns measured latency, FPS, resolution, and detector validation.",
)
async def test_connection(
    payload: Optional[CameraTestInput] = Body(default=None),
) -> CameraTestResult:
    stream_url = payload.stream_url if payload else None
    device_id = payload.device_id if payload else None
    return await asyncio.to_thread(CameraService.test_camera_connection, stream_url=stream_url, device_id=device_id)


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


@router.get(
    "/{camera_id}/frame",
    summary="Get Camera Latest Frame",
    description="Returns the latest decoded image frame as a JPEG image for browser preview.",
)
@router.get(
    "/{camera_id}/preview",
    summary="Get Camera Latest Frame Snapshot",
    description="Returns the latest decoded image frame as a JPEG buffer for web preview.",
)
async def get_camera_frame(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    cam_model = await db.get(Camera, camera_id)
    frame = await asyncio.to_thread(CameraService.capture_camera_frame, camera_id, camera_obj=cam_model)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No live video frame currently available for this camera. Verify camera stream is running.",
        )
    ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to encode JPEG preview.")
    return Response(content=jpeg.tobytes(), media_type="image/jpeg")


@router.post(
    "/{camera_id}/capture",
    summary="Capture Frame From Camera",
    description="Captures the latest high-resolution frame from the camera stream, saves it to outputs/, and returns the image URL.",
)
async def capture_camera_frame_endpoint(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from pathlib import Path
    cam_model = await db.get(Camera, camera_id)
    if not cam_model:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")

    frame = await asyncio.to_thread(CameraService.capture_camera_frame, camera_id, camera_obj=cam_model)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not capture frame from camera '{cam_model.name}'. Ensure IP Camera or stream is accessible at '{cam_model.stream_url}'.",
        )

    h, w = frame.shape[:2]
    out_id = uuid.uuid4().hex[:8]
    filename = f"capture_{out_id}.jpg"
    
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    outputs_dir = project_root / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    out_path = outputs_dir / filename
    cv2.imwrite(str(out_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])

    return {
        "success": True,
        "camera_id": camera_id,
        "camera_name": cam_model.name,
        "frame_url": f"/outputs/{filename}",
        "width": w,
        "height": h,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/{camera_id}/mjpeg",
    summary="Get Live MJPEG Video Stream",
    description="Streams real-time multipart/x-mixed-replace JPEG frames for live browser CCTV/RTSP viewing.",
)
async def get_camera_mjpeg_stream(
    camera_id: str,
    db: AsyncSession = Depends(get_db),
):
    async def mjpeg_generator():
        # Yield initial blank frame to immediately establish HTTP multipart streaming connection
        cached = CameraService.get_cached_frame(camera_id)
        if cached is not None:
            ret, jpeg = cv2.imencode(".jpg", cached, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        else:
            blank = np.zeros((360, 480, 3), dtype=np.uint8)
            ret, jpeg = cv2.imencode(".jpg", blank, [int(cv2.IMWRITE_JPEG_QUALITY), 60])

        if ret:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
            )

        while True:
            frame = CameraService.get_cached_frame(camera_id)
            if frame is not None:
                ret, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ret:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
                    )
            await asyncio.sleep(0.066)  # ~15 FPS

    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.websocket("/{camera_id}/mobile-uplink")
async def mobile_camera_websocket_uplink(
    websocket: WebSocket,
    camera_id: str,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
):
    """Real-time binary frame ingestion transport over WebSocket from phone browser."""
    await websocket.accept()
    from backend.app.database.session import AsyncSessionLocal
    import json

    # Validate pairing and set camera streaming
    async with AsyncSessionLocal() as db:
        if token:
            valid = await CameraService.validate_pairing_session(db, token)
            if not valid:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid or expired token"}))
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        camera = await db.get(Camera, camera_id)
        if camera:
            camera.status = "STREAMING"
            await db.commit()

    try:
        while True:
            # Receive binary frame payload (JPEG buffer)
            frame_bytes = await websocket.receive_bytes()
            nparr = np.frombuffer(frame_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is not None:
                async with AsyncSessionLocal() as db:
                    await CameraService.record_frame_received(db, camera_id, frame=image)
                    # Broadcast frame to connected desktop viewers in real time
                    await CameraService.broadcast_frame(camera_id, frame_bytes)

                    # If session is active, run recognition pipeline
                    if session_id:
                        pipeline = get_pipeline()
                        if pipeline.matcher.total_templates == 0:
                            await RecognitionService.sync_gallery_from_db(db)

                        results, _ = pipeline.process_frame(image)
                        for r in results:
                            if r.decision.value == "KNOWN" and r.best_match:
                                try:
                                    await AttendanceService.mark_attendance(
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
                                except Exception:
                                    pass

                        await websocket.send_text(
                            json.dumps({
                                "type": "telemetry",
                                "faces_detected": len(results),
                                "recognized": [r.best_match.name for r in results if r.best_match and r.decision.value == "KNOWN"],
                            })
                        )
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        async with AsyncSessionLocal() as db:
            await CameraService.set_camera_offline(db, camera_id, status_label="DISCONNECTED")


@router.websocket("/{camera_id}/laptop-stream")
async def laptop_camera_websocket_downlink(
    websocket: WebSocket,
    camera_id: str,
):
    """Real-time binary frame stream delivery over WebSocket to laptop Live Attendance/Preview."""
    await websocket.accept()
    CameraService.add_subscriber(camera_id, websocket)

    # If cached frame exists, send immediately
    cached = CameraService.get_cached_frame(camera_id)
    if cached is not None:
        ret, jpeg = cv2.imencode(".jpg", cached, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ret:
            try:
                await websocket.send_bytes(jpeg.tobytes())
            except Exception:
                pass

    try:
        while True:
            # Keepalive listener
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        CameraService.remove_subscriber(camera_id, websocket)


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
    if file is None:
        raise HTTPException(status_code=400, detail="No video frame payload uploaded.")

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode mobile camera frame buffer.")

    # Record real frame activity and cache latest frame for preview
    await CameraService.record_frame_received(db, camera_id, frame=image)
    # Also broadcast frame to connected laptop viewers
    await CameraService.broadcast_frame(camera_id, contents)

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

