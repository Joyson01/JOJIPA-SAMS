# JOJIPA-SAMS
## Smart Attendance Management System

---

## 1. Overview
**JOJIPA-SAMS** is an automated, AI-powered Face Attendance Management System engineered for educational institutions, colleges, and university lecture halls. It replaces error-prone manual roll calls with continuous multi-face recognition, passive liveness verification, automated absent reconciliation, and real-time attendance tracking.

## 2. Problem
Higher education institutions face persistent challenges in attendance tracking:
- **Lost Instructional Time:** Manual roll calls consume 10–20% of lecture time in halls of 40–120 students.
- **Proxy Attendance (Buddy Punching):** Sign-in sheets and proximity RFID cards are easily shared.
- **Delayed Intervention:** Delayed attendance compilation prevents timely counseling for at-risk students.
- **Hardware Friction:** Fixed biometric door scanners cause hallway congestion and cannot track classroom presence dynamically.

## 3. Solution
JOJIPA-SAMS provides an end-to-end intelligent visual attendance platform:
- Scans active classrooms in real-time using standard webcams, wireless smartphone cameras, or RTSP streams.
- **Separates Recognition from Attendance:** Performs continuous video recognition and presence tracking while guaranteeing exactly **ONE** attendance record per student per session.
- Automatically marks unrecorded students as `ABSENT` upon session finalization.
- Provides immediate auditability with faculty manual overrides and institutional analytics.

## 4. Features
- **Consolidated Dashboard:** 5 KPI summary cards (Students, Enrolled, Present Today, Absent Today, Rate), Active Live Session banner, Today's sessions table, Camera stream health, 14-day trends, Recent activity logs, and Actionable exception alerts.
- **Academic Hierarchy:** Dedicated management for Subjects (`CS401 Computer Networks`) and Class Sections (`CSE-4A`) with duplicate prevention.
- **Multi-Pose Face Enrollment:** 5-angle biometric capture (Front, Left 15°, Right 15°, Tilt Up, Tilt Down) with real-time pose and Laplacian quality validation.
- **Continuous Classroom Presence Tracking:** Real-time multi-face bounding boxes with status pills (`KNOWN`, `UNCERTAIN`, `UNKNOWN`) and dynamic presence states (`VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `LEFT`, `RETURNED`).
- **Flexible Camera Integration:** Support for USB Webcams, RTSP Security Streams, and Smartphone Cameras via zero-friction QR code pairing.
- **Institutional Analytics:** Defaulter identification (<75% attendance threshold) and RFC-4180 CSV report export.

## 5. Architecture
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

## 6. Technology Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend:** FastAPI, Python 3.10+, Uvicorn, SQLAlchemy 2.0 (AsyncIO), Pydantic v2, PyJWT, Bcrypt
- **Computer Vision & AI:** InsightFace, SCRFD-10G, ArcFace (ResNet-50), OpenCV, ONNX Runtime, ByteTrack
- **Databases:** PostgreSQL 16 + pgvector (Production) / SQLite (aiosqlite for Local Dev)
- **Containerization:** Docker, Docker Compose

## 7. Requirements
- **Operating System:** Linux / macOS / Windows (WSL2 recommended)
- **Python:** Version 3.10 or higher
- **Node.js:** Version 18.0.0 or higher
- **Package Manager:** `pnpm` (or `npm`)
- **Camera:** Standard USB Webcam or Smartphone with browser camera support

## 8. Project Structure
```
JOJIPA-SAMS/
│
├── start.sh                 # Root One-Click Full-Stack Launcher
├── start.bat                # Windows Full-Stack Launcher
├── scripts/
│   ├── setup.sh             # One-time environment & dependency setup
│   ├── start.sh             # Background service orchestration & health checks
│   ├── stop.sh              # Clean graceful service shutdown
│   ├── status.sh            # Live component health diagnostic
│   └── seed_demo.py         # Optional manual database seeder
│
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST route controllers
│   │   ├── core/            # Config, security, logging, exceptions
│   │   ├── database/        # Async SQLAlchemy session and base
│   │   ├── models/          # Relational entities (Student, Subject, Session, etc.)
│   │   ├── schemas/         # Pydantic v2 validation models
│   │   └── services/        # Business logic (Attendance, Dashboard, AI, Camera)
│   ├── alembic/             # Database migration scripts
│   └── main.py              # Application entry point
│
├── ai_engine/
│   ├── detection/           # SCRFD-10G ONNX face detector
│   ├── alignment/           # 5-point affine transformation aligner
│   ├── recognition/         # ArcFace ResNet-50 embedding generator & cosine matcher
│   ├── tracking/            # ByteTrack multi-target Kalman filter
│   ├── quality/             # Blur, illumination, and 3D head pose estimators
│   └── liveness/            # Fourier texture & chromatic anti-spoofing
│
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI widgets (Header, Sidebar, Badges)
│   │   ├── features/        # Feature modules (Attendance, Subjects, Cameras, etc.)
│   │   ├── pages/           # Primary page views (DashboardOverview)
│   │   ├── services/        # Axios API clients
│   │   └── types/           # TypeScript interfaces
│   ├── public/              # Static assets
│   └── package.json         # Frontend dependencies & build scripts
│
├── tests/
│   ├── fixtures/            # Test fixture assets
│   ├── unit/                # 28 isolated mathematical & service unit tests
│   └── integration/         # 10 comprehensive REST API integration tests
├── .env.example             # Documented environment template
├── docker-compose.yml       # Production multi-container composition
├── README.md                # System documentation
└── PROJECT_REPORT.md        # 46-section technical engineering report
```

## 9. Quick Start (One-Click Launch)

### Step 1: Clone and Run Initial Setup
```bash
git clone https://github.com/Joyson01/SAMS.git
cd SAMS

# Run automated one-time dependency and environment configuration
./scripts/setup.sh
```

### Step 2: Start Full Stack
```bash
# Starts Database, Backend API, and Frontend Dev Server with live health verification
./start.sh
```

### Utility Commands
```bash
# Check service health & diagnostics
./scripts/status.sh

# Stop all services cleanly
./scripts/stop.sh
```

---

## 10. Manual Installation & Custom Setup
If you prefer configuring services step-by-step manually:
```bash
# 1. Setup Python Virtual Environment
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt

# 2. Setup Frontend Dependencies
cd frontend
corepack enable
pnpm install
cd ..
```

## 10. Environment Setup
Create a `.env` file in the root directory from the provided template:
```bash
cp .env.example .env
```
Default parameters in `.env`:
```env
APP_NAME="JOJIPA-SAMS"
DEBUG=true
PORT=8000
DATABASE_URL="sqlite+aiosqlite:///./data/sams_dev.db"
SECRET_KEY="jojipa-sams-super-secret-jwt-key-change-in-production-2026"
CORS_ORIGINS=["http://localhost:5173","https://localhost:5173"]
```

## 11. Database Setup
Development mode uses SQLite with automated table initialization on startup.
For production PostgreSQL with pgvector:
```bash
docker-compose up -d postgres
alembic -c backend/alembic.ini upgrade head
```
*(Optional: Run `python -m scripts.seed_demo` if you wish to populate initial demo data).*

## 12. Running Backend
```bash
.venv/bin/python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Server: `http://localhost:8000`
- Interactive Swagger Documentation: `http://localhost:8000/docs`
- Health Liveness Probe: `http://localhost:8000/health`

## 13. Running Frontend
```bash
cd frontend
corepack pnpm run dev --host 0.0.0.0 --port 5173
```
- Desktop Administrative Web App: `https://localhost:5173`
- Wireless Mobile Camera Station: `https://<YOUR_LOCAL_IP>:5173/mobile-camera`

## 14. Face Enrollment
1. Navigate to **Students** and click **Add Student** to create a profile (Roll Number, First/Last Name, Email, Department, Class).
2. Click **Enroll Face** next to the student profile.
3. Allow browser webcam access.
4. Follow the on-screen landmark guide to capture 5 distinct poses: Frontal, Left 15°, Right 15°, Tilt Up, and Tilt Down.
5. The system extracts 512-dimensional ArcFace embeddings and verifies sample quality before marking the student as `ENROLLED`.

## 15. Live Attendance
1. In the sidebar, select **Live Attendance**.
2. Select an active attendance session and camera feed.
3. Click **Start Scanning**.
4. Real-time bounding boxes display student identities, match confidence, and presence status.

## 16. Camera Setup
Navigate to **Cameras** in the sidebar. SAMS supports:
- **Webcam:** Native USB / integrated cameras.
- **RTSP Streams:** IP cameras via RTSP URL (`rtsp://username:password@ip:port/stream`).
- **Video Files:** Pre-recorded MP4/AVI videos for testing and batch auditing.

## 17. Mobile Camera Setup (Phone as a Camera)
1. Connect your computer and smartphone to the **same Wi-Fi network**.
2. Open `https://<YOUR_COMPUTER_IP>:5173` on your desktop.
3. In **Cameras**, click **Add Mobile Camera** and select **Generate QR Code**.
4. Scan the QR code with your smartphone.
5. On the phone browser, accept the camera permission prompt and tap **Start Camera**.
6. Select this smartphone in **Live Attendance** to begin classroom scanning.

## 18. Subject and Class Setup
1. In **Subjects**, create academic subjects (e.g. Code: `CS401`, Name: `Computer Networks`, Department: `Computer Science`, Credits: `4`).
2. In the same view, create Class Sections (e.g. Name: `CSE-4A`, Department: `Computer Science`, Year: `4`, Semester: `4`, Section: `A`).
3. Sessions and students will now bind directly to these validated entities.

## 19. Attendance Workflow
- **First Verified Sighting:** When a student is verified, the system marks them `PRESENT` (or `LATE` if arrival exceeds late grace period).
- **Subsequent Sightings:** Continuous video recognition updates the in-memory presence manager (`PRESENT_AND_VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `LEFT`, `RETURNED`) without writing redundant database rows.
- **Session Closure:** When the faculty ends the session, enrolled students who were not detected are automatically marked `ABSENT`.

## 20. Reports & Analytics
- Navigate to **Reports** to view real-time department analytics, session rosters, and average attendance rates.
- Isolate students below the $75.0\%$ attendance threshold in the **Defaulters List**.
- Click **Export CSV** to download RFC-4180 compliant attendance spreadsheets.

## 21. Testing
Run the complete automated test suite:
```bash
# 1. Run all 86 unit and integration tests
pytest -v

# 2. Run master 18-step end-to-end acceptance script
python scratch/test_complete_sams_e2e.py

# 3. Build frontend bundle
cd frontend && pnpm run build
```

## 22. Troubleshooting
- **Black Video Preview / Camera Denied:** Ensure you are accessing the application via `https://` (or `localhost`). Modern browsers block camera access on unencrypted `http://` IP connections.
- **Mobile Camera Cannot Connect:** Verify your smartphone is on the same local Wi-Fi subnet and firewall port 5173/8000 is open.
- **Low Match Confidence:** Ensure adequate classroom illumination and verify that the student completed multi-pose enrollment.

## 23. Known Limitations
- **Extreme Yaw/Pitch Head Angles ($> 35^\circ$):** Faces turned away from the camera are discarded by the quality filter.
- **Low Illumination ($< 20$ lux):** Dimly lit rooms may trigger blur/contrast rejections.
- **Network Latency:** Weak Wi-Fi signals may reduce mobile video streaming frame rates from 15 FPS to 3–5 FPS.

## 24. Future Scope
- CUDA / TensorRT GPU execution providers for high-density lecture halls ($> 300$ students).
- Active challenge-response 3D depth anti-spoofing prompts for self-service portals.
- Automated SMS and Email webhook notifications for parent/guardian attendance alerts.

## 25. Security & Privacy
- **Biometric Protection:** Raw facial images are never stored as biometric credentials. Only mathematical vector arrays ($\mathbb{R}^{512}$) are persisted.
- **Password Hashing:** Passwords use salted `bcrypt`.
- **Stateless Tokens:** JWT HS256 tokens with configurable expiration claims.
- **Audit Trails:** Faculty manual overrides and profile changes are immutably logged in `audit_logs`.

## 26. License
Academic & Educational Use. Developed for JOJIPA-SAMS — Smart Attendance Management System.
