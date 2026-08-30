import asyncio
import json
import time
from typing import Dict, List, Optional
import cv2
import numpy as np
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.base import DecisionState
from ai_engine.pipeline.video_pipeline import VideoRecognitionPipeline
from backend.app.core.logging import logger
from backend.app.database.session import AsyncSessionLocal
from backend.app.schemas.attendance import AttendanceMarkPayload
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.recognition_service import RecognitionService, get_pipeline

router = APIRouter(prefix="/stream", tags=["Live Recognition Stream"])

# Active video pipelines per session/camera
_video_pipelines: Dict[str, VideoRecognitionPipeline] = {}
_pipeline_lock = asyncio.Lock()


async def get_or_create_video_pipeline(session_id: str) -> VideoRecognitionPipeline:
    """Retrieves or creates a stateful VideoRecognitionPipeline for a live session."""
    async with _pipeline_lock:
        if session_id not in _video_pipelines:
            pipeline = VideoRecognitionPipeline(detection_interval=2)
            # Sync enrolled students gallery safely
            try:
                async with AsyncSessionLocal() as db:
                    await RecognitionService.sync_gallery_from_db(db)
            except Exception as db_err:
                logger.warning(f"Could not auto-sync gallery from database: {db_err}")

            # Copy gallery to video pipeline
            single_pipe = get_pipeline()
            pipeline.load_gallery(single_pipe.matcher.templates)
            _video_pipelines[session_id] = pipeline
            logger.info(f"Initialized VideoRecognitionPipeline for session '{session_id}' with {pipeline.matcher.total_students} students.")
        return _video_pipelines[session_id]


@router.websocket("/ws/{session_id}")
async def websocket_live_stream(
    websocket: WebSocket,
    session_id: str,
):
    """Real-time bi-directional WebSocket streaming camera frames and returning bounding boxes, telemetry, and automated attendance marking."""
    await websocket.accept()
    logger.info(f"WebSocket client connected to live stream for session '{session_id}'")

    pipeline = await get_or_create_video_pipeline(session_id)
    marked_students_cache: set[str] = set()

    fps_count = 0
    fps_last_time = time.perf_counter()
    current_fps = 0.0

    try:
        while True:
            # Receive frame data (binary JPEG bytes or JSON message)
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                frame_bytes = message["bytes"]
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    if payload.get("type") == "reset":
                        pipeline.reset_tracking()
                        marked_students_cache.clear()
                        await websocket.send_json({"type": "reset_ack"})
                        continue
                    elif payload.get("type") == "sync_gallery":
                        try:
                            async with AsyncSessionLocal() as db:
                                await RecognitionService.sync_gallery_from_db(db)
                            single_pipe = get_pipeline()
                            pipeline.load_gallery(single_pipe.matcher.templates)
                            await websocket.send_json({"type": "sync_ack", "count": pipeline.matcher.total_students})
                        except Exception as e:
                            await websocket.send_json({"type": "sync_ack", "count": pipeline.matcher.total_students, "error": str(e)})
                        continue
                    else:
                        continue
                except Exception:
                    continue
            else:
                continue

            # Decode incoming JPEG frame
            np_arr = np.frombuffer(frame_bytes, np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if image is None:
                continue

            # Update live FPS tracker
            fps_count += 1
            now_time = time.perf_counter()
            if now_time - fps_last_time >= 1.0:
                current_fps = round(fps_count / (now_time - fps_last_time), 1)
                fps_count = 0
                fps_last_time = now_time

            # Run Video Recognition & Multi-Frame Temporal Verification
            results, latencies = pipeline.process_frame(image)

            face_telemetry = []
            newly_marked_events = []

            for r in results:
                is_marked = False

                # If face is CONFIRMED KNOWN and not marked in this run -> Auto-mark attendance!
                if (
                    r.is_confirmed
                    and r.decision == DecisionState.KNOWN
                    and r.confirmed_student_id
                    and session_id != "preview"
                ):
                    student_id = r.confirmed_student_id
                    if student_id not in marked_students_cache:
                        try:
                            async with AsyncSessionLocal() as db:
                                mark_res = await AttendanceService.mark_attendance(
                                    db=db,
                                    session_id=session_id,
                                    payload=AttendanceMarkPayload(
                                        student_id=student_id,
                                        confidence=r.average_similarity,
                                        track_id=r.track_id,
                                        liveness_score=r.liveness_score,
                                        remarks="Automated Live Stream Attendance",
                                    ),
                                )
                                marked_students_cache.add(student_id)
                                is_marked = True
                                newly_marked_events.append(
                                    {
                                        "student_id": student_id,
                                        "student_name": r.confirmed_name,
                                        "student_code": r.confirmed_code,
                                        "roll_number": r.confirmed_roll,
                                        "status": mark_res.status,
                                        "confidence": r.average_similarity,
                                        "time": mark_res.first_seen.isoformat(),
                                    }
                                )
                        except Exception as e:
                            logger.error(f"Error marking attendance for student {student_id}: {e}")
                    else:
                        is_marked = True

                face_telemetry.append(
                    {
                        "track_id": r.track_id,
                        "bbox": r.bbox.to_list(),
                        "state": r.state,
                        "decision": r.decision.value,
                        "is_confirmed": r.is_confirmed,
                        "student_id": r.confirmed_student_id,
                        "student_name": r.confirmed_name,
                        "student_code": r.confirmed_code,
                        "roll_number": r.confirmed_roll,
                        "similarity": round(r.average_similarity if r.is_confirmed else r.current_similarity, 3),
                        "is_live": r.is_live,
                        "liveness_score": round(r.liveness_score, 2),
                        "is_occluded": r.is_occluded,
                        "votes_count": r.votes_count,
                        "total_valid_frames": r.total_valid_frames,
                        "attendance_marked": is_marked,
                        "reason": r.decision_reason,
                    }
                )

            # Send telemetry JSON to client
            telemetry = {
                "type": "telemetry",
                "fps": current_fps,
                "latencies_ms": latencies,
                "faces_count": len(results),
                "faces": face_telemetry,
                "newly_marked": newly_marked_events,
            }
            await websocket.send_json(telemetry)

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected from session '{session_id}'")
    except Exception as exc:
        logger.error(f"WebSocket stream error for session '{session_id}': {exc}")

