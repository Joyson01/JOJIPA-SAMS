from datetime import datetime, timezone
import time
from typing import Dict, List, Optional
import cv2
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.streaming.rtsp_worker import RTSPStreamWorker
from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import Camera
from backend.app.schemas.camera import CameraCreate, CameraResponse, CameraTestResult, CameraUpdate

# Global in-memory registry of active RTSP stream workers
_active_camera_workers: Dict[str, RTSPStreamWorker] = {}


class CameraNotFoundError(SAMSException):
    def __init__(self, camera_id: str):
        super().__init__(
            status_code=404,
            error_code="CAMERA_NOT_FOUND",
            message=f"Camera with ID '{camera_id}' was not found.",
            details={"camera_id": camera_id},
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CameraService:
    """Service managing camera registry, live streaming workers, health computation, and diagnostics."""

    @classmethod
    async def create_camera(cls, db: AsyncSession, camera_in: CameraCreate) -> CameraResponse:
        """Registers a new camera device."""
        camera = Camera(
            name=camera_in.name,
            location=camera_in.location,
            source_type=camera_in.source_type,
            device_id=camera_in.device_id,
            stream_url=camera_in.stream_url,
            target_fps=camera_in.target_fps,
            resolution=camera_in.resolution,
            assigned_class=camera_in.assigned_class,
            detection_zone=camera_in.detection_zone,
            status="OFFLINE",
            is_active=camera_in.is_active,
        )
        db.add(camera)
        await db.commit()
        await db.refresh(camera)
        logger.info(f"Registered camera '{camera.name}' at {camera.location} (ID: {camera.id}, Type: {camera.source_type})")
        return cls._serialize_camera(camera)

    @classmethod
    async def get_camera_by_id(cls, db: AsyncSession, camera_id: str) -> CameraResponse:
        """Retrieves single camera by ID."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)
        return cls._serialize_camera(camera)

    @classmethod
    async def list_cameras(
        cls,
        db: AsyncSession,
        location: Optional[str] = None,
        is_active: Optional[bool] = None,
        assigned_class: Optional[str] = None,
    ) -> List[CameraResponse]:
        """Lists registered camera devices with optional filtering."""
        query = select(Camera)
        filters = []
        if location:
            filters.append(Camera.location.ilike(f"%{location}%"))
        if is_active is not None:
            filters.append(Camera.is_active == is_active)
        if assigned_class:
            filters.append(Camera.assigned_class == assigned_class)

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(Camera.created_at.desc())
        result = await db.execute(query)
        cameras = result.scalars().all()
        return [cls._serialize_camera(c) for c in cameras]

    @classmethod
    async def update_camera(cls, db: AsyncSession, camera_id: str, update_in: CameraUpdate) -> CameraResponse:
        """Updates camera settings."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)

        update_dict = update_in.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(camera, field, value)

        await db.commit()
        await db.refresh(camera)
        logger.info(f"Updated camera '{camera.name}' (ID: {camera.id})")
        return cls._serialize_camera(camera)

    @classmethod
    async def record_frame_received(cls, db: AsyncSession, camera_id: str) -> None:
        """Updates camera last_frame_at and live status."""
        camera = await db.get(Camera, camera_id)
        if camera:
            now = _utc_now()
            camera.last_frame_at = now
            camera.last_heartbeat = now
            camera.status = "STREAMING"
            await db.commit()

    @classmethod
    async def delete_camera(cls, db: AsyncSession, camera_id: str) -> bool:
        """Deletes a camera device and shuts down its stream worker if active."""
        camera = await db.get(Camera, camera_id)
        if not camera:
            raise CameraNotFoundError(camera_id)

        # Stop worker if active
        cls.stop_camera_worker(camera_id)

        await db.delete(camera)
        await db.commit()
        logger.info(f"Deleted camera '{camera.name}' (ID: {camera_id})")
        return True

    @classmethod
    def test_camera_connection(cls, stream_url: Optional[str] = None, device_id: Optional[str] = None) -> CameraTestResult:
        """Performs a real diagnostic sequence on a video source: connection -> stream -> frames -> resolution -> FPS -> latency."""
        start_time = time.perf_counter()

        source = stream_url or device_id or "0"
        try:
            url: int | str = int(source) if str(source).isdigit() else str(source)
            cap = cv2.VideoCapture(url)
            if not cap.isOpened():
                latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
                return CameraTestResult(
                    success=False,
                    status="CAMERA ERROR",
                    message=f"Failed to open camera device at '{source}'",
                    connection=False,
                    stream=False,
                    frames=False,
                    latency_ms=latency_ms,
                )

            ret, frame = cap.read()
            measured_fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
            cap.release()

            latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            if ret and frame is not None and frame.size > 0:
                h, w = frame.shape[:2]
                res_str = f"{w}x{h}"
                return CameraTestResult(
                    success=True,
                    status="CAMERA READY",
                    message=f"Camera healthy: receiving {res_str} frames at {measured_fps:.0f} FPS",
                    connection=True,
                    stream=True,
                    frames=True,
                    resolution=res_str,
                    fps=round(float(measured_fps), 1),
                    latency_ms=latency_ms,
                )
            else:
                return CameraTestResult(
                    success=False,
                    status="CAMERA ERROR",
                    message="Camera connected but failed to return valid image buffer.",
                    connection=True,
                    stream=True,
                    frames=False,
                    latency_ms=latency_ms,
                )
        except Exception as e:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            return CameraTestResult(
                success=False,
                status="CAMERA ERROR",
                message=f"Diagnostic error: {str(e)}",
                connection=False,
                stream=False,
                frames=False,
                latency_ms=latency_ms,
            )

    @classmethod
    def start_camera_worker(cls, camera_id: str, stream_url: str, name: str = "Camera") -> bool:
        """Starts a background RTSPStreamWorker for the given camera."""
        if camera_id in _active_camera_workers:
            return True

        worker = RTSPStreamWorker(
            camera_id=camera_id,
            stream_url=stream_url,
            name=name,
        )
        worker.start()
        _active_camera_workers[camera_id] = worker
        return True

    @classmethod
    def stop_camera_worker(cls, camera_id: str) -> bool:
        """Stops background RTSP worker."""
        if camera_id in _active_camera_workers:
            worker = _active_camera_workers.pop(camera_id)
            worker.stop()
            return True
        return False

    @classmethod
    def get_camera_worker(cls, camera_id: str) -> Optional[RTSPStreamWorker]:
        return _active_camera_workers.get(camera_id)

    @classmethod
    def _serialize_camera(cls, camera: Camera) -> CameraResponse:
        now = _utc_now()
        worker = _active_camera_workers.get(camera.id)

        # Calculate actual health state based on real frame reception and worker state
        last_frame = camera.last_frame_at or camera.last_heartbeat
        if last_frame:
            if last_frame.tzinfo is None:
                last_frame = last_frame.replace(tzinfo=timezone.utc)
            elapsed_sec = (now - last_frame).total_seconds()
        else:
            elapsed_sec = None

        if worker and worker.is_connected:
            computed_status = "STREAMING"
            is_conn = True
            live_fps = worker.fps
        elif elapsed_sec is not None and elapsed_sec <= 6.0:
            computed_status = "STREAMING"
            is_conn = True
            live_fps = float(camera.target_fps)
        elif elapsed_sec is not None and elapsed_sec <= 25.0:
            computed_status = "NO_FRAME"
            is_conn = True
            live_fps = 0.0
        elif camera.is_active:
            computed_status = camera.status if camera.status in ["CONNECTED", "RECONNECTING"] else "OFFLINE"
            is_conn = computed_status == "CONNECTED"
            live_fps = 0.0
        else:
            computed_status = "OFFLINE"
            is_conn = False
            live_fps = 0.0

        return CameraResponse(
            id=camera.id,
            name=camera.name,
            location=camera.location,
            source_type=camera.source_type,
            device_id=camera.device_id,
            stream_url=camera.stream_url,
            status=computed_status,
            is_active=camera.is_active,
            target_fps=camera.target_fps,
            resolution=camera.resolution,
            assigned_class=camera.assigned_class,
            detection_zone=camera.detection_zone,
            is_connected=is_conn,
            fps=round(live_fps, 1),
            seconds_since_last_frame=round(elapsed_sec, 1) if elapsed_sec is not None else None,
            last_heartbeat=camera.last_heartbeat,
            last_frame_at=camera.last_frame_at,
            created_at=camera.created_at,
            updated_at=camera.updated_at,
        )
