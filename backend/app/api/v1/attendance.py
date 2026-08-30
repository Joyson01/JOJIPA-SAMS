from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    AttendanceRecordResponse,
    BatchAttendanceMarkPayload,
    SessionCreate,
    SessionResponse,
    SessionUpdate,
    StudentAttendanceSummary,
)
from backend.app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/attendance", tags=["Attendance Management"])


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Attendance Session",
    description="Creates a new scheduled attendance session for a class and subject.",
)
async def create_session(
    session_in: SessionCreate,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await AttendanceService.create_session(db, session_in)
    return await AttendanceService.get_session_by_id(db, session.id)


@router.get(
    "/sessions",
    response_model=List[SessionResponse],
    summary="List Attendance Sessions",
    description="Retrieves attendance sessions with optional filtering by class, subject, status, or date.",
)
async def list_sessions(
    class_name: Optional[str] = Query(None, description="Filter by class/batch"),
    subject: Optional[str] = Query(None, description="Filter by subject"),
    subject_id: Optional[str] = Query(None, description="Filter by subject ID"),
    status: Optional[str] = Query(None, description="Filter by status (SCHEDULED, ACTIVE, COMPLETED, CANCELLED)"),
    scheduled_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[SessionResponse]:
    sessions, _ = await AttendanceService.list_sessions(
        db=db,
        class_name=class_name,
        subject=subject,
        subject_id=subject_id,
        status=status,
        scheduled_date=scheduled_date,
        page=page,
        page_size=page_size,
    )
    return sessions


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get Session Details",
    description="Retrieves session details along with current aggregate attendance metrics.",
)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return await AttendanceService.get_session_by_id(db, session_id)


@router.put(
    "/sessions/{session_id}/start",
    response_model=SessionResponse,
    summary="Start Session",
    description="Activates an attendance session, opening it for live recognition and marking.",
)
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return await AttendanceService.start_session(db, session_id)


@router.put(
    "/sessions/{session_id}/close",
    response_model=SessionResponse,
    summary="Close Session & Mark Absentees",
    description="Completes an attendance session and auto-marks all remaining enrolled students in that class as ABSENT.",
)
async def close_session(
    session_id: str,
    auto_mark_absent: bool = Query(True, description="Whether to automatically populate ABSENT records for unverified class students"),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return await AttendanceService.close_session(db, session_id, auto_mark_absent=auto_mark_absent)


@router.post(
    "/sessions/{session_id}/mark",
    response_model=AttendanceRecordResponse,
    summary="Mark Student Attendance",
    description="Marks attendance for a student with deduplication protection (updating timestamps on subsequent sightings).",
)
async def mark_attendance(
    session_id: str,
    payload: AttendanceMarkPayload,
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.mark_attendance(db, session_id, payload)


@router.post(
    "/sessions/{session_id}/batch-mark",
    response_model=List[AttendanceRecordResponse],
    summary="Batch Mark Attendance",
    description="Atomically marks attendance for multiple verified student tracks.",
)
async def batch_mark_attendance(
    session_id: str,
    payload: BatchAttendanceMarkPayload,
    db: AsyncSession = Depends(get_db),
) -> List[AttendanceRecordResponse]:
    results = []
    for item in payload.records:
        rec = await AttendanceService.mark_attendance(db, session_id, item)
        results.append(rec)
    return results


@router.get(
    "/sessions/{session_id}/records",
    response_model=List[AttendanceRecordResponse],
    summary="Get Session Attendance Records",
    description="Lists all marked attendance records for a specific session.",
)
async def get_session_records(
    session_id: str,
    status: Optional[str] = Query(None, description="Filter by status (PRESENT, LATE, ABSENT, MANUAL_PRESENT, MANUAL_ABSENT)"),
    db: AsyncSession = Depends(get_db),
) -> List[AttendanceRecordResponse]:
    return await AttendanceService.get_session_records(db, session_id, status=status)


@router.post(
    "/manual",
    response_model=AttendanceRecordResponse,
    summary="Record Manual Attendance or Excused Absence",
    description="Directly marks a student attendance status manually (e.g. EXCUSED with reason or manual roll call).",
)
async def mark_manual_attendance(
    session_id: str = Query(..., description="Session ID"),
    student_id: str = Query(..., description="Student ID"),
    status: str = Query("PRESENT", description="Status (PRESENT, ABSENT, LATE, EXCUSED)"),
    remarks: str = Query("Manual Attendance", description="Optional remarks or leave reason"),
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.mark_manual_attendance(
        db=db,
        session_id=session_id,
        student_id=student_id,
        status=status,
        remarks=remarks,
    )


@router.put(
    "/records/{record_id}/override",
    response_model=AttendanceRecordResponse,
    summary="Manual Attendance Override",
    description="Manually modifies an attendance record status and logs the modification with an audit trail note.",
)
async def override_record(
    record_id: str,
    override_in: AttendanceOverridePayload,
    db: AsyncSession = Depends(get_db),
) -> AttendanceRecordResponse:
    return await AttendanceService.override_record(db, record_id, override_in)


@router.get(
    "/sessions/{session_id}/presence",
    summary="Get Live Presence Status for Session",
    description="Returns real-time student visibility states (VISIBLE, TEMPORARILY_NOT_VISIBLE, NOT_CURRENTLY_VISIBLE) without altering attendance records.",
)
async def get_session_presence(
    session_id: str,
):
    from backend.app.services.presence_service import presence_manager
    return presence_manager.get_session_presence(session_id)


@router.get(
    "/students/{student_id}",
    response_model=StudentAttendanceSummary,
    summary="Get Student Attendance History",
    description="Retrieves a student's full attendance history and attendance percentage.",
)
async def get_student_attendance(
    student_id: str,
    db: AsyncSession = Depends(get_db),
):
    return await AttendanceService.get_student_attendance_history(db, student_id)

