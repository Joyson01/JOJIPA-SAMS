# JOJIPA-SAMS — System Architecture

## Smart Attendance Management System

**Document Version:** 1.0.0  
**Status:** Approved Architectural Specification

---

## 1. Executive Summary & Core Design Philosophy

The **JOJIPA-SAMS (Smart Attendance Management System)** is an enterprise-grade biometric attendance and automated identity verification platform designed for academic classrooms, lecture halls, campus gates, and corporate environments.

### Core Architectural Principle

A single face detected in a single video frame **MUST NEVER** directly trigger attendance. Production-grade recognition systems must handle real-world challenges: motion blur, poor lighting, extreme angles, glasses, masks, hand-to-face occlusion, photo spoofing, and identity ambiguity.

```
Camera / Mobile Stream
       ↓
Face Detection (SCRFD / RetinaFace)
       ↓
Multi-Face Tracking (ByteTrack / IoU Tracklet Association)
       ↓
Face Quality Assessment (Sharpness, Illumination, Size)
       ↓
Occlusion & Pose Visibility Assessment (Yaw, Pitch, Roll & Landmark Confidence)
       ↓
Face Alignment & Geometric Normalization (5 Fiducial Landmarks → 112×112)
       ↓
Embedding Generation (ArcFace 512-dim Feature Vector)
       ↓
Vector Similarity Search (pgvector HNSW Cosine Metric)
       ↓
Temporal Multi-Frame Verification (Sliding Window Tracklet Accumulation)
       ↓
Liveness / Anti-Spoof Verification (Texture & Landmark Dynamics)
       ↓
Classification: [ KNOWN | UNKNOWN | UNCERTAIN ]
       ↓
Attendance Engine (Session Eligibility, Duplicate Guard, Cooldown Filter)
       ↓
PostgreSQL Database + Audit Log
       ↓
Real-Time Dashboard & Exportable Reports
```

---

## 2. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["Client Layer"]
        M["Mobile Browser / Progressive Web App\n• Step-by-step Face Enrollment\n• Real-time Guidance Feedback\n• Mobile Self-Checkin"]
        D["Admin Web Dashboard\n• React + Vite + TypeScript\n• Real-time Live Camera View\n• Session & Student Management\n• Analytics, Reports, Manual Overrides"]
        E["Edge Camera Node\n• RTSP/CCTV / USB Webcam\n• OpenCV Ingestion Pipeline\n• Local Offline Event Buffer"]
    end

    subgraph Gateway["API & Communication Gateway"]
        Nginx["Nginx Reverse Proxy / Load Balancer"]
        WS["FastAPI WebSocket Stream Handler"]
        REST["FastAPI REST API v1"]
    end

    subgraph Backend["Application & AI Core"]
        Auth["Auth & RBAC Service\nJWT + Bcrypt"]
        StudentSvc["Student & Face Profile Service"]
        AttSvc["Attendance Engine & Session Manager"]
        ReportSvc["Reporting & Export Engine\nExcel / CSV / PDF"]
        SyncSvc["Offline Sync Manager\nConflict Resolution"]
        AuditSvc["Audit Logger"]

        subgraph AIEngine["AI Computer Vision Engine"]
            FD["Face Detector\nSCRFD ONNX"]
            FT["Face Tracker\nByteTrack / Kalman"]
            QA["Quality & Pose Analyzer"]
            FA["Face Aligner\n5-Point Affine"]
            FE["Embedding Generator\nArcFace ONNX (512-d)"]
            AS["Liveness Detector\nMiniFASNet ONNX"]
            MV["Temporal Multi-Frame Verifier"]
        end
    end

    subgraph DataLayer["Persistence & Storage Layer"]
        PG[("PostgreSQL 16 + pgvector\nStudents, Profiles, Sessions, Logs")]
        Cache[("In-Memory Embedding Index\nVectorized Matmul Cache")]
        ImgStore["Secure Local/S3 Storage\nEncrypted Enrollment Photos"]
        SQLite[("Edge Local SQLite Queue\nOffline Event Buffer")]
    end

    M -->|HTTPS REST / WebSockets| Nginx
    D -->|HTTPS REST / WebSockets| Nginx
    E -->|RTSP / WebSockets| Nginx
    E -.->|Offline Mode| SQLite

    Nginx --> WS
    Nginx --> REST

    WS --> AIEngine
    REST --> Auth
    REST --> StudentSvc
    REST --> AttSvc
    REST --> ReportSvc
    REST --> SyncSvc
    REST --> AuditSvc

    AIEngine --> MV
    MV --> AttSvc
    StudentSvc --> Cache
    StudentSvc --> PG
    StudentSvc --> ImgStore
    AttSvc --> PG
    AttSvc --> AuditSvc
    SyncSvc --> PG
    SQLite -.->|When Online Reconnected| SyncSvc
```

---

## 3. Technology Stack Justification

| Layer                      | Selected Technology                               | Version / Specification                              | Rationale & Alternatives Considered                                                                                                                                            |
| :------------------------- | :------------------------------------------------ | :--------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend Framework**      | **FastAPI**                                       | 0.115+ (Python 3.10-3.14)                            | High async I/O throughput, native OpenAPI docs, Pydantic v2 data validation, built-in WebSocket support. Superior to Django/Flask for real-time AI endpoints.                  |
| **Database**               | **PostgreSQL + pgvector**                         | PostgreSQL 16, pgvector 0.7+                         | Enterprise ACID compliance, relational integrity for sessions/students, native HNSW indexing for 512-d vectors. Eliminates separate vector DB overhead (e.g. Milvus/Pinecone). |
| **ORM & Migrations**       | **SQLAlchemy 2.0 + Alembic**                      | Async Engine                                         | Type-safe queries, migration reproducibility across staging/production environments.                                                                                           |
| **Frontend Framework**     | **React + TypeScript + Vite**                     | React 18/19, Vite 5+, TS 5+                          | Fast build times, strong type safety, reactive canvas/webcam processing, component modularity.                                                                                 |
| **UI Styling**             | **Tailwind CSS + Lucide Icons**                   | Tailwind 3.4+                                        | Modern responsive utility classes, zero runtime overhead, mobile-first design for enrollment.                                                                                  |
| **Face Detection**         | **SCRFD (Sample and Computation Redistribution)** | ONNX Runtime (`scrfd_500m_bnkps` / `scrfd_2.5g_kps`) | Real-time multi-scale detection (10ms on CPU), highly robust to side poses, outputs 5 precise fiducial facial landmarks. Outperforms MTCNN and standard Haar Cascades.         |
| **Face Embedding**         | **ArcFace (ResNet50 / MobileFaceNet)**            | 512-dimensional output, ONNX Runtime                 | State-of-the-art Angular Margin Loss embedding space with high inter-class separation and intra-class compactness. Open license, CPU & GPU inference ready.                    |
| **Face Tracking**          | **ByteTrack (Kalman Filter + IoU/ReID)**          | Custom Lightweight Python implementation             | Preserves low-confidence detections across occluded frames, prevents track fragmentation, associates continuous face trajectories.                                             |
| **Liveness / Anti-Spoof**  | **MiniFASNet (Silent-Face-Anti-Spoofing)**        | Multi-scale Fourier + Texture ONNX                   | Passive single-frame and multi-frame anti-spoofing; detects 2D print attacks, tablet/screen playback attacks with minimal latency overhead.                                    |
| **In-Memory Cache**        | **NumPy Vectorized Matrix**                       | Float32 $N \times 512$ Matrix                        | Single vectorized matrix multiplication (`Q @ M.T`) executes cosine similarity for 10,000 students in $< 1.2\text{ ms}$ on standard CPU.                                       |
| **Deployment / Container** | **Docker & Docker Compose**                       | Multi-stage Dockerfiles                              | Reproducible environment, isolated dependencies, pgvector support out-of-the-box.                                                                                              |

---

## 4. Subsystem Architectures

### 4.1 Frontend Architecture (Admin Dashboard & Mobile Enrollment)

The web application is structured as a unified Responsive Single Page Application (SPA):

1. **Mobile Enrollment PWA:**
   - Designed for standard smartphone browsers (Chrome, Safari, Firefox).
   - Real-time video frame analysis directly on canvas.
   - Intelligent visual guidance prompts: _"Move closer"_, _"Turn slightly left"_, _"Lighting too dark"_, _"Hold steady"_.
   - Captures 5 to 10 calibrated samples across varying yaw angles ($\pm 15^\circ$), pitch angles ($\pm 10^\circ$), and lighting conditions.
2. **Admin & Faculty Dashboard:**
   - **Live Attendance Monitor:** Multi-camera grid with bounding box overlays, track IDs, recognized names, and live attendance badges.
   - **Session Manager:** Create and control active attendance sessions with custom timeframes, subjects, and room bindings.
   - **Student Directory:** Searchable table with enrollment status, face sample preview, manual re-enrollment, and student detail drawers.
   - **Reports & Analytics:** Attendance graphs, monthly aggregates, student percentage trackers, CSV/Excel/PDF export.
   - **Manual Attendance Correction:** Audit-backed override interface to correct mistaken attendance with admin remarks.
   - **Camera Management:** Configure RTSP URLs, webcam devices, and monitor FPS/health status.

### 4.2 Backend Architecture & Service Separation

The backend follows strict **Clean Architecture** with separation of concerns:

- `api/v1/`: Routing layer containing HTTP REST endpoints and WebSocket stream handlers.
- `schemas/`: Pydantic request/response validation schemas.
- `models/`: SQLAlchemy ORM database models.
- `services/`: Business logic layer (`StudentService`, `AttendanceService`, `SessionService`, `ReportService`, `AuditService`).
- `ai/`: Independent AI computer vision modules with unified interfaces.
- `core/`: Application settings, security utilities (JWT, password hashing), and structured logging.
- `database/`: Database engine, connection pooling, and session management.

---

## 5. End-to-End Data Flow

### 5.1 Face Enrollment Flow

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student / Mobile User
    participant App as Mobile Web App (Canvas)
    participant API as FastAPI Backend (/enroll)
    participant AI as AI Vision Pipeline
    participant DB as PostgreSQL (pgvector)
    participant Storage as Encrypted Disk Storage

    Student->>App: Opens Mobile Enrollment URL
    App->>App: Requests Camera Permission & Streams Video
    loop Sample Capture Loop (5-10 Valid Samples)
        App->>API: POST /students/{id}/enroll/sample (JPEG Frame)
        API->>AI: Detect Face + Check Quality + Estimate Pose
        alt Quality Poor (Blurry / Dark / Multiple Faces)
            AI-->>API: Rejected (Reason: "Image Blurry" or "Face Too Small")
            API-->>App: { status: "retry", guidance: "Hold still and face camera" }
            App-->>Student: Displays Guidance Banner
        else Quality Good & Pose Unique
            AI->>AI: Align 5-Landmarks & Generate 512-d ArcFace Embedding
            AI-->>API: Valid Sample Accepted (Quality: 0.92, Pose: "left_15")
            API->>Storage: Store Encrypted Reference Image
            API-->>App: { status: "accepted", samples_collected: N, required: 8 }
            App-->>Student: Displays Checkmark & Updates Progress Bar
        end
    end
    Student->>App: Clicks "Complete Enrollment"
    App->>API: POST /students/{id}/enroll/complete
    API->>DB: Insert FaceProfile records (512-d embeddings + quality scores)
    API->>API: Rebuild In-Memory Embedding Matrix Cache
    API-->>App: Enrollment Completed Successfully
```

### 5.2 Real-Time Attendance Stream & Decision Flow

```mermaid
sequenceDiagram
    autonumber
    participant Cam as CCTV / Camera Stream
    participant WS as WebSocket / Ingestion Worker
    participant Track as ByteTrack Multi-Face Tracker
    participant AI as Quality, Alignment & ArcFace Model
    participant Cache as In-Memory Embedding Matrix
    participant Verifier as Temporal Multi-Frame Verifier
    participant AntiSpoof as Liveness / Anti-Spoof Detector
    participant Engine as Attendance Decision Engine
    participant DB as PostgreSQL Database

    Cam->>WS: Sends Video Frame (Frame #K)
    WS->>Track: Update Tracker with Detections
    Track-->>WS: Active Tracklets: [ Track_101, Track_102 ]

    loop For Each Active Tracklet
        WS->>AI: Evaluate Face Quality & Occlusion
        alt Face Occluded or Poor Quality
            AI-->>Verifier: Skip Frame, Preserve Tracklet State
        else Face Clear & Sizable
            AI->>AI: Align Face (112x112) -> Extract 512-d Embedding
            AI->>Cache: Vector Cosine Similarity (1xN @ Nx512)
            Cache-->>AI: Best Match: Student_ID "S104", Sim: 0.88
            AI->>AntiSpoof: Run Liveness Classifier
            AntiSpoof-->>AI: Liveness Score: 0.96 (Real Face)
            AI->>Verifier: Append Evidence (Track_101, "S104", Sim=0.88, Live=0.96)

            Verifier->>Verifier: Check Temporal Threshold (e.g. 4 of 6 consecutive frames)
            alt Threshold Satisfied (Confidence >= 0.75, Consistency >= 80%)
                Verifier->>Engine: Identity Confirmed ("S104", High Confidence)
                Engine->>DB: Check Duplicate Attendance for Current Session
                alt Not Marked Yet
                    Engine->>DB: Insert AttendanceRecord (Status="PRESENT", Timestamp=Now)
                    Engine-->>WS: Broadcast Event: "S104 Marked PRESENT"
                else Already Marked
                    Engine-->>WS: Broadcast Event: "S104 Already PRESENT (Skipped)"
                end
            else Insufficient Frames
                Verifier-->>WS: State: "UNCERTAIN / ACCUMULATING"
            end
        end
    end
```

---

## 6. Resilience, Security, and Offline Architecture

### 6.1 Biometric Privacy & Protection

- **No Raw Vector Exfiltration:** Embeddings are treated as irreversible mathematical hash representations of facial geometry.
- **Image Storage Encryption:** Enrollment reference photos are stored with AES-256 encryption on disk with restricted POSIX file permissions.
- **Role-Based Access Control (RBAC):**
  - `ADMIN`: Full CRUD on students, sessions, cameras, face templates, and manual overrides.
  - `FACULTY`: View sessions, trigger session attendance, view class reports, submit attendance adjustments.
  - `STUDENT`: View own attendance records and enrollment status.
- **Audit Logging:** Every manual attendance modification, student deletion, or face re-enrollment writes an immutable audit record containing `user_id`, `timestamp`, `ip_address`, `old_value`, and `new_value`.

### 6.2 Edge & Offline Synchronization

When internet/backend connectivity drops at a classroom camera station:

1. The Edge Ingestion client logs attendance events locally to a lightweight SQLite database (`sync_queue`).
2. An event contains: `event_uuid`, `session_id`, `student_id`, `camera_id`, `first_seen`, `confidence`, `snapshot_hash`.
3. When network connectivity resumes, the edge node triggers `POST /api/v1/sync/push`.
4. The server processes the queue with **idempotent deduplication**, ensuring that no student receives duplicate attendance even if synchronization packets are retransmitted.

---

## 7. Architectural Risk Analysis & Mitigations

| Identified Risk                                    | Potential Impact                          | Architectural Mitigation Strategy                                                                                                                                        |
| :------------------------------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High CPU usage on multi-face classroom streams** | Dropped frames, lag in UI                 | Interleaved pipeline: Detect faces every $N=3$ frames; use lightweight IoU/Kalman tracking on intermediate frames. Run recognition only on high-quality track keyframes. |
| **Partial Occlusion (Masks, Glasses, Hands)**      | False Rejection or Mistaken Identity      | Occlusion analyzer flags partial visibility; identity decision is held in `UNCERTAIN` state until a clear unoccluded frame is tracked.                                   |
| **Photo / Screen Spoof Attacks**                   | Fraudulent Attendance                     | Dual-stage anti-spoofing (Fourier frequency analysis + MiniFASNet ONNX) integrated before temporal verification.                                                         |
| **Duplicate Attendance in High-Traffic Doors**     | Cluttered logs, database write contention | Session-level uniqueness constraints in PostgreSQL + In-memory session presence sets (`marked_today`).                                                                   |
| **Network Drops in Rural / Edge Campuses**         | Lost attendance records                   | Local SQLite offline queue with automatic exponential backoff retry and idempotent sync API.                                                                             |
