# JOJIPA-SAMS — Smart Attendance Management System
## Comprehensive Engineering Project Report & Architecture Specification

---

## 1. Project Overview
The **JOJIPA-SAMS (Smart Attendance Management System)** is an automated, AI-powered Face Attendance Management System engineered for educational institutions, colleges, and universities. By integrating deep learning vision models with an asynchronous service architecture, JOJIPA-SAMS automates classroom attendance, eliminates manual roll-call overhead, prevents proxy attendance (buddy punching), and provides continuous student presence tracking.

## 2. Problem Statement
Academic institutions face persistent operational inefficiencies in attendance administration:
1. **Instructional Time Wastage:** In typical classrooms of 40–120 students, manual paper roll-calling consumes 10–20% of every lecture hour.
2. **Proxy Marking & Attendance Fraud:** Sign-in sheets and RFID smartcards are frequently shared among peers, compromising institutional record integrity.
3. **Delayed Absenteeism Intervention:** Manual records are compiled weeks late, preventing timely academic counselling for at-risk students.
4. **Biometric Hardware Rigidity:** Wall-mounted fingerprint and single-user face scanners cause severe congestion at classroom doors and cannot monitor continuous student presence during lectures.

## 3. Motivation
Higher education requires an unintrusive, real-time, multi-person visual attendance system that functions using standard classroom hardware (webcams, smartphone cameras, or RTSP security cameras) without requiring students to queue individually at a terminal.

## 4. Objectives
- **Sub-Second Multi-Face Inference:** Process up to 10 simultaneous classroom faces with inference latencies under 50ms on standard x86 CPU hardware.
- **Anti-Spoofing & Liveness Integrity:** Reject digital screen replays, printed photographs, and warped static masks using passive frequency-domain texture analysis.
- **Strict Single-Attendance Guarantee:** Guarantee that no student receives duplicate attendance records for the same session regardless of continuous camera visibility.
- **Zero-Friction Smartphone Pairing:** Allow instructors to transform any smartphone into a classroom attendance scanner in under 5 seconds via QR code pairing.
- **Auditability & Manual Override:** Provide faculty with manual override tools (including medical/excused leave recording) backed by immutable audit log trails.

## 5. Proposed Solution
JOJIPA-SAMS introduces a vision-based continuous presence system:
- Scans the lecture hall automatically from front-facing camera feeds.
- **Separates Recognition from Attendance:** Video recognition and presence states (`VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `LEFT`, `RETURNED`) update continuously, while database attendance is marked exactly **ONCE** per student.
- Binds sessions to academic `Subject` entities (e.g. `CS401`) and `ClassSection` entities (e.g. `CSE-4A`).
- Automatically reconciles absentees upon session closure by auto-populating enrolled students who were not detected.

## 6. Key Features
- **Consolidated Real-Time Dashboard:** 5 KPI summary cards (Students, Face Enrolled, Present Today, Absent Today, Attendance Rate), Live Session Banner, Today's Attendance Table, Camera Stream Health, 14-Day Attendance Trends, Recent Activity Feed, and Actionable Exception Alerts.
- **Academic Hierarchy Management:** Dedicated CRUD management for Subjects and Class Sections with duplicate code prevention and historical reference protection.
- **Multi-Pose Face Enrollment:** 5-angle biometric capture (Front, Left 15°, Right 15°, Tilt Up, Tilt Down) with real-time pose and quality feedback.
- **Live Classroom Presence Tracking:** Real-time bounding boxes with color-coded status pills (`KNOWN` in green, `UNCERTAIN` in amber, `UNKNOWN` in red).
- **Flexible Camera Integration:** Support for standard USB Webcams, Smartphone Mobile Cameras, RTSP Security Cameras, and pre-recorded Video Files.
- **Institutional Analytics & CSV Export:** Department-level attendance rates, student-level defaulter lists (<75% attendance), and RFC-4180 compliant CSV exports.

## 7. System Users and Roles
1. **Administrator (Superuser):** System configuration, user provisioning, system diagnostics, and audit trail inspection.
2. **Faculty / Instructor:** Subject and class management, scheduling/closing sessions, live attendance monitoring, and manual overrides.
3. **Student:** Personal attendance history inspection, attendance percentage tracking, and biometric enrollment status viewing.

## 8. Complete System Workflow
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

## 9. High-Level Architecture
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
│                           JOJIPA-SAMS FastAPI Backend                             │
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

## 10. Frontend Architecture
The frontend is built with **React 18, TypeScript, Tailwind CSS, and Vite**:
- **Component Hierarchy:** Modular feature-based structure (`features/attendance`, `features/subjects`, `features/students`, `features/enrollment`, `features/live`, `features/cameras`, `features/reports`).
- **State Management:** Local React hooks with asynchronous API service clients and defensive error boundaries.
- **Real-Time Polling:** Dashboard automatically polls `/api/v1/dashboard/summary` every 8 seconds when active.
- **Responsive Layout:** 5-column metric grid on desktop, 3-column on tablet, and single-column stacked layout on mobile.

## 11. Backend Architecture
The backend is built with **FastAPI, SQLAlchemy 2.0 (AsyncIO), and Pydantic v2**:
- **Asynchronous Execution:** Async database transactions with connection pooling.
- **Service Layer Pattern:** Clean separation between API controllers (`api/v1/`), business logic services (`services/`), and data models (`models/`).
- **Structured JSON Logging:** Uniform log formatting with correlation tracking.

## 12. Database Architecture
The relational schema implements strict data integrity guarantees:
- **`students` Table:** Student identification, roll numbers, department, class section, and enrollment status.
- **`subjects` Table:** Unique course codes (`CS401`), title, credits, semester, department, and active status.
- **`classes` Table:** Class section identifier (`CSE-4A`), department, semester, and section.
- **`attendance_sessions` Table:** Session code, subject FK, class FK, scheduled date, time window, late threshold, and status.
- **`attendance_records` Table:** Composite unique constraint `UNIQUE(session_id, student_id)` preventing duplicate records.
- **`face_profiles` Table:** 512-dimensional vector embeddings, pose type, and quality scores.

## 13. AI/CV Architecture
The vision pipeline operates through 9 strictly decoupled stages:
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
             [9. Attendance Decision / Presence Update]
```

## 14. Face Enrollment
- **Target:** 5–10 multi-angle face samples per student.
- **Required Poses:** Frontal direct gaze, Left 15°, Right 15°, Tilt Up (+15°), and Tilt Down (-15°).
- **Validation Pipeline:** Images pass face count checks (must equal exactly 1), Laplacian blur validation, pose angle calculation, and embedding normalization before committing to the database.

## 15. Face Detection
Face detection utilizes **SCRFD-10G-KPS** (Sample and Computation Redistribution for Face Detection) with multi-scale feature pyramids. It detects bounding boxes and 5-point facial keypoints (eyes, nose, mouth corners) even in dense classroom seating.

## 16. Face Recognition
Recognition leverages in-memory cosine vector index structures synchronized with the relational database:
$$\text{Similarity}(\vec{u}, \vec{v}) = \vec{u} \cdot \vec{v}$$
- **Known:** $\text{Similarity} \ge 0.65$ with confidence margin $\ge 0.10$.
- **Uncertain:** $0.45 \le \text{Similarity} < 0.65$.
- **Unknown:** $\text{Similarity} < 0.45$.

## 17. Face Embeddings
Face embeddings are extracted using an **ArcFace ResNet-50** deep convolutional neural network. Each aligned face crop ($112 \times 112$) is mapped to a 512-dimensional floating-point unit vector:
$$\vec{v} \in \mathbb{R}^{512}, \quad \|\vec{v}\|_2 = 1.0$$

## 18. Multi-Face Recognition
The system processes multiple bounding boxes per frame in parallel batches. In classroom tests with 3–5 simultaneous faces, inference completes in 28–45ms on CPU.

## 19. Tracking
Continuous identity tracking uses **ByteTrack** with a Kalman filter motion predictor. It maintains persistent track IDs ($T_{id}$) across video frames, preserving student identity during temporary posture shifts.

## 20. Partial Occlusion Handling
When lower-face occlusion (e.g. medical masks, scarves) is detected:
- 5-point landmarks isolate the unoccluded periocular eye and forehead regions.
- The temporal consensus buffer increases the required consecutive observation frames from 3 to 5 before confirming identity.

## 21. Temporal Verification
To eliminate transient single-frame false positives:
- A rolling buffer of $W = 5$ frames is maintained per track ID.
- Identity confirmation requires agreement across $\ge 60\%$ of frames in the window (3 out of 5 frames).

## 22. Liveness / Anti-Spoofing
Passive texture anti-spoofing evaluates high-frequency Fourier spectral distributions and color space chromatic variations to detect and reject digital screen replays and paper printouts.

## 23. Attendance Engine
Enforces the fundamental separation of concerns:
$$\text{Recognition} \neq \text{Presence} \neq \text{Attendance}$$
- **Recognition:** Frame-by-frame visual bounding box rendering (0 database writes).
- **Presence:** In-memory tracking of whether a student is `VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, or `LEFT`.
- **Attendance:** Exactly **ONE** atomic database record per student per session (`PRESENT` or `LATE`).

## 24. Subject and Class Management
Dedicated administrative modules manage academic subjects and class sections. Submitting duplicate subject codes (`CS401`) or class names (`CSE-4A`) is rejected with clear error feedback. Deleting a subject with historical session data triggers a safe soft-deactivation (`ACTIVE` $\to$ `INACTIVE`).

## 25. Attendance Session Management
Faculty schedule sessions by selecting a valid Subject, Class Section, Room, and scheduled start/end times. Starting a session transitions status to `ACTIVE`. Ending the session marks it `COMPLETED` and automatically registers all undetected roster students as `ABSENT`.

## 26. Camera Architecture
Supports USB Webcams, RTSP IP cameras (`rtsp://user:pass@ip:port/stream`), and pre-recorded video files. Stream health is dynamically computed based on relative frame arrival timestamps (`STREAMING`, `CONNECTED`, `NO_FRAME`, `OFFLINE`).

## 27. Mobile Camera Architecture
Enables wireless smartphones to stream classroom video:
- Smartphone opens `https://<HOST_IP>:5173/mobile-camera?token=...`.
- Acquires camera permissions via WebRTC `getUserMedia`.
- Streams JPEG frames to `/api/v1/cameras/mobile-frame` for AI recognition.

## 28. QR Pairing
Desktop administrators generate cryptographically random pairing tokens (`secrets.token_urlsafe(16)`) rendered as a QR code. Scanning the QR code pairs the phone to the classroom session in under 5 seconds.

## 29. Reports and Analytics
- Computes overall institutional attendance percentage:
  $$\text{Rate} = \frac{\text{Present} + \text{Late} + \text{Excused}}{\text{Total Expected Records}} \times 100\%$$
- Highlights attendance defaulters ($< 75\%$) and critical defaulters ($< 65\%$).
- Exports RFC-4180 compliant CSV spreadsheets.

## 30. Manual Overrides
Faculty can manually correct attendance records (e.g. converting `ABSENT` to `EXCUSED` or `MANUAL_PRESENT` with custom remarks) directly from the session roster.

## 31. Audit Logging
Every manual override, student profile creation, and session modification is permanently logged in the `audit_logs` table with actor ID, entity type, old values, new values, and ISO-8601 timestamps.

## 32. Authentication and Security
- Password hashing using salted `bcrypt`.
- Stateless JWT HS256 tokens with configurable expiration claims.
- Role-based authorization (`ADMIN`, `FACULTY`, `STUDENT`).

## 33. Privacy and Biometric Data Handling
Raw facial images are not stored as authentication secrets. SAMS exclusively stores mathematical embedding vectors ($\mathbb{R}^{512}$), which cannot be reconstructed into raw photographs.

## 34. Error Handling
- Custom exception hierarchy (`StudentAlreadyExistsError`, `SessionNotFoundError`, `DuplicateAttendanceError`).
- Standardized RFC-7807 JSON error responses.
- UI empty states, skeleton loaders, and retry triggers.

## 35. Offline / Synchronization
Edge synchronization queue (`SyncQueue`) stores attendance events locally during network outages and synchronizes idempotently via `/api/v1/sync/batch-push` upon reconnection.

## 36. Technology Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend:** FastAPI, Python 3.10+, SQLAlchemy 2.0 (AsyncIO), Pydantic v2, PyJWT, Bcrypt
- **AI / Vision:** InsightFace, SCRFD-10G, ArcFace (ResNet-50), OpenCV, ONNX Runtime, ByteTrack
- **Databases:** PostgreSQL 16 + pgvector / SQLite (aiosqlite)
- **Deployment:** Docker, Docker Compose

## 37. Repository Structure
```
JOJIPA-SAMS/
├── backend/app/             # FastAPI REST & WebSocket application
├── ai_engine/               # SCRFD, ArcFace, ByteTrack, and Liveness modules
├── frontend/src/            # React 18 + TypeScript user interface
├── scripts/                 # Optional demo database seeders
├── tests/                   # 86 Pytest unit & integration tests
├── .env.example             # Documented environment template
├── docker-compose.yml       # Production containerization
├── README.md                # System manual
└── PROJECT_REPORT.md        # 46-section engineering specification
```

## 38. Installation
```bash
git clone https://github.com/Joyson01/SAMS.git
cd SAMS
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend && pnpm install && cd ..
```

## 39. Execution Instructions
```bash
# Start Backend API
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# Start Frontend App
cd frontend && pnpm run dev --host 0.0.0.0 --port 5173
```

## 40. Mobile Setup
1. Connect PC and phone to same Wi-Fi.
2. Open `https://<PC_IP>:5173/` on desktop.
3. In **Cameras**, click **Add Mobile Camera** $\to$ **Generate QR Code**.
4. Scan with phone camera and tap **Start Camera**.

## 41. Testing Methodology
- **Unit Testing:** Isolated tests for ArcFace embeddings, cosine matching, ByteTrack Kalman filter, pose estimators, and quality analyzers.
- **Service Layer Testing:** Database transaction integrity, deduplication, and presence lifecycle transitions.
- **Integration API Testing:** HTTP endpoint verification.
- **End-to-End Workflow Testing:** 18-step master automated script verifying full lifecycle.

## 42. Test Results
```
Pytest Automated Suite:    86 passed, 1 warning in 32.10s (100% pass)
Master E2E Workflow Script: 18 / 18 stages verified successfully
Frontend Production Build: Built in 2.19s (0 TypeScript errors)
```

## 43. Current Implementation Status
- **WORKING:** Face detection, multi-pose enrollment, ArcFace recognition, ByteTrack tracking, 1-time attendance marking, continuous presence, subject/class CRUD, live session management, consolidated dashboard, mobile QR pairing, reports, manual overrides, audit logging.
- **PARTIAL:** Distributed multi-campus edge sync daemon.
- **PLANNED:** Active challenge-response 3D depth anti-spoofing, native mobile apps.

## 44. Known Limitations
1. **Extreme Head Poses ($> 35^\circ$):** Discarded by quality analyzer to prevent false match contamination.
2. **Low Illumination ($< 20$ lux):** Dim lighting triggers blur/contrast rejections.
3. **Browser Security:** Camera streaming requires HTTPS (or `localhost`).

## 45. Future Enhancements
- CUDA/TensorRT GPU acceleration for massive lecture auditoriums ($> 300$ students).
- Automated SMS/Email webhook notifications for consecutive absences.

## 46. Conclusion
**JOJIPA-SAMS** delivers an automated, high-precision Face Attendance Management System tailored for modern academic institutions. By replacing error-prone manual roll calls with an intelligent computer vision pipeline and an intuitive web dashboard, **JOJIPA-SAMS** ensures complete attendance integrity, eliminates proxy marking, and recovers valuable instructional time.
