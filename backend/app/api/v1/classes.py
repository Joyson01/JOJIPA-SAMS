from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.schemas.class_section import (
    ClassSectionCreate,
    ClassSectionResponse,
    ClassSectionUpdate,
)
from backend.app.services.class_service import ClassService

router = APIRouter(prefix="/classes", tags=["Classes & Sections"])


@router.post(
    "",
    response_model=ClassSectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Class Section",
    description="Registers an academic class / section.",
)
async def create_class(
    class_in: ClassSectionCreate,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.create_class(db, class_in)


@router.get(
    "",
    response_model=List[ClassSectionResponse],
    summary="List Classes",
    description="Retrieves registered academic class sections.",
)
async def list_classes(
    department: Optional[str] = Query(None, description="Filter by department"),
    semester: Optional[int] = Query(None, description="Filter by semester"),
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, INACTIVE)"),
    db: AsyncSession = Depends(get_db),
) -> List[ClassSectionResponse]:
    return await ClassService.list_classes(
        db=db,
        department=department,
        semester=semester,
        status=status,
    )


@router.get(
    "/{class_id}",
    response_model=ClassSectionResponse,
    summary="Get Class Details",
)
async def get_class(
    class_id: str,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.get_class_by_id(db, class_id)


@router.put(
    "/{class_id}",
    response_model=ClassSectionResponse,
    summary="Update Class",
)
async def update_class(
    class_id: str,
    update_in: ClassSectionUpdate,
    db: AsyncSession = Depends(get_db),
) -> ClassSectionResponse:
    return await ClassService.update_class(db, class_id, update_in)


@router.delete(
    "/{class_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Class",
)
async def delete_class(
    class_id: str,
    db: AsyncSession = Depends(get_db),
):
    await ClassService.delete_class(db, class_id)
    return None

