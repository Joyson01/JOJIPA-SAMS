# RESTful API & WebSocket Specification

**Document Version:** 1.0.0  
**Phase:** Phase 0 (Interface Design & Contracts)  
**Status:** Approved API Specification

---

## 1. Global API Standards

- **Base URL:** `/api/v1`
- **Protocol:** HTTPS (HTTP/2) + WSS (WebSockets over TLS)
- **Data Format:** JSON (`application/json`) & Multipart Form Data (for image uploads)
- **Authentication:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- **Error Response Standard (RFC 7807 Problem Details):**

```json
{
  "status_code": 400,
  "error_code": "INVALID_FACE_SAMPLE",
  "message": "Face sample is too blurry (Laplacian variance 42.1 < threshold 65.0)",
  "details": {
    "sharpness": 42.1,
    "threshold": 65.0
  },
  "timestamp": "2026-08-30T10:00:00Z"
}
```

---

## 2. Authentication & User Management Endpoints

### 2.1 Login

- **Endpoint:** `POST /api/v1/auth/login`
- **Request Body:**

```json
{
  "username": "admin",
  "password": "SecurePassword123!"
}
```

- **Response (200 OK):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in_minutes": 480,
  "user": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "username": "admin",
    "email": "admin@campus.edu",
    "full_name": "System Administrator",
    "role": "ADMIN"
  }
}
```

### 2.2 Current User Profile

- **Endpoint:** `GET /api/v1/auth/me`
- **Response (200 OK):** Returns current user object with role and permissions.

---

## 3. Student Management Endpoints

### 3.1 List Students (Search, Filter, Pagination)

- **Endpoint:** `GET /api/v1/students?search=rahul&department=CSE&class_name=CSE-3A&enrollment_status=ENROLLED&page=1&limit=20`
- **Response (200 OK):**

```json
{
  "items": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "student_code": "STU-2026-042",
      "roll_number": "CSE-2026-42",
      "first_name": "Rahul",
      "last_name": "Sharma",
      "email": "rahul.sharma@campus.edu",
      "department": "Computer Science & Engineering",
      "class_name": "CSE-3A",
      "section": "A",
      "status": "ACTIVE",
      "enrollment_status": "ENROLLED",
      "sample_count": 8,
      "created_at": "2026-08-15T09:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

### 3.2 Create Student

- **Endpoint:** `POST /api/v1/students`
- **Request Body:**

```json
{
  "student_code": "STU-2026-043",
  "roll_number": "CSE-2026-43",
  "first_name": "Priya",
  "last_name": "Verma",
  "email": "priya.verma@campus.edu",
  "department": "Computer Science & Engineering",
  "class_name": "CSE-3A",
  "section": "A"
}
```

- **Response (201 Created):** Returns the created student object.

### 3.3 Get Student Details & Face History

- **Endpoint:** `GET /api/v1/students/{id}`
- **Response (200 OK):** Full student profile, enrolled face sample metadata, and recent attendance summaries.

---

## 4. Face Enrollment Endpoints (Mobile & Web)

### 4.1 Evaluate & Add Face Sample

- **Endpoint:** `POST /api/v1/students/{id}/enroll/sample`
- **Content-Type:** `multipart/form-data`
- **Parameters:**
  - `file`: Raw image file (JPEG/PNG)
  - `pose_type`: `FRONT` | `LEFT_15` | `RIGHT_15` | `TILT_UP` | `TILT_DOWN` | `GLASSES`
- **Response (200 OK - Sample Accepted):**

```json
{
  "status": "ACCEPTED",
  "quality_score": 0.94,
  "metrics": {
    "sharpness": 128.4,
    "brightness": 145.2,
    "face_width": 240,
    "face_height": 260,
    "yaw": 2.1,
    "pitch": -1.4,
    "occlusion_score": 0.04
  },
  "samples_collected": 5,
  "required_samples": 8,
  "guidance": "Good sample! Now turn your head slightly to the left."
}
```

- **Response (422 Unprocessable Entity - Sample Rejected):**

```json
{
  "status": "REJECTED",
  "reason": "IMAGE_TOO_BLURRY",
  "guidance": "Hold your device steady and ensure good lighting.",
  "metrics": {
    "sharpness": 38.2,
    "brightness": 95.0
  }
}
```

### 4.2 Complete Enrollment & Build Index

- **Endpoint:** `POST /api/v1/students/{id}/enroll/complete`
- **Response (200 OK):**

```json
{
  "status": "ENROLLMENT_COMPLETED",
  "student_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "total_profiles_stored": 8,
  "index_rebuilt": true
}
```

---

## 5. Live Recognition & Streaming WebSocket API

### 5.1 Real-Time Camera Recognition Stream

- **WebSocket Endpoint:** `ws://<host>/api/v1/recognition/ws/stream/{camera_id}`
- **Client Sends:** Binary JPEG video frames (12-15 FPS, max dimension 640px).
- **Server Broadcasts (JSON):**

```json
{
  "status": "success",
  "frame_timestamp": 1756543800.123,
  "camera_id": "cam-room-204",
  "faces": [
    {
      "track_id": 104,
      "bbox": [120, 85, 280, 295],
      "decision": "KNOWN",
      "student_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Rahul Sharma",
      "roll_number": "CSE-2026-42",
      "similarity": 0.892,
      "liveness_score": 0.965,
      "is_live": true,
      "attendance_status": "MARKED_PRESENT",
      "marked_time": "10:02:14"
    },
    {
      "track_id": 105,
      "bbox": [340, 110, 470, 270],
      "decision": "UNKNOWN",
      "student_id": null,
      "name": "Unknown Person",
      "similarity": 0.312,
      "liveness_score": 0.88,
      "is_live": true,
      "attendance_status": "NOT_ELIGIBLE"
    }
  ]
}
```

---

## 6. Attendance Sessions & Verification Endpoints

### 6.1 Create Session

- **Endpoint:** `POST /api/v1/attendance/sessions`
- **Request Body:**

```json
{
  "class_name": "CSE-3A",
  "subject": "Computer Networks",
  "room": "Room 204",
  "scheduled_date": "2026-08-30",
  "start_time": "10:00:00",
  "end_time": "11:00:00",
  "camera_ids": ["c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"]
}
```

### 6.2 Get Session Attendance Live Roster

- **Endpoint:** `GET /api/v1/attendance/sessions/{id}/records`
- **Response (200 OK):**

```json
{
  "session_id": "9a8b7c6d-5e4f-3a2b-1c0d-e5f6a7b8c9d0",
  "summary": {
    "total_students": 60,
    "present_count": 52,
    "late_count": 3,
    "absent_count": 5
  },
  "records": [
    {
      "id": "rec-12345",
      "student_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Rahul Sharma",
      "roll_number": "CSE-2026-42",
      "status": "PRESENT",
      "first_seen": "2026-08-30T10:02:14Z",
      "confidence": 0.892,
      "is_manual": false
    }
  ]
}
```

### 6.3 Manual Attendance Override (With Mandatory Audit Log)

- **Endpoint:** `POST /api/v1/attendance/records/{id}/override`
- **Request Body:**

```json
{
  "status": "MANUAL_PRESENT",
  "remarks": "Student presented valid doctor prescription for late arrival."
}
```

- **Response (200 OK):** Updated attendance record with recorded audit trail.

---

## 7. Reports & Analytics Endpoints

### 7.1 Daily Attendance Report

- **Endpoint:** `GET /api/v1/reports/daily?date=2026-08-30&department=CSE`
- **Response (200 OK):** Aggregated metrics, per-class attendance percentage, and absent lists.

### 7.2 Export Attendance Report (Excel / CSV / PDF)

- **Endpoint:** `GET /api/v1/reports/export?format=excel&session_id=9a8b7c6d...`
- **Response:** `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (Binary download).

---

## 8. Offline Synchronization Endpoint

### 8.1 Push Offline Attendance Events

- **Endpoint:** `POST /api/v1/sync/push`
- **Request Body:**

```json
{
  "events": [
    {
      "event_uuid": "sync-evt-9912",
      "session_id": "9a8b7c6d-5e4f-3a2b-1c0d-e5f6a7b8c9d0",
      "student_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "camera_id": "cam-room-204",
      "first_seen": "2026-08-30T10:02:14Z",
      "confidence": 0.892,
      "liveness_score": 0.965
    }
  ]
}
```

- **Response (200 OK):**

```json
{
  "received": 1,
  "processed": 1,
  "duplicates_ignored": 0,
  "conflicts": []
}
```
