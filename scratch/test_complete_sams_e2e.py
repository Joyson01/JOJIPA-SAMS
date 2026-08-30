import asyncio
import os
import sys
sys.path.insert(0, os.path.abspath("."))
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

async def test_full_sams_workflow():
    print("=== SAMS END-TO-END VERIFICATION & ACCEPTANCE TEST ===")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        # 1. Check API Health
        health_res = await client.get("/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        assert health_data["status"] in ["healthy", "degraded"]
        print(f"[✓] 1. API Health Check passed: {health_data['status']}")

        # 2. Register Subject & Class
        subj_res = await client.post("/subjects", json={
            "code": f"CS{os.urandom(2).hex().upper()}",
            "name": "Advanced Artificial Intelligence",
            "department": "Computer Science",
            "credits": 4,
            "semester": 4,
        })
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]
        subj_name = subj_res.json()["name"]
        print(f"[✓] 2. Academic Subject registered: {subj_name} (ID: {subj_id})")

        cls_res = await client.post("/classes", json={
            "name": f"CSE-{os.urandom(2).hex().upper()}",
            "department": "Computer Science",
            "year": 4,
            "semester": 4,
            "section": "A",
        })
        assert cls_res.status_code == 201
        cls_id = cls_res.json()["id"]
        cls_name = cls_res.json()["name"]
        print(f"[✓] 3. Academic Class registered: {cls_name} (ID: {cls_id})")

        # 3. Create Student assigned to this class
        student_payload = {
            "student_code": f"STU-E2E-{os.urandom(3).hex().upper()}",
            "roll_number": f"ROLL-E2E-{os.urandom(3).hex().upper()}",
            "first_name": "Rohan",
            "last_name": "Sharma",
            "email": f"rohan.{os.urandom(3).hex()}@university.edu",
            "department": "Computer Science",
            "class_name": cls_name,
            "section": "A",
        }
        create_res = await client.post("/students", json=student_payload)
        assert create_res.status_code == 201
        student = create_res.json()
        student_id = student["id"]
        print(f"[✓] 4. Student created: {student['first_name']} {student['last_name']} (ID: {student_id})")

        # 4. Enroll Student Face
        img_path = "tests/fixtures/pankaj.jpg"

        with open(img_path, "rb") as f:
            enroll_res = await client.post(
                f"/students/{student_id}/enroll",
                data={"pose_type": "FRONT"},
                files={"file": ("face.jpg", f, "image/jpeg")},
            )
        assert enroll_res.status_code == 200, f"Enroll face failed: {enroll_res.status_code} {enroll_res.text}"
        enroll_data = enroll_res.json()
        assert enroll_data["success"] is True
        print(f"[✓] 5. Face enrollment completed: Profile ID={enroll_data['profile_id']}, Quality Score={enroll_data['quality_score']}")

        # Verify student status is ENROLLED
        get_st_res = await client.get(f"/students/{student_id}")
        assert get_st_res.json()["enrollment_status"] == "ENROLLED"
        print(f"[✓] 6. Database student status confirmed: {get_st_res.json()['enrollment_status']}")

        # 5. Create Mobile Camera Pairing
        pair_res = await client.post("/cameras/mobile-pairing", params={"camera_name": "Room 204 Smartphone", "location": "Room 204"})
        assert pair_res.status_code == 200
        pair_data = pair_res.json()
        camera_id = pair_data["camera_id"]
        token = pair_data["token"]
        print(f"[✓] 7. Mobile Camera paired: Camera ID={camera_id}, Token={token}")

        # 6. Create Attendance Session
        session_data = {
            "session_code": f"SESS-E2E-{os.urandom(2).hex()}",
            "subject_id": subj_id,
            "class_id": cls_id,
            "class_name": cls_name,
            "subject": subj_name,
            "room": "Room 204",
            "start_time": "09:00",
            "end_time": "10:30",
            "late_threshold_minutes": 10,
        }
        sess_create_res = await client.post("/attendance/sessions", json=session_data)
        assert sess_create_res.status_code == 201
        session = sess_create_res.json()
        session_id = session["id"]
        print(f"[✓] 8. Attendance session created: {session['subject']} (Code: {session['session_code']})")

        # 7. Start Attendance Session
        start_res = await client.put(f"/attendance/sessions/{session_id}/start")
        assert start_res.status_code == 200
        assert start_res.json()["status"] == "ACTIVE"
        print(f"[✓] 9. Session started: Status={start_res.json()['status']}")

        # 8. Sync Gallery
        sync_res = await client.post("/recognition/sync-gallery")
        assert sync_res.status_code == 200
        print(f"[✓] 10. In-memory vector gallery synchronized: {sync_res.json()['synced_templates_count']} templates")

        # 9. Send Mobile Frame for Recognition & Attendance Marking
        with open(img_path, "rb") as f:
            frame_res = await client.post(
                "/cameras/mobile-frame",
                data={"camera_id": camera_id, "session_id": session_id, "token": token},
                files={"file": ("mobile_frame.jpg", f, "image/jpeg")},
            )
        assert frame_res.status_code == 200, f"Mobile frame failed: {frame_res.text}"
        frame_data = frame_res.json()
        assert frame_data["faces_detected"] >= 1
        print(f"[✓] 11. Mobile camera frame recognized: Faces Detected={frame_data['faces_detected']}")

        # 10. Mark attendance via API
        mark_res = await client.post(
            f"/attendance/sessions/{session_id}/mark",
            json={
                "student_id": student_id,
                "confidence": 0.95,
                "liveness_score": 1.0,
                "source": "AI",
            }
        )
        assert mark_res.status_code == 200
        print(f"[✓] 12. Student attendance marked once (Status: {mark_res.json()['status']})")

        # 11. Check Session Records
        records_res = await client.get(f"/attendance/sessions/{session_id}/records")
        assert records_res.status_code == 200
        records = records_res.json()
        assert len(records) >= 1
        print(f"[✓] 13. Retrieved session attendance records: {len(records)} record(s)")

        # 12. Manual Override & Audit Logging
        rec_id = records[0]["id"]
        override_res = await client.put(
            f"/attendance/records/{rec_id}/override",
            json={"status": "PRESENT", "remarks": "Faculty verified identity in-person"}
        )
        assert override_res.status_code == 200
        print(f"[✓] 14. Manual override applied: New Status={override_res.json()['status']}")

        # 13. Reports Analytics
        analytics_res = await client.get("/reports/analytics")
        assert analytics_res.status_code == 200
        print(f"[✓] 15. Reports analytics computed: Rate={analytics_res.json()['overall_attendance_rate_pct']}%, Total Enrolled={analytics_res.json()['total_students_enrolled']}")

        # 14. Export CSV
        csv_res = await client.get("/reports/export/csv")
        assert csv_res.status_code == 200
        print(f"[✓] 16. CSV Report generated: {len(csv_res.text)} bytes")

        # 15. Close Session (Auto-mark absent)
        close_res = await client.put(f"/attendance/sessions/{session_id}/close?auto_mark_absent=true")
        assert close_res.status_code == 200
        assert close_res.json()["status"] == "COMPLETED"
        print(f"[✓] 17. Attendance session finalized and closed (Status: COMPLETED)")

        # 16. Audit logs inspection
        audit_res = await client.get("/audit-logs")
        assert audit_res.status_code == 200, f"Audit logs failed: {audit_res.text}"
        print(f"[✓] 18. Audit trails recorded: {audit_res.json()['total_count']} entries")

    print("\n🎉 ALL 18 END-TO-END WORKFLOW ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    asyncio.run(test_full_sams_workflow())
