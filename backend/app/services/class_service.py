from typing import List, Optional
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.exceptions import SAMSException
from backend.app.core.logging import logger
from backend.app.models.entities import ClassSection, Student
from backend.app.schemas.class_section import (
    ClassSectionCreate,
    ClassSectionResponse,
    ClassSectionUpdate,
)


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
    """Service layer managing academic classes / batches / sections."""

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
            year=class_in.year,
            semester=class_in.semester,
            section=class_in.section,
            academic_year=class_in.academic_year,
            status=class_in.status.upper(),
        )
        db.add(class_sec)
        await db.commit()
        await db.refresh(class_sec)
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
        for field, value in update_dict.items():
            if field == "status" and value:
                value = value.upper()
            setattr(cls_obj, field, value)

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

    @staticmethod
    async def _serialize_class(db: AsyncSession, class_obj: ClassSection) -> ClassSectionResponse:
        students_q = select(func.count(Student.id)).where(Student.class_name == class_obj.name)
        student_count = (await db.execute(students_q)).scalar_one()

        return ClassSectionResponse(
            id=class_obj.id,
            name=class_obj.name,
            department=class_obj.department,
            year=class_obj.year,
            semester=class_obj.semester,
            section=class_obj.section,
            academic_year=class_obj.academic_year,
            status=class_obj.status,
            student_count=student_count,
            created_at=class_obj.created_at,
            updated_at=class_obj.updated_at,
        )

