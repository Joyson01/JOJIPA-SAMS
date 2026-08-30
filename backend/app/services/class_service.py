from typing import List, Optional
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import ClassSection, ClassSubject, Student, Subject, TimetableEntry
from backend.app.schemas.class_section import (
    ClassSectionCreate,
    ClassSectionResponse,
    ClassSectionUpdate,
)
from backend.app.schemas.timetable import TimetableEntryCreate, TimetableEntryResponse


class ClassNotFoundError(SAMSException):
    def __init__(self, class_id: str):
        super().__init__(
            status_code=404,
            error_code="CLASS_NOT_FOUND",
            message=f"Class with ID '{class_id}' was not found.",
            details={"class_id": class_id},
        )


class ClassAlreadyExistsError(SAMSException):
    def __init__(self, name: str):
        super().__init__(
            status_code=409,
            error_code="CLASS_ALREADY_EXISTS",
            message=f"Class with name '{name}' already exists.",
            details={"name": name},
        )


class ClassService:
    """Service layer managing academic classes / batches / sections and timetable schedules."""

    @classmethod
    async def create_class(cls, db: AsyncSession, class_in: ClassSectionCreate) -> ClassSectionResponse:
        """Creates a new academic class section."""
        q = select(ClassSection).where(ClassSection.name == class_in.name)
        existing = (await db.execute(q)).scalars().first()
        if existing:
            raise ClassAlreadyExistsError(class_in.name)

        class_sec = ClassSection(
            name=class_in.name,
            department=class_in.department,
            effective_from=class_in.effective_from or "15/06/2026",
            year=class_in.year,
            semester=class_in.semester,
            section=class_in.section,
            academic_year=class_in.academic_year,
            status=class_in.status.upper(),
        )
        db.add(class_sec)
        await db.commit()
        await db.refresh(class_sec)

        # Assign subjects if provided
        if class_in.assigned_subject_ids:
            for s_id in class_in.assigned_subject_ids:
                link = ClassSubject(class_id=class_sec.id, subject_id=s_id)
                db.add(link)
            await db.commit()

        logger.info(f"Created class '{class_sec.name}' ({class_sec.id})")
        return await cls._serialize_class(db, class_sec)

    @classmethod
    async def get_class_by_id(cls, db: AsyncSession, class_id: str) -> ClassSectionResponse:
        """Retrieves a single class section by ID."""
        cls_obj = await db.get(ClassSection, class_id)
        if not cls_obj:
            raise ClassNotFoundError(class_id)
        return await cls._serialize_class(db, cls_obj)

    @classmethod
    async def list_classes(
        cls,
        db: AsyncSession,
        department: Optional[str] = None,
        semester: Optional[int] = None,
        status: Optional[str] = None,
    ) -> List[ClassSectionResponse]:
        """Lists registered class sections."""
        query = select(ClassSection)
        filters = []
        if department:
            filters.append(ClassSection.department.ilike(f"%{department}%"))
        if semester:
            filters.append(ClassSection.semester == semester)
        if status:
            filters.append(ClassSection.status == status.upper())

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(ClassSection.name.asc())
        result = await db.execute(query)
        classes = result.scalars().all()

        responses = []
        for c in classes:
            resp = await cls._serialize_class(db, c)
            responses.append(resp)
        return responses

    @classmethod
    async def update_class(cls, db: AsyncSession, class_id: str, update_in: ClassSectionUpdate) -> ClassSectionResponse:
        """Updates class section settings."""
        cls_obj = await db.get(ClassSection, class_id)
        if not cls_obj:
            raise ClassNotFoundError(class_id)

        update_dict = update_in.model_dump(exclude_unset=True)
        assigned_subject_ids = update_dict.pop("assigned_subject_ids", None)

        for field, value in update_dict.items():
            if field == "status" and value:
                value = value.upper()
            setattr(cls_obj, field, value)

        if assigned_subject_ids is not None:
            del_q = select(ClassSubject).where(ClassSubject.class_id == class_id)
            existing_links = (await db.execute(del_q)).scalars().all()
            for l in existing_links:
                await db.delete(l)

            for s_id in assigned_subject_ids:
                link = ClassSubject(class_id=class_id, subject_id=s_id)
                db.add(link)

        await db.commit()
        await db.refresh(cls_obj)
        logger.info(f"Updated class '{cls_obj.name}' (ID: {cls_obj.id})")
        return await cls._serialize_class(db, cls_obj)

    @classmethod
    async def delete_class(cls, db: AsyncSession, class_id: str) -> bool:
        """Deletes a class section."""
        cls_obj = await db.get(ClassSection, class_id)
        if not cls_obj:
            raise ClassNotFoundError(class_id)

        await db.delete(cls_obj)
        await db.commit()
        logger.info(f"Deleted class '{cls_obj.name}' (ID: {class_id})")
        return True

    @classmethod
    async def list_timetable_entries(cls, db: AsyncSession, class_id: Optional[str] = None, day_of_week: Optional[str] = None) -> List[TimetableEntryResponse]:
        """Lists timetable schedule entries for a class or day."""
        query = select(TimetableEntry)
        filters = []
        if class_id:
            filters.append(TimetableEntry.class_id == class_id)
        if day_of_week:
            filters.append(TimetableEntry.day_of_week.ilike(day_of_week))

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(TimetableEntry.day_of_week.asc(), TimetableEntry.start_time.asc())
        result = await db.execute(query)
        entries = result.scalars().all()

        responses = []
        for e in entries:
            class_name = None
            if e.class_id:
                c = await db.get(ClassSection, e.class_id)
                if c:
                    class_name = c.name

            subj_code = None
            subj_name = None
            if e.subject_id:
                s = await db.get(Subject, e.subject_id)
                if s:
                    subj_code = s.code
                    subj_name = s.name

            responses.append(
                TimetableEntryResponse(
                    id=e.id,
                    class_id=e.class_id,
                    class_name=class_name,
                    subject_id=e.subject_id,
                    subject_code=subj_code,
                    subject_name=subj_name,
                    day_of_week=e.day_of_week,
                    start_time=e.start_time,
                    end_time=e.end_time,
                    entry_type=e.entry_type,
                    label=e.label,
                    batch=e.batch,
                    room=e.room,
                    effective_from=e.effective_from,
                    status=e.status,
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
            )
        return responses

    @classmethod
    async def create_timetable_entry(cls, db: AsyncSession, entry_in: TimetableEntryCreate) -> TimetableEntryResponse:
        """Creates a new timetable schedule slot."""
        entry = TimetableEntry(
            class_id=entry_in.class_id,
            subject_id=entry_in.subject_id,
            day_of_week=entry_in.day_of_week,
            start_time=entry_in.start_time,
            end_time=entry_in.end_time,
            entry_type=entry_in.entry_type.upper(),
            label=entry_in.label,
            batch=entry_in.batch,
            room=entry_in.room,
            effective_from=entry_in.effective_from or "15/06/2026",
            status=entry_in.status.upper(),
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)

        return (await cls.list_timetable_entries(db, class_id=entry.class_id, day_of_week=entry.day_of_week))[0]

    @staticmethod
    async def _serialize_class(db: AsyncSession, class_obj: ClassSection) -> ClassSectionResponse:
        students_q = select(func.count(Student.id)).where(Student.class_name == class_obj.name)
        student_count = (await db.execute(students_q)).scalar_one()

        # Fetch assigned subjects count & total credits
        subjects_q = (
            select(Subject)
            .join(ClassSubject, ClassSubject.subject_id == Subject.id)
            .where(ClassSubject.class_id == class_obj.id)
        )
        assigned_subjects = (await db.execute(subjects_q)).scalars().all()
        subject_count = len(assigned_subjects)
        total_credits = sum(s.credits for s in assigned_subjects)

        return ClassSectionResponse(
            id=class_obj.id,
            name=class_obj.name,
            department=class_obj.department,
            effective_from=class_obj.effective_from or "15/06/2026",
            year=class_obj.year,
            semester=class_obj.semester,
            section=class_obj.section,
            academic_year=class_obj.academic_year,
            status=class_obj.status,
            student_count=student_count,
            subject_count=subject_count,
            total_curriculum_credits=total_credits,
            created_at=class_obj.created_at,
            updated_at=class_obj.updated_at,
        )

