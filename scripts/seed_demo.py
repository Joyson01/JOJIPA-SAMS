"""SAMS Database Demo Seeder Script

Usage:
    python -m scripts.seed_demo
"""

import asyncio
import os
import sys
from datetime import date, datetime, time, timedelta, timezone

sys.path.insert(0, os.path.abspath("."))

from backend.app.database.session import AsyncSessionLocal
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.camera import CameraCreate
from backend.app.schemas.class_section import ClassSectionCreate
from backend.app.schemas.student import StudentCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.camera_service import CameraService
from backend.app.services.class_service import ClassService
from backend.app.services.student_service import StudentService
from backend.app.services.subject_service import SubjectService


async def seed_demo_data():
    print("🌱 Starting SAMS Demo Data Seeding...")
    async with AsyncSessionLocal() as db:
        # 1. Create Academic Subjects
        print("Creating Subjects...")
        subjects_data = [
            SubjectCreate(
                code="CS401",
                name="Computer Networks",
                short_name="CN",
                department="Computer Science",
                credits=4,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS402",
                name="Artificial Intelligence & Neural Networks",
                short_name="AI",
                department="Computer Science",
                credits=4,
                semester=4,
                academic_year="2026-2027",
            ),
            SubjectCreate(
                code="CS403",
                name="Database Management Systems",
                short_name="DBMS",
                department="Computer Science",
                credits=3,
                semester=4,
                academic_year="2026-2027",
            ),
        ]
        created_subjects = []
        for s in subjects_data:
            try:
                subj = await SubjectService.create_subject(db, s)
                created_subjects.append(subj)
                print(f"  [+] Subject created: {subj.code} - {subj.name}")
            except Exception as e:
                print(f"  [!] Subject {s.code} might already exist: {e}")

        # 2. Create Class Sections
        print("\nCreating Class Sections...")
        classes_data = [
            ClassSectionCreate(
                name="CSE-4A",
                department="Computer Science",
                year=4,
                semester=4,
                section="A",
                academic_year="2026-2027",
            ),
            ClassSectionCreate(
                name="CSE-4B",
                department="Computer Science",
                year=4,
                semester=4,
                section="B",
                academic_year="2026-2027",
            ),
        ]
        created_classes = []
        for c in classes_data:
            try:
                cls_sec = await ClassService.create_class(db, c)
                created_classes.append(cls_sec)
                print(f"  [+] Class Section created: {cls_sec.name}")
            except Exception as e:
                print(f"  [!] Class {c.name} might already exist: {e}")

        # 3. Create Demo Students
        print("\nCreating Demo Students...")
        students_data = [
            StudentCreate(
                student_code="STU-2026-001",
                roll_number="CS2026-001",
                first_name="Aarav",
                last_name="Patel",
                email="aarav.patel@campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="STU-2026-002",
                roll_number="CS2026-002",
                first_name="Diya",
                last_name="Iyer",
                email="diya.iyer@campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="STU-2026-003",
                roll_number="CS2026-003",
                first_name="Kabir",
                last_name="Verma",
                email="kabir.verma@campus.edu",
                department="Computer Science",
                class_name="CSE-4A",
                section="A",
            ),
            StudentCreate(
                student_code="STU-2026-004",
                roll_number="CS2026-004",
                first_name="Ananya",
                last_name="Pandey",
                email="ananya.pandey@campus.edu",
                department="Computer Science",
                class_name="CSE-4B",
                section="B",
            ),
        ]
        for st in students_data:
            try:
                s_obj = await StudentService.create_student(db, st)
                print(f"  [+] Student created: {s_obj.first_name} {s_obj.last_name} ({s_obj.roll_number})")
            except Exception as e:
                print(f"  [!] Student {st.student_code} might already exist: {e}")

        # 4. Create Camera
        print("\nCreating Classroom Camera...")
        try:
            cam = await CameraService.create_camera(
                db,
                CameraCreate(
                    name="Room 204 Main Camera",
                    location="Room 204",
                    source_type="WEBCAM",
                    assigned_class="CSE-4A",
                ),
            )
            print(f"  [+] Camera registered: {cam.name}")
        except Exception as e:
            print(f"  [!] Camera might already exist: {e}")

    print("\n✅ SAMS Demo Seeding Completed Successfully!")


if __name__ == "__main__":
    asyncio.run(seed_demo_data())

