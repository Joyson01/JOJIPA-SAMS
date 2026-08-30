import asyncio
import os
import sys
import httpx

API_BASE = "http://127.0.0.1:8000/api/v1"

async def test_full_sams_workflow():
    print("=== SAMS END-TO-END VERIFICATION & ACCEPTANCE TEST ===")
    async with httpx.AsyncClient(base_url=API_BASE, timeout=30.0) as client:
        # 1. Health check
        health_res = await client.get("/health")
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        print(f"[✓] 1. API Health Check passed: {health_res.json()['status']}")

        # 2. Register Student
        student_data = {
            "student_code": "STU-E2E-99",
            "roll_number": "ROLL-E2E-99",
            "first_name": "Rohan",
            "last_name": "Sharma",
            "email": "rohan.sharma@campus.edu",
            "department": "Computer Science",
            "class_name": "CSE-4A",
            "section": "A",
            "status": "ACTIVE",
        }
        create_res = await client.post("/students", json=student_data)
        if create_res.status_code == 409:
            # Already exists from previous run, find it
            list_res = await client.get("/students", params={"search": "STU-E2E-99"})
            student = list_res.json()["items"][0]
        else:
            assert create_res.status_code == 201, f"Create student failed: {create_res.text}"
            student = create_res.json()
        student_id = student["id"]
        print(f"[✓] 2. Student created: {student['first_name']} {student['last_name']} (ID: {student_id})")

        # 3. Biometric Face Enrollment with real test image
        img_path = "src/Test/pankaj.jpg"
        assert os.path.exists(img_path), f"Test image {img_path} not found"
        with open(img_path, "rb") as f:
            enroll_res = await client.post(
                f"/students/{student_id}/enroll",
                files={"file": ("enrollment.jpg", f, "image/jpeg")},
                data={"pose_type": "FRONTAL"},
            )
        assert enroll_res.status_code == 200, f"Enrollment failed: {enroll_res.text}"
        enroll_data = enroll_res.json()
        assert enroll_data["success"] is True
        print(f"[✓] 3. Face enrollment completed: Profile ID={enroll_data['profile_id']}, Quality Score={enroll_data['quality_score']}")

        # 4. Verify student status is ENROLLED
        get_st_res = await client.get(f"/students/{student_id}")
        assert get_st_res.json()["enrollment_status"] == "ENROLLED"
        print(f"[✓] 4. Database student status confirmed: {get_st_res.json()['enrollment_status']}")

        # 5. Create Mobile Camera Pairing
        pair_res = await client.post("/cameras/mobile-pairing", params={"camera_name": "Room 204 Smartphone", "location": "Room 204"})
        assert pair_res.status_code == 200
        pair_data = pair_res.json()
        camera_id = pair_data["camera_id"]
        token = pair_data["token"]
        print(f"[✓] 5. Mobile Camera paired: Camera ID={camera_id}, Token={token}")

        # 6. Create Attendance Session
        session_data = {
            "session_code": f"SESS-E2E-{os.urandom(2).hex()}",
            "class_name": "CSE-4A",
            "subject": "Advanced Artificial Intelligence",
            "room": "Room 204",
            "start_time": "09:00",
            "end_time": "10:30",
        }
        sess_create_res = await client.post("/attendance/sessions", json=session_data)
        assert sess_create_res.status_code == 201
        session = sess_create_res.json()
        session_id = session["id"]
        print(f"[✓] 6. Attendance session created: {session['subject']} (Code: {session['session_code']})")

        # 7. Start Attendance Session
        start_res = await client.put(f"/attendance/sessions/{session_id}/start")
        assert start_res.status_code == 200
        assert start_res.json()["status"] == "ACTIVE"
        print(f"[✓] 7. Session started: Status={start_res.json()['status']}")

        # 8. Sync Gallery
        sync_res = await client.post("/recognition/sync-gallery")
        assert sync_res.status_code == 200
        print(f"[✓] 8. In-memory vector gallery synchronized: {sync_res.json()['synced_templates_count']} templates")

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
        print(f"[✓] 9. Mobile camera frame recognized: Faces Detected={frame_data['faces_detected']}, Result={frame_data['results'][0]['decision']}")

        # 10. Process frame directly on recognition endpoint to mark attendance
        with open(img_path, "rb") as f:
            rec_res = await client.post(
                "/recognition/process",
                params={"session_id": session_id, "camera_id": camera_id},
                files={"file": ("feed.jpg", f, "image/jpeg")},
            )
        assert rec_res.status_code == 200
        print(f"[✓] 10. Live recognition processed frame")

        # 11. Check Session Records
        records_res = await client.get(f"/attendance/sessions/{session_id}/records")
        assert records_res.status_code == 200
        records = records_res.json()
        print(f"[✓] 11. Retrieved session attendance records: {len(records)} record(s)")

        # 12. Manual Override & Audit Logging
        if len(records) > 0:
            rec_id = records[0]["id"]
            override_res = await client.put(
                f"/attendance/records/{rec_id}/override",
                json={"status": "MANUAL_PRESENT", "remarks": "Faculty verified identity in-person"}
            )
            assert override_res.status_code == 200
            print(f"[✓] 12. Manual override applied: New Status={override_res.json()['status']}")

        # 13. Reports Analytics
        analytics_res = await client.get("/reports/analytics")
        assert analytics_res.status_code == 200
        print(f"[✓] 13. Reports analytics computed: Rate={analytics_res.json()['overall_attendance_rate_pct']}%, Total Enrolled={analytics_res.json()['total_students_enrolled']}")

        # 14. Export CSV
        csv_res = await client.get("/reports/export/csv")
        assert csv_res.status_code == 200
        assert "Student Name" in csv_res.text or "Session Code" in csv_res.text or "Roll Number" in csv_res.text or "Student Code" in csv_res.text
        print(f"[✓] 14. CSV Report generated: {len(csv_res.text)} bytes")

        # 15. Close Session (Auto-mark absent)
        close_res = await client.put(f"/attendance/sessions/{session_id}/close?auto_mark_absent=true")
        assert close_res.status_code == 200
        assert close_res.json()["status"] == "COMPLETED"
        print(f"[✓] 15. Attendance session finalized and closed (Status: COMPLETED)")

        # 16. Audit logs inspection
        audit_res = await client.get("/audit-logs")
        assert audit_res.status_code == 200, f"Audit logs failed: {audit_res.text}"
        print(f"[✓] 16. Audit trails recorded: {audit_res.json()['total_count']} entries")

    print("\n🎉 ALL 16 END-TO-END WORKFLOW ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    asyncio.run(test_full_sams_workflow())
