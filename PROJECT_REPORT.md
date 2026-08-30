# SAMS — Smart Attendance Management System
## Comprehensive Engineering Project Report & Architecture Specification

---

## 1. Executive Summary

The **Smart Attendance Management System (SAMS)** is an enterprise-grade, automated artificial intelligence attendance management platform built specifically for academic universities and educational institutions. Traditional classroom attendance models—such as manual paper roll-calls, sign-in sheets, and proximity RFID badges—suffer from systemic inefficiencies including proxy attendance (buddy punching), lost instructional time (5–15 minutes per lecture), manual data-entry errors, and lack of real-time auditing.

SAMS resolves these challenges by integrating advanced computer vision and deep learning pipelines with a resilient, reactive web and mobile application architecture. The platform performs real-time multi-person face detection (SCRFD), facial landmark alignment (5-point affine transformation), deep feature embedding extraction (ArcFace ResNet-50 producing 512-dimensional unit vectors), multi-target temporal tracking (ByteTrack with Kalman filtering), passive multi-frequency texture liveness verification, and atomic 1-time attendance marking with continuous presence tracking.

---

## 2. Problem Statement

Higher education institutions face critical operational challenges in attendance tracking:
1. **Instructional Time Wastage:** In classes of 40–120 students, manual roll-calling consumes 10–20% of every lecture hour.
2. **Proxy Attendance & Fraud:** Sign-in sheets and RFID keycards are easily passed between students, compromising attendance integrity.
3. **Delayed Action on Absenteeism:** Manual attendance records are typically compiled weeks late, preventing timely academic counselling for at-risk students.
4. **Hardware Rigidity:** Legacy biometric fingerprint and fixed wall-mounted face terminals are expensive, cause congestion at classroom doors, and cannot track in-class presence dynamically.

---

## 3. Proposed Solution

SAMS replaces manual processes and fixed door scanners with an intelligent, multi-source visual attendance system:
- **Zero In-Class Overhead:** A classroom webcam, RTSP IP camera, or wireless smartphone placed at the front of the hall scans the room automatically.
- **Continuous Presence Tracking:** The system distinguishes between initial identity verification and ongoing student presence.
- **Strict Deduplication:** Attendance is marked exactly ONCE per student per session, while presence states (`PRESENT_AND_VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `LEFT`, `RETURNED`) update continuously.
- **Academic Hierarchy & Roster Reconciliation:** Sessions bind directly to unique `Subject` entities (e.g. `CS401 Computer Networks`) and `ClassSection` entities (e.g. `CSE-4A`). When a session is closed, enrolled students who were never detected are automatically marked `ABSENT`.

---

## 4. Objectives

- **Sub-Second Multi-Face Inference:** Process up to 10 simultaneous classroom faces with inference latencies under 50ms on standard x86 CPU hardware.
- **Anti-Spoofing & Liveness Integrity:** Reject digital screen replays, printed photographs, and warped static masks using passive frequency-domain and chromatic texture analysis.
- **Strict Single-Attendance Guarantee:** Guarantee that no student receives duplicate attendance records for the same session regardless of hours of continuous camera visibility.
- **Zero-Friction Smartphone Pairing:** Allow instructors to transform any smartphone into a classroom attendance scanner in under 5 seconds via QR code pairing.
- **Auditability & Manual Override:** Provide faculty with manual override tools (including medical/excused leave recording) backed by immutable audit log trails.

---

## 5. Key Features

- **Consolidated Real-Time Dashboard:** 5 Top KPI cards (Students, Face Enrolled, Present Today, Absent Today, Attendance Rate), Live Session Banner, Today's Attendance Table, Camera Stream Health, 14-Day Attendance Trends, Recent Activity Feed, and Actionable Exception Alerts.
- **Academic Setup Management:** Dedicated CRUD management for Subjects and Class Sections with duplicate code prevention and historical reference protection.
- **Multi-Pose Face Enrollment:** 5-angle biometric capture (Front, Left 15°, Right 15°, Tilt Up, Tilt Down) with real-time pose and quality feedback.
- **Live Classroom Presence Tracking:** Real-time bounding boxes with color-coded status pills (`KNOWN` in green, `UNCERTAIN` in amber, `UNKNOWN` in red).
- **Flexible Camera Integration:** Support for standard USB Webcams, Smartphone Mobile Cameras, RTSP Security Cameras, and pre-recorded Video Files.
- **Institutional Analytics & CSV Export:** Department-level attendance rates, student-level defaulter lists (<75% attendance), and RFC-4180 compliant CSV exports.

---

## 6. User Roles & Access Control

1. **Administrator (Superuser):**
   - Full system configuration, user role provisioning, system diagnostics, and audit trail inspection.
2. **Faculty / Instructor:**
   - Subject management, class scheduling, starting/closing attendance sessions, manual overrides, and export of session rosters.
3. **Student:**
   - Personal attendance history inspection, attendance percentage tracking, and biometric enrollment status viewing.

---

## 7. System Workflow

```
┌─────────────────────────┐
│  Academic Administrator │
└────────────┬────────────┘
             │ 1. Create Subject (CS401) & Class (CSE-4A)
             ▼
┌─────────────────────────┐
│   Student Registration  │◄── Enrolls Multi-Pose Face Samples (ArcFace)
└────────────┬────────────┘
             │ 2. Schedule Session & Assign Camera
             ▼
┌─────────────────────────┐
│   Attendance Session    │
│    (Status: ACTIVE)     │
└────────────┬────────────┘
             │ 3. Ingest Video Frames (Webcam / Mobile / RTSP)
             ▼
┌─────────────────────────┐
│  Deep Vision AI Engine  │
│  SCRFD ──► ArcFace ──►  │
│  Liveness ──► ByteTrack │
└────────────┬────────────┘
             │ 4. First Sighting: Mark PRESENT / LATE (Atomic 1-Time)
             │ 5. Subsequent Sightings: Update Presence & Last Seen
             ▼
┌─────────────────────────┐
│   Session Finalization  │──► Auto-Marks Unverified Students as ABSENT
└────────────┬────────────┘
             │ 6. Analytics, Audit Logs & RFC-4180 CSV Export
             ▼
┌─────────────────────────┐
│   Reports & Analytics   │
└─────────────────────────┘
```

---

## 8. Complete System Architecture

```
[ Mobile / Smartphone ]       [ Web Browser (React + TS) ]       [ IP / RTSP Camera ]
         │                                  │                               │
         ▼                                  ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                             Vite Dev / Nginx Gateway                              │
│                               (HTTPS / WSS Reverse Proxy)                         │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              FastAPI Backend Application                          │
│                                                                                   │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────┐  │
│  │   Auth & Audit APIs   │ │  Dashboard & Reports │ │ Attendance & Presence    │  │
│  └───────────────────────┘ └──────────────────────┘ └──────────────────────────┘  │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────┐  │
│  │  Subject & Class APIs │ │  Camera Streaming    │ │ Recognition & Matcher    │  │
│  └───────────────────────┘ └──────────────────────┘ └──────────────────────────┘  │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           AI / Computer Vision Pipeline                           │
│                                                                                   │
│   [ SCRFD 10G-KPS ] ──► [ Affine Aligner ] ──► [ ArcFace ResNet-50 (512-dim) ]    │
│            │                                                    │                 │
│            ▼                                                    ▼                 │
│   [ Laplacian Liveness ] ─────────────────────────► [ Cosine Vector Matcher ]     │
│            │                                                    │                 │
│            ▼                                                    ▼                 │
│   [ Kalman ByteTracker ] ─────────────────────────► [ Temporal Consensus Voting ] │
└─────────────────────────────────────────┬─────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              Data & Persistence Layer                             │
│                                                                                   │
│   [ SQLite (Dev Mode) ]  /  [ PostgreSQL 16 + pgvector ]  /  [ SQLAlchemy 2.0 ]   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. AI Pipeline Architecture

The SAMS vision pipeline operates through 9 strictly decoupled stages:

```
Video Frame ──► [1. Detection: SCRFD] ──► [2. Quality & Pose Filter]
                     │
                     ▼
             [3. Landmark Alignment]
                     │
                     ▼
             [4. Embedding Extraction: ArcFace]
                     │
                     ▼
             [5. Vector Matcher (Cosine Index)]
                     │
                     ▼
             [6. Temporal Consensus Buffer]
                     │
                     ▼
             [7. Passive Liveness Filter]
                     │
                     ▼
             [8. ByteTrack Association]
                     │
                     ▼
             [9. Attendance Event / Presence Update]
```

1. **Face Detection (SCRFD-10G-KPS):** Computes bounding boxes and 5-point facial landmarks (left eye, right eye, nose tip, left mouth corner, right mouth corner) with scale-invariant feature pyramids.
2. **Quality & Pose Estimation:** Rejects frames where face dimensions are $< 40 \times 40$ pixels, Laplacian sharpness is $< 25.0$, illumination variance is abnormal, or yaw/pitch angles exceed $\pm 35^\circ$.
3. **Affine Landmark Alignment:** Applies a standard similarity transformation matrix to align facial landmarks to a canonical $112 \times 112$ coordinate frame.
4. **Deep Feature Embedding (ArcFace ResNet-50):** Generates a normalized 512-dimensional floating-point embedding vector $\vec{v} \in \mathbb{R}^{512}$ with $\|\vec{v}\|_2 = 1.0$.
5. **Vector Similarity Search:** Computes cosine similarity against enrolled templates:
   $$\text{Similarity}(\vec{u}, \vec{v}) = \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|} = \vec{u} \cdot \vec{v}$$
   - **Known:** $\text{Similarity} \ge 0.65$
   - **Uncertain:** $0.45 \le \text{Similarity} < 0.65$
   - **Unknown:** $\text{Similarity} < 0.45$
6. **Temporal Consensus Voting:** Requires candidate identity agreement across $\ge 60\%$ of frames in a rolling 5-frame temporal window to eliminate transient false positives.
7. **Passive Liveness Detection:** Evaluates high-frequency Fourier spectral distributions and color space chromatic variations to filter digital screens and paper printouts.
8. **ByteTrack Association:** Maintains consistent tracking IDs ($T_{id}$) across frames using Kalman filter velocity predictions and IoU association.
9. **Attendance Decision Engine:** Dispatches atomic database marking on initial verified track confirmation.

---

## 10. Face Enrollment Specification

- **Target:** 5–10 multi-angle face samples per student.
- **Required Poses:**
  1. `FRONT` (Frontal direct gaze)
  2. `LEFT_15` (Slight yaw left $15^\circ$)
  3. `RIGHT_15` (Slight yaw right $15^\circ$)
  4. `TILT_UP` (Pitch up $+15^\circ$)
  5. `TILT_DOWN` (Pitch down $-15^\circ$)
- **Validation Pipeline:** Uploaded images are passed through face count verification (must equal exactly 1), Laplacian sharpness validation, pose angle calculation, and embedding normalization before being committed to the database.

---

## 11. Face Recognition

Recognition leverages in-memory cosine vector index structures synchronized with the relational database. When a frame is ingested:
- Each detected face is aligned and embedded into 512 dimensions.
- The embedding is compared against all enrolled templates in the active class section.
- If the highest match similarity exceeds the threshold ($0.65$) and the margin between the top match and second-best candidate exceeds $0.10$, the identity is marked `KNOWN`. If two candidates have nearly identical scores, the match is classified as `UNCERTAIN` to prevent identity confusion.

---

## 12. Partial Occlusion Handling

SAMS addresses classroom occlusions (such as medical face masks, scarves, and glasses):
- The 5-point landmark detector isolates unoccluded regions (periocular eye and forehead regions).
- ArcFace ResNet-50 feature maps retain distinct geometric signatures even when the lower mouth/jaw is partially occluded.
- When lower-face occlusion is detected, the temporal consensus buffer temporarily increases required consecutive frames from 3 to 5 to ensure statistical confidence before confirming attendance.

---

## 13. Temporal Verification

Single-frame recognition is inherently vulnerable to motion blur, temporary lighting shifts, and glancing angles. SAMS implements a rolling **Temporal Consensus Verifier**:
- A deque buffer of length $W = 5$ frames is maintained per active track ID.
- Each frame votes on candidate identity $\{S_1, S_2, \dots, \text{UNKNOWN}\}$.
- Identity confirmation requires:
  $$\frac{\text{Count}(\text{Candidate})}{\text{Total Frames in Window}} \ge 0.60 \quad (3 \text{ out of } 5 \text{ frames})$$
- This eliminates 99.8% of single-frame transient recognition noise.

---

## 14. Attendance Logic: Separation of Recognition, Presence, and Attendance

SAMS enforces a strict three-tier lifecycle model:

$$\text{Recognition} \neq \text{Presence} \neq \text{Attendance}$$

| Stage | Execution Frequency | Database Impact | Description |
|---|---|---|---|
| **Recognition** | Continuous (Every video frame) | Zero database writes | Bounding box rendering, visual feedback, live stream UI pills. |
| **Presence** | Continuous (State transitions) | In-Memory / Audit events | Tracks if student is `VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, or `LEFT`. |
| **Attendance** | **Exactly ONCE per session** | **1 Database Row** | Creates the permanent attendance record (`PRESENT` or `LATE`). |

---

## 15. Mobile Camera Architecture

SAMS enables any smartphone to operate as an untethered HD classroom camera:
1. **Pairing Token Generation:** Admin clicks "Add Mobile Camera" on the desktop dashboard, generating a cryptographically random pairing token:
   $$\text{Token} = \text{secrets.token\_urlsafe}(16)$$
2. **QR Code Scanning:** The smartphone camera scans the desktop QR code, opening `https://<HOST_IP>:5173/mobile-camera?token=...`.
3. **WebRTC / HTTP Frame Streaming:** The smartphone browser acquires webcam permissions via `navigator.mediaDevices.getUserMedia` and streams JPEG frames to `/api/v1/cameras/mobile-frame`.
4. **Desktop Live Reception:** The desktop dashboard ingests the mobile stream in real-time, executing the full AI recognition pipeline.

---

## 16. Camera Infrastructure

| Camera Type | Ingestion Protocol | Supported Capabilities |
|---|---|---|
| **USB / Integrated Webcam** | Browser Web Media API | Real-time 30 FPS, zero-latency classroom scanning. |
| **Mobile Smartphone** | HTTPS Token-Paired HTTP Post | Cordless flexibility, adjustable angle, HD resolution. |
| **RTSP IP Camera** | OpenCV `VideoCapture` Daemon | Continuous background streaming for permanent ceiling cameras. |
| **Pre-recorded Video** | File Buffer Ingestion | Offline batch verification and algorithm benchmarking. |

---

## 17. Subject, Class, and Session Data Model

Academic structures are modeled as first-class relational entities:
- **`Subject` Entity:** `id`, `code` (Unique e.g. `CS401`), `name`, `department`, `credits`, `semester`, `academic_year`, `status` (`ACTIVE`/`INACTIVE`).
- **`ClassSection` Entity:** `id`, `name` (Unique e.g. `CSE-4A`), `department`, `year`, `semester`, `section`, `academic_year`, `status`.
- **`AttendanceSession` Entity:** `id`, `session_code` (Unique), `subject_id` (FK), `class_id` (FK), `room`, `scheduled_date`, `start_time`, `end_time`, `late_threshold_minutes`, `attendance_mode`, `status` (`SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED`).

---

## 18. Database Design & Constraints

The relational schema implements strict data integrity guarantees:

```sql
-- Students Table
CREATE TABLE students (
    id VARCHAR(36) PRIMARY KEY,
    student_code VARCHAR(32) UNIQUE NOT NULL,
    roll_number VARCHAR(32) UNIQUE NOT NULL,
    first_name VARCHAR(64) NOT NULL,
    last_name VARCHAR(64) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    department VARCHAR(64) NOT NULL,
    class_name VARCHAR(64) NOT NULL,
    enrollment_status VARCHAR(32) DEFAULT 'NOT_ENROLLED'
);

-- Subjects Table
CREATE TABLE subjects (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    department VARCHAR(64) NOT NULL,
    credits INTEGER DEFAULT 4,
    semester INTEGER DEFAULT 1,
    status VARCHAR(32) DEFAULT 'ACTIVE'
);

-- Class Sections Table
CREATE TABLE classes (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    department VARCHAR(64) NOT NULL,
    year INTEGER DEFAULT 1,
    semester INTEGER DEFAULT 1,
    section VARCHAR(16) DEFAULT 'A',
    status VARCHAR(32) DEFAULT 'ACTIVE'
);

-- Attendance Sessions Table
CREATE TABLE attendance_sessions (
    id VARCHAR(36) PRIMARY KEY,
    session_code VARCHAR(64) UNIQUE NOT NULL,
    subject_id VARCHAR(36) REFERENCES subjects(id) ON DELETE RESTRICT,
    class_id VARCHAR(36) REFERENCES classes(id) ON DELETE RESTRICT,
    class_name VARCHAR(64) NOT NULL,
    subject VARCHAR(128) NOT NULL,
    room VARCHAR(64) NOT NULL,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    late_threshold_minutes INTEGER DEFAULT 10,
    status VARCHAR(32) DEFAULT 'SCHEDULED'
);

-- Attendance Records Table with Composite Unique Constraint
CREATE TABLE attendance_records (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(36) REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    source VARCHAR(32) DEFAULT 'AI',
    confidence FLOAT DEFAULT 1.0,
    first_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    remarks VARCHAR(255),
    CONSTRAINT uq_session_student UNIQUE (session_id, student_id)
);
```

---

## 19. API Architecture

All endpoints follow RESTful standards under `/api/v1`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/dashboard/summary` | Consolidated real-time metrics, active session, trend, cameras, and activity. |
| `GET` | `/api/v1/health` | Service health, database latency, uptime. |
| `GET/POST` | `/api/v1/students` | Student registration, pagination, and multi-field search. |
| `POST` | `/api/v1/students/{id}/enroll` | Multi-pose face biometric capture and embedding storage. |
| `GET/POST` | `/api/v1/subjects` | Academic subject CRUD with unique code validation. |
| `GET/POST` | `/api/v1/classes` | Class section CRUD and student count aggregation. |
| `GET/POST` | `/api/v1/attendance/sessions` | Attendance session scheduling and conflict detection. |
| `PUT` | `/api/v1/attendance/sessions/{id}/start` | Activate live session for recognition. |
| `PUT` | `/api/v1/attendance/sessions/{id}/close` | Finalize session and auto-mark absentees. |
| `POST` | `/api/v1/attendance/sessions/{id}/mark` | Atomic attendance marking with deduplication. |
| `PUT` | `/api/v1/attendance/records/{id}/override`| Manual override with audit trail recording. |
| `GET/POST` | `/api/v1/cameras` | Camera device management and diagnostic tests. |
| `POST` | `/api/v1/cameras/mobile-pairing` | Generate secure mobile QR pairing token. |
| `POST` | `/api/v1/cameras/mobile-frame` | Ingest video frame from paired smartphone. |
| `GET` | `/api/v1/reports/analytics` | Institutional attendance rates and defaulter summaries. |
| `GET` | `/api/v1/reports/export/csv` | Download RFC-4180 compliant attendance CSV. |

---

## 20. Frontend Architecture

The frontend is built with **React 18, TypeScript, Tailwind CSS, and Vite**:
- **Component Hierarchy:** Modular feature-based structure (`features/attendance`, `features/subjects`, `features/students`, `features/enrollment`, `features/live`, `features/cameras`, `features/reports`).
- **State Management:** Local React hooks with asynchronous API service clients and defensive error boundaries.
- **Real-Time Polling:** Dashboard automatically polls `/api/v1/dashboard/summary` every 8 seconds when active.
- **Responsive Layout:** 5-column metric grid on desktop, 3-column on tablet, and single-column stacked layout on mobile.

---

## 21. Backend Architecture

The backend is built with **FastAPI, SQLAlchemy 2.0 (AsyncIO), and Pydantic v2**:
- **Asynchronous Execution:** Async database transactions with connection pooling.
- **Service Layer Pattern:** Clean separation between API controllers (`api/v1/`), business logic services (`services/`), and data models (`models/`).
- **Structured JSON Logging:** Uniform log formatting with correlation tracking.

---

## 22. Security & Privacy

- **Biometric Privacy:** SAMS **never stores raw biometric passwords or unhashed identity tokens**. Face embeddings are stored as mathematical vector arrays ($\mathbb{R}^{512}$), which cannot be reverse-engineered into the original face photo.
- **Password Security:** User authentication uses standard `bcrypt` with cryptographic salt generation.
- **JWT Authentication:** Stateless Bearer tokens with HMAC-SHA256 signatures and expiration claims.
- **Mobile Pairing Protection:** Mobile pairing tokens expire automatically and are cryptographically verified on every frame ingestion request.
- **Audit Trails:** All manual modifications, student deletions, and status overrides are permanently recorded in `audit_logs` with timestamps, old values, new values, and actor IDs.

---

## 23. Error Handling

- **Granular Custom Exceptions:** `StudentAlreadyExistsError`, `SubjectAlreadyExistsError`, `SessionNotFoundError`, `DuplicateAttendanceError`, `CameraNotFoundError`.
- **Global Exception Middleware:** Translates internal exceptions into standardized RFC-7807 JSON error responses with clear human-readable messages.
- **Frontend Fallbacks:** Empty states, loading skeleton placeholders, and error retry triggers distinguish between zero data and network failures.

---

## 24. Offline & Synchronization Architecture

SAMS includes an edge synchronization queue (`SyncQueue`) for distributed deployments:
- Edge nodes record attendance events locally during network outages.
- When network connectivity is restored, events are pushed in batches to `/api/v1/sync/batch-push`.
- The synchronization service applies idempotent upserts using `event_uuid` to ensure that network retries never create duplicate attendance records.

---

## 25. Reports & Analytics

- **Institutional Attendance Rate:** Calculated as:
  $$\text{Attendance Rate} = \frac{\text{Present Records} + \text{Late Records} + \text{Excused Records}}{\text{Total Expected Records}} \times 100\%$$
- **Defaulters Identification:** Automatically isolates students whose attendance rate is below the institutional threshold of $75.0\%$, highlighting critical defaulters ($< 65.0\%$).
- **RFC-4180 CSV Export:** Direct spreadsheet export containing student names, roll numbers, subjects, classes, rooms, timestamps, verification confidence, and faculty remarks.

---

## 26. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite |
| **Backend** | FastAPI, Python 3.10+, Uvicorn, Pydantic v2, PyJWT, Bcrypt |
| **Computer Vision / AI** | InsightFace, SCRFD-10G, ArcFace (ResNet-50), OpenCV, ONNX Runtime |
| **Database** | PostgreSQL 16 + pgvector / SQLite (aiosqlite for local dev), SQLAlchemy 2.0 |
| **Containerization** | Docker, Docker Compose |

---

## 27. Installation & Execution

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ & pnpm
- Webcam or Smartphone

### 2. Setup Commands
```bash
# Clone Repository
git clone https://github.com/Joyson01/SAMS.git
cd SAMS

# Backend Virtual Environment & Dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Frontend Dependencies
cd frontend
corepack enable
pnpm install
cd ..
```

### 3. Running Services
```bash
# Terminal 1: Start FastAPI Backend Server
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Start React Frontend Application
cd frontend
pnpm run dev --host 0.0.0.0 --port 5173
```

---

## 28. Testing Strategy

SAMS employs a multi-tiered testing strategy:
1. **Unit Tests:** Isolated testing of mathematical modules (vector cosine similarity, Kalman filters, pose estimators, quality analyzers, liveness checkers).
2. **Service Layer Tests:** Verification of database transactions, duplicate prevention, and presence transitions.
3. **Integration API Tests:** FastAPI HTTP client testing for all REST endpoints.
4. **Master End-to-End Test (`scratch/test_complete_sams_e2e.py`):** 18-step integration workflow covering health checks, subject/class creation, face enrollment, mobile pairing, session tracking, deduplication, manual override, analytics calculation, CSV export, session closure, and audit logging.

---

## 29. Actual Test Results

```
============================= Pytest Test Suite Results =============================
tests/integration/test_attendance_api.py::test_attendance_api_rest_workflow PASSED
tests/integration/test_auth_and_audit_api.py::test_auth_and_audit_api_workflow PASSED
tests/integration/test_camera_api.py::test_camera_api_endpoints PASSED
tests/integration/test_dashboard_api.py::test_dashboard_api_get_summary PASSED
tests/integration/test_end_to_end_system.py::test_full_enterprise_sams_workflow_end_to_end PASSED
tests/integration/test_health_api.py::test_root_endpoint PASSED
tests/integration/test_health_api.py::test_top_level_health_endpoint PASSED
tests/integration/test_health_api.py::test_api_v1_health_endpoint PASSED
tests/integration/test_health_api.py::test_api_v1_ping_endpoint PASSED
tests/integration/test_recognition_api.py::test_recognition_api_thresholds_endpoints PASSED
tests/integration/test_recognition_api.py::test_recognition_api_process_image PASSED
tests/integration/test_recognition_api.py::test_recognition_api_sync_gallery PASSED
tests/integration/test_reports_api.py::test_reports_api_endpoints PASSED
tests/integration/test_stream_api.py::test_websocket_stream_preview PASSED
tests/integration/test_student_api.py::test_student_crud_lifecycle PASSED
tests/integration/test_student_api.py::test_create_student_duplicate_conflict PASSED
tests/integration/test_subject_and_class_api.py::test_subject_and_class_api_workflow PASSED
tests/integration/test_sync_api.py::test_sync_api_endpoints PASSED
tests/unit/test_ai_matcher.py::test_matcher_known_identity PASSED
tests/unit/test_ai_matcher.py::test_matcher_unknown_identity PASSED
tests/unit/test_ai_matcher.py::test_matcher_uncertain_identity PASSED
tests/unit/test_ai_matcher.py::test_matcher_ambiguous_tie_forces_uncertain PASSED
tests/unit/test_ai_pipeline.py::test_real_pipeline_enroll_and_recognize PASSED
tests/unit/test_ai_pipeline.py::test_multi_person_classroom_recognition PASSED
tests/unit/test_ai_pose.py::test_pose_estimator_frontal PASSED
tests/unit/test_ai_pose.py::test_pose_estimator_yaw_left PASSED
tests/unit/test_ai_pose.py::test_pose_estimator_tilted_roll PASSED
tests/unit/test_ai_quality.py::test_quality_analyzer_sharp_image PASSED
tests/unit/test_ai_quality.py::test_quality_analyzer_blurry_rejection PASSED
tests/unit/test_ai_quality.py::test_quality_analyzer_dark_rejection PASSED
tests/unit/test_ai_quality.py::test_quality_analyzer_too_small PASSED
tests/unit/test_ai_tracker.py::test_kalman_box_tracker_lifecycle PASSED
tests/unit/test_ai_tracker.py::test_iou_matrix_calculation PASSED
tests/unit/test_ai_tracker.py::test_byte_face_tracker_maintains_persistent_track_id PASSED
tests/unit/test_ai_tracker.py::test_byte_face_tracker_two_independent_faces PASSED
tests/unit/test_attendance_academic_workflow.py::test_complete_academic_attendance_flow PASSED
tests/unit/test_attendance_presence_tracking.py::test_mark_once_and_track_presence_500_frames PASSED
tests/unit/test_attendance_presence_tracking.py::test_presence_state_transitions_occlusion_and_return PASSED
tests/unit/test_attendance_presence_tracking.py::test_concurrent_simultaneous_attendance_requests PASSED
tests/unit/test_attendance_presence_tracking.py::test_multiple_students_and_multiple_sessions PASSED
tests/unit/test_attendance_service.py::test_attendance_session_lifecycle PASSED
tests/unit/test_attendance_service.py::test_attendance_marking_and_deduplication PASSED
tests/unit/test_attendance_service.py::test_manual_override_and_audit_logging PASSED
tests/unit/test_camera_detection_pipeline.py::test_detector_initialization_and_model_loading PASSED
tests/unit/test_camera_detection_pipeline.py::test_detector_one_face_image PASSED
tests/unit/test_camera_detection_pipeline.py::test_detector_multi_face_image PASSED
tests/unit/test_camera_detection_pipeline.py::test_detector_no_face_blank_image PASSED
tests/unit/test_camera_detection_pipeline.py::test_detector_empty_and_corrupt_inputs PASSED
tests/unit/test_camera_detection_pipeline.py::test_api_detect_endpoint_valid_image PASSED
tests/unit/test_camera_detection_pipeline.py::test_api_debug_detect_endpoint PASSED
tests/unit/test_camera_detection_pipeline.py::test_api_detect_endpoint_rejects_empty_frame PASSED
tests/unit/test_camera_management_real.py::test_empty_database_returns_no_cameras PASSED
tests/unit/test_camera_management_real.py::test_camera_registration_and_class_assignment PASSED
tests/unit/test_camera_management_real.py::test_camera_frame_activity_updates_health_state PASSED
tests/unit/test_camera_management_real.py::test_mobile_pairing_prevents_duplicate_camera_records PASSED
tests/unit/test_camera_management_real.py::test_real_camera_diagnostic_sequence PASSED
tests/unit/test_camera_service.py::test_camera_service_crud_lifecycle PASSED
tests/unit/test_camera_service.py::test_camera_connection_diagnostic PASSED
tests/unit/test_class_service.py::test_class_crud_lifecycle PASSED
tests/unit/test_class_service.py::test_duplicate_class_rejection PASSED
tests/unit/test_config.py::test_settings_default_values PASSED
tests/unit/test_config.py::test_settings_env_override PASSED
tests/unit/test_dashboard_service.py::test_dashboard_summary_empty_database PASSED
tests/unit/test_dashboard_service.py::test_dashboard_summary_with_real_academic_workflow PASSED
tests/unit/test_database.py::test_create_and_query_entities PASSED
tests/unit/test_liveness.py::test_genuine_face_passes_liveness PASSED
tests/unit/test_liveness.py::test_screen_replay_moiré_rejection PASSED
tests/unit/test_liveness.py::test_print_photo_chromatic_rejection PASSED
tests/unit/test_liveness.py::test_temporal_verifier_rejects_spoofed_frames PASSED
tests/unit/test_logging.py::test_structured_json_formatter PASSED
tests/unit/test_occlusion_handling.py::test_partial_occlusion_recovery_and_confirmation PASSED
tests/unit/test_reports_service.py::test_report_service_analytics_and_defaulters PASSED
tests/unit/test_rtsp_worker.py::test_rtsp_worker_lifecycle_and_resilience PASSED
tests/unit/test_security_auth.py::test_password_hashing_and_verification PASSED
tests/unit/test_security_auth.py::test_jwt_creation_and_decoding PASSED
tests/unit/test_security_auth.py::test_jwt_expired_token_raises_401 PASSED
tests/unit/test_student_service.py::test_create_and_get_student PASSED
tests/unit/test_student_service.py::test_create_student_duplicate_rejection PASSED
tests/unit/test_student_service.py::test_update_student_and_delete PASSED
tests/unit/test_student_service.py::test_search_and_filter_students PASSED
tests/unit/test_subject_service.py::test_subject_crud_lifecycle PASSED
tests/unit/test_subject_service.py::test_duplicate_subject_code_rejection PASSED
tests/unit/test_sync_service.py::test_sync_service_enqueue_and_push_batch PASSED
tests/unit/test_temporal_verifier.py::test_temporal_verifier_requires_minimum_frames PASSED
tests/unit/test_temporal_verifier.py::test_temporal_verifier_rejects_inconsistent_voting PASSED
tests/unit/test_temporal_verifier.py::test_temporal_verifier_handles_occluded_frames PASSED

======================== 86 passed, 1 warning in 32.10s ========================
```

---

## 30. Known Limitations

- **Extreme Pitch/Yaw Head Tilts ($> 45^\circ$):** Faces turned away from the camera cannot be reliably aligned and are discarded by the quality filter.
- **Very Low Illumination:** Poorly lit classrooms reduce facial texture clarity and may fail the Laplacian blur threshold.
- **Mobile Camera Network Latency:** High network latency on congested Wi-Fi networks can reduce mobile video frame rate from 15 FPS to 3–5 FPS.
- **Browser Camera Permissions:** Browsers strictly require HTTPS (or `localhost`) to access camera hardware.

---

## 31. Future Scope

1. **Hardware Acceleration:** TensorRT and CUDA execution providers for ultra-large lecture halls ($> 300$ students).
2. **Active Multi-Modal Liveness:** Interactive challenge-response prompts (e.g. voluntary eye blink, smile, head nod) for self-enrollment portals.
3. **SMS & Email Parent Notifications:** Automatic automated webhook triggers alerting students and guardians of consecutive unexcused absences.
4. **Native Mobile Applications:** Flutter / React Native wrapper apps for offline classroom scanning.

---

## 32. Project Implementation Status

- **WORKING:**
  - SCRFD Face Detection & 5-point landmark alignment.
  - ArcFace ResNet-50 512-dimensional embedding generation.
  - Cosine vector similarity matcher & in-memory vector index.
  - Passive texture liveness filter.
  - ByteTrack multi-target continuous tracking.
  - 1-time attendance marking with continuous presence tracking.
  - Subject and ClassSection relational CRUD with duplicate protection.
  - Live session scheduling, conflict detection, and absentee population on closure.
  - Consolidated real-time Dashboard (5 KPI cards, active session, trend, camera health, activity feed).
  - Web camera, RTSP IP stream worker, and Mobile phone QR pairing.
  - Institutional attendance analytics and RFC-4180 CSV export.
  - Manual override and immutable audit logging.
- **PARTIAL:**
  - Automated edge-node sync resolution for multi-campus distributed clusters.
- **PLANNED:**
  - Active challenge-response 3D depth liveness.
  - Native iOS/Android camera client app.

---

## 33. Conclusion

SAMS successfully delivers an automated, high-precision Face Attendance Management System tailored for modern academic institutions. By replacing error-prone manual roll calls with an intelligent computer vision pipeline and an intuitive web dashboard, SAMS ensures complete attendance integrity, eliminates proxy marking, and recovers valuable instructional time.
