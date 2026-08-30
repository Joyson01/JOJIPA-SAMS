from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import (
    RecordNotFoundError,
    SAMSException,
    SessionAlreadyExistsError,
    SessionNotActiveError,
    SessionNotFoundError,
    StudentNotFoundError,
)
from backend.app.core.logging import logger
from backend.app.models.entities import AttendanceRecord, AttendanceSession, AuditLog, Student
from backend.app.schemas.attendance import (
    AttendanceMarkPayload,
    AttendanceOverridePayload,
    AttendanceRecordResponse,
    SessionCreate,
    SessionResponse,
    SessionUpdate,
    StudentAttendanceSummary,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AttendanceService:
    """Service layer managing attendance sessions, deduplication engine, and manual correction audit trails."""

    @classmethod
    async def create_session(cls, db: AsyncSession, session_in: SessionCreate, creator_user_id: Optional[str] = None) -> AttendanceSession:
        """Creates a new scheduled attendance session."""
        # Check duplicate session code
        existing = await db.execute(select(AttendanceSession).where(AttendanceSession.session_code == session_in.session_code))
        if existing.scalars().first() is not None:
            raise SessionAlreadyExistsError(session_in.session_code)

        session = AttendanceSession(
            session_code=session_in.session_code,
            class_name=session_in.class_name,
            subject=session_in.subject,
            room=session_in.room,
            scheduled_date=session_in.scheduled_date or date.today(),
            start_time=session_in.start_time,
            end_time=session_in.end_time,
            status="SCHEDULED",
            camera_ids=session_in.camera_ids,
            created_by_user_id=creator_user_id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        logger.info(f"Created attendance session: {session.session_code} for {session.class_name} ({session.subject})")
        return session

    @classmethod
    async def get_session_by_id(cls, db: AsyncSession, session_id: str) -> SessionResponse:
        """Retrieves single session with aggregated attendance counts."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        # Compute attendance stats
        stats_q = (
            select(
                AttendanceRecord.status,
                func.count(AttendanceRecord.id),
            )
            .where(AttendanceRecord.session_id == session_id)
            .group_by(AttendanceRecord.status)
        )
        stats_res = await db.execute(stats_q)
        counts = {status_name: cnt for status_name, cnt in stats_res.all()}

        present_cnt = counts.get("PRESENT", 0) + counts.get("MANUAL_PRESENT", 0)
        late_cnt = counts.get("LATE", 0)
        absent_cnt = counts.get("ABSENT", 0) + counts.get("MANUAL_ABSENT", 0)
        total_cnt = sum(counts.values())

        return SessionResponse(
            id=session.id,
            session_code=session.session_code,
            class_name=session.class_name,
            subject=session.subject,
            room=session.room,
            scheduled_date=session.scheduled_date,
            start_time=session.start_time,
            end_time=session.end_time,
            status=session.status,
            camera_ids=session.camera_ids or [],
            total_records=total_cnt,
            present_count=present_cnt,
            late_count=late_cnt,
            absent_count=absent_cnt,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    @classmethod
    async def list_sessions(
        cls,
        db: AsyncSession,
        class_name: Optional[str] = None,
        subject: Optional[str] = None,
        status: Optional[str] = None,
        scheduled_date: Optional[date] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[SessionResponse], int]:
        """Lists attendance sessions with filtering and pagination."""
        query = select(AttendanceSession)
        filters = []

        if class_name:
            filters.append(AttendanceSession.class_name == class_name)
        if subject:
            filters.append(AttendanceSession.subject.ilike(f"%{subject}%"))
        if status:
            filters.append(AttendanceSession.status == status.upper())
        if scheduled_date:
            filters.append(AttendanceSession.scheduled_date == scheduled_date)

        if filters:
            query = query.where(and_(*filters))

        count_query = select(func.count(AttendanceSession.id))
        if filters:
            count_query = count_query.where(and_(*filters))
        total_count = (await db.execute(count_query)).scalar_one()

        query = query.order_by(AttendanceSession.scheduled_date.desc(), AttendanceSession.start_time.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        sessions = result.scalars().all()

        responses = []
        for s in sessions:
            resp = await cls.get_session_by_id(db, s.id)
            responses.append(resp)

        return responses, total_count

    @classmethod
    async def start_session(cls, db: AsyncSession, session_id: str) -> SessionResponse:
        """Starts an attendance session, setting its status to ACTIVE."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        session.status = "ACTIVE"
        await db.commit()
        await db.refresh(session)
        logger.info(f"Started attendance session: {session.session_code}")
        return await cls.get_session_by_id(db, session_id)

    @classmethod
    async def close_session(cls, db: AsyncSession, session_id: str, auto_mark_absent: bool = True) -> SessionResponse:
        """Closes an attendance session (COMPLETED) and optionally marks remaining enrolled students as ABSENT."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        session.status = "COMPLETED"

        if auto_mark_absent:
            # Query all active students enrolled in this class
            students_q = select(Student).where(
                and_(
                    Student.class_name == session.class_name,
                    Student.status == "ACTIVE",
                )
            )
            students_res = await db.execute(students_q)
            class_students = students_res.scalars().all()

            # Query student IDs who already have records
            existing_records_q = select(AttendanceRecord.student_id).where(AttendanceRecord.session_id == session_id)
            existing_res = await db.execute(existing_records_q)
            marked_student_ids = set(existing_res.scalars().all())

            # Auto-mark unrecorded students as ABSENT
            for st in class_students:
                if st.id not in marked_student_ids:
                    absent_record = AttendanceRecord(
                        session_id=session_id,
                        student_id=st.id,
                        status="ABSENT",
                        confidence=0.0,
                        liveness_score=0.0,
                        verification_metadata={"source": "AUTO_ABSENT_ON_CLOSE"},
                        remarks="Absent (Not detected during session)",
                    )
                    db.add(absent_record)

        await db.commit()
        await db.refresh(session)
        logger.info(f"Closed attendance session: {session.session_code}")
        return await cls.get_session_by_id(db, session_id)

    @classmethod
    async def mark_attendance(
        cls,
        db: AsyncSession,
        session_id: str,
        payload: AttendanceMarkPayload,
        grace_minutes: int = 15,
    ) -> AttendanceRecordResponse:
        """Marks attendance ONCE per student+session with strict 3-level duplicate protection and presence tracking."""
        from sqlalchemy.exc import IntegrityError
        from backend.app.services.presence_service import presence_manager, PresenceState

        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        if session.status != "ACTIVE":
            raise SessionNotActiveError(session_id, session.status)

        student = await db.get(Student, payload.student_id)
        if not student:
            raise StudentNotFoundError(payload.student_id)

        now = _utc_now()

        # Update in-memory Presence Manager
        presence_state, is_first_verified = presence_manager.observe_student(
            session_id=session_id,
            student=student,
            confidence=payload.confidence,
            camera_id=payload.camera_id,
        )

        # Level 1 Duplicate Check: Query existing record for this (session, student)
        query = (
            select(AttendanceRecord)
            .where(
                and_(
                    AttendanceRecord.session_id == session_id,
                    AttendanceRecord.student_id == payload.student_id,
                )
            )
            .options(selectinload(AttendanceRecord.student))
        )
        existing = (await db.execute(query)).scalars().first()

        if existing:
            # Student is already marked! Update presence tracking metadata only (last_seen, max confidence)
            existing.last_seen = now
            if payload.confidence > existing.confidence:
                existing.confidence = payload.confidence
            if payload.track_id:
                existing.track_id = payload.track_id
            if payload.camera_id:
                existing.camera_id = payload.camera_id

            await db.commit()
            await db.refresh(existing)
            logger.info(f"[PRESENCE TRACKING] Updated last_seen for {student.student_code} ({presence_state})")
            return cls._serialize_record(existing, student)

        # Determine if arrival is PRESENT vs LATE based on start_time
        assigned_status = "PRESENT"
        scheduled_start = datetime.combine(session.scheduled_date, session.start_time, tzinfo=timezone.utc)
        if now > (scheduled_start + timedelta(minutes=grace_minutes)):
            assigned_status = "LATE"

        # Level 2 & 3: Atomic insertion with unique constraint fallback
        try:
            new_record = AttendanceRecord(
                session_id=session_id,
                student_id=payload.student_id,
                status=assigned_status,
                first_seen=now,
                last_seen=now,
                confidence=payload.confidence,
                track_id=payload.track_id,
                camera_id=payload.camera_id,
                liveness_score=payload.liveness_score,
                verification_metadata=payload.verification_metadata,
                remarks=payload.remarks or f"Marked via {assigned_status}",
            )
            db.add(new_record)
            await db.commit()
            await db.refresh(new_record)

            logger.info(f"[FIRST VERIFIED] Marked attendance ONCE: {student.student_code} ({student.first_name} {student.last_name}) as {assigned_status}")
            return cls._serialize_record(new_record, student)
        except IntegrityError:
            # Concurrent duplicate caught by database unique constraint
            await db.rollback()
            existing_after_race = (await db.execute(query)).scalars().first()
            if existing_after_race:
                existing_after_race.last_seen = now
                await db.commit()
                return cls._serialize_record(existing_after_race, student)
            raise

    @classmethod
    async def override_record(
        cls,
        db: AsyncSession,
        record_id: str,
        override_in: AttendanceOverridePayload,
        user_id: Optional[str] = None,
    ) -> AttendanceRecordResponse:
        """Manually corrects attendance record with comprehensive audit trail logging."""
        record = await db.get(AttendanceRecord, record_id)
        if not record:
            raise RecordNotFoundError(record_id)

        student = await db.get(Student, record.student_id)
        if not student:
            raise SAMSException("Student associated with this record not found.", status_code=404)

        old_status = record.status
        new_status = override_in.status

        # Update record
        record.status = new_status
        record.remarks = f"Manual override: {override_in.remarks}"
        record.marked_by_user_id = user_id or override_in.modified_by_user_id
        record.updated_at = _utc_now()

        # Create Audit Log Entry
        audit = AuditLog(
            user_id=user_id or override_in.modified_by_user_id,
            action="MANUAL_OVERRIDE",
            entity_type="AttendanceRecord",
            entity_id=record_id,
            old_values={"status": old_status},
            new_values={"status": new_status, "remarks": override_in.remarks},
        )
        db.add(audit)

        await db.commit()
        await db.refresh(record)
        logger.info(f"Manual override for record {record_id}: {old_status} -> {new_status} ({override_in.remarks})")
        return cls._serialize_record(record, student)

    @classmethod
    async def get_session_records(
        cls,
        db: AsyncSession,
        session_id: str,
        status: Optional[str] = None,
    ) -> List[AttendanceRecordResponse]:
        """Retrieves all attendance records for a session."""
        session = await db.get(AttendanceSession, session_id)
        if not session:
            raise SessionNotFoundError(session_id)

        query = (
            select(AttendanceRecord)
            .where(AttendanceRecord.session_id == session_id)
            .options(selectinload(AttendanceRecord.student))
        )
        if status:
            query = query.where(AttendanceRecord.status == status.upper())

        query = query.order_by(AttendanceRecord.first_seen.asc())
        records = (await db.execute(query)).scalars().all()

        return [cls._serialize_record(r, r.student) for r in records]

    @classmethod
    async def get_student_attendance_history(
        cls,
        db: AsyncSession,
        student_id: str,
    ) -> StudentAttendanceSummary:
        """Retrieves historical attendance analytics for a student."""
        student = await db.get(Student, student_id)
        if not student:
            raise SAMSException(f"Student with ID '{student_id}' does not exist.", status_code=404)

        query = (
            select(AttendanceRecord)
            .where(AttendanceRecord.student_id == student_id)
            .order_by(AttendanceRecord.first_seen.desc())
        )
        records = (await db.execute(query)).scalars().all()

        total = len(records)
        present = sum(1 for r in records if r.status in ["PRESENT", "MANUAL_PRESENT"])
        late = sum(1 for r in records if r.status == "LATE")
        absent = sum(1 for r in records if r.status in ["ABSENT", "MANUAL_ABSENT"])
        rate = round((present + late) / total * 100.0, 1) if total > 0 else 0.0

        record_responses = [cls._serialize_record(r, student) for r in records]

        return StudentAttendanceSummary(
            student_id=student_id,
            total_sessions=total,
            present_sessions=present,
            late_sessions=late,
            absent_sessions=absent,
            attendance_rate_pct=rate,
            records=record_responses,
        )

    @staticmethod
    def _serialize_record(record: AttendanceRecord, student: Student) -> AttendanceRecordResponse:
        return AttendanceRecordResponse(
            id=record.id,
            session_id=record.session_id,
            student_id=record.student_id,
            student_name=f"{student.first_name} {student.last_name}" if student else "Unknown",
            student_code=student.student_code if student else "N/A",
            roll_number=student.roll_number if student else "N/A",
            status=record.status,
            confidence=record.confidence,
            first_seen=record.first_seen,
            last_seen=record.last_seen,
            track_id=record.track_id,
            liveness_score=record.liveness_score,
            remarks=record.remarks,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

