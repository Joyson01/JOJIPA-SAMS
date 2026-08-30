# SAMS — Smart Attendance Management System

A modern, automated **AI Face Attendance Management System** designed for academic institutions. SAMS integrates computer vision pipelines (SCRFD face detection, ArcFace deep embedding extraction, 3D pose validation, texture liveness analysis, and ByteTrack continuous multi-face tracking) with a high-performance FastAPI backend, relational persistence, and a clean React + TypeScript management interface.

---

## Key Features

1. **Academic Hierarchy & Subject Management**
   - Manage real academic subjects (e.g. `CS401 Computer Networks`) and class sections (e.g. `CSE-4A`).
   - Prevent duplicate subject codes and classes across frontend, API, and database layers.
   - Soft-deactivation of subjects with historical sessions to preserve records.

2. **Consolidated Real-Time Dashboard**
   - **Top 5 Summary Metrics:** Total Students, Face Enrolled, Present Today, Absent Today, and Attendance Rate.
   - **Active Session Banner:** Live status indicator, elapsed time, camera source, and real-time roster counter.
   - **Today's Attendance Sessions:** Real-time present and absentee counters per class session.
   - **Live Camera Health:** Dynamic health states (`STREAMING`, `CONNECTED`, `NO_FRAME`, `OFFLINE`).
   - **Attendance Trends:** 14-day historical attendance progression.
   - **Recent Activity Feed:** Chronological log of attendance events, identity verifications, and audit trails.
   - **Needs Attention:** Actionable exception alerts for pending face enrollments, offline cameras, and low confidence matches.

3. **Multi-Angle Face Enrollment**
   - Real-time browser webcam capture with visual face landmark guidance.
   - Automatic quality, sharpness, illumination, and multi-pose (Front, Left, Right, Tilt) validation before embedding storage.

4. **Live Attendance & Continuous Presence Tracking**
   - Multi-face simultaneous detection in active classrooms.
   - **Mark Once, Track Continuously:** Marks attendance ONCE per student per session, transitioning into persistent presence tracking (`PRESENT_AND_VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `LEFT`, `RETURNED`).
   - Configurable session late threshold (e.g. 10 minutes).
   - Auto-population of absentees from enrolled class rosters upon session closure.
   - Manual override with approved excuse tracking and audit logging.

5. **Camera Management & Mobile Pairing**
   - Connect webcams, RTSP streams, and mobile smartphone cameras.
   - Pair any mobile phone camera in seconds via QR code pairing without authentication friction.
   - Hardware diagnostics and live stream test previews.

---

## System Requirements

- **Operating System:** Linux / macOS / Windows (WSL2 recommended)
- **Python:** Python 3.10+ (tested on Python 3.10 - 3.14)
- **Node.js:** Node.js v18.0.0+
- **Package Manager:** `pnpm` (or `npm`)
- **Hardware:** Webcam or smartphone with camera support

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "SAMS Mark-2"
```

### 2. Backend Setup (FastAPI & AI Engine)

1. Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install Python dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

3. Configure Environment Variables:
   Create a `.env` file in the root directory (or use default configuration):

```env
APP_NAME="SAMS"
DEBUG=true
PORT=8000
DATABASE_URL="sqlite+aiosqlite:///./data/sams_dev.db"
JWT_SECRET_KEY="sams-enterprise-production-secret-key-2026"
CORS_ORIGINS=["http://localhost:5173","https://localhost:5173"]
```

### 3. Frontend Setup (React + Vite + TypeScript)

1. Navigate to the `frontend` directory and install dependencies:

```bash
cd frontend
corepack enable
pnpm install
cd ..
```

---

## Running the Application

### 1. Start the FastAPI Backend Server

```bash
# From workspace root with .venv activated:
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API Server: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`

### 2. Start the Frontend Development Server

```bash
# In a new terminal tab:
cd frontend
pnpm run dev --host 0.0.0.0 --port 5173
```

- Admin Web Dashboard: `http://localhost:5173` (or `https://localhost:5173`)
- Mobile Camera Station: `https://<YOUR_LOCAL_IP>:5173/mobile-camera`

---

## Running Tests

Run the complete test suite (Unit, Integration, and AI Pipeline tests):

```bash
# Run all pytest tests (86 tests)
pytest -v

# Run unit tests
pytest tests/unit/ -v

# Run integration API tests
pytest tests/integration/ -v

# Run master end-to-end verification script
python scratch/test_complete_sams_e2e.py

# Run frontend build verification
cd frontend && pnpm run build
```

---

## Application Modules & Routes

| Module                | Route / Navigation | Description                                                                                                             |
| --------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**         | `/`                | 5 Top KPI cards, Active live session banner, Today's sessions, Camera health, Attendance trends, and Recent activities. |
| **Students**          | `students`         | Student registration, batch filters, roll number search, profile management.                                            |
| **Academic Setup**    | `subjects`         | Subjects CRUD (code, credits, semester, department) & Class Sections CRUD (`CSE-4A`).                                   |
| **Face Enrollment**   | `enrollment`       | Multi-pose face capture with live AI quality feedback & 512-dim ArcFace embedding generation.                           |
| **Live Attendance**   | `live`             | Real-time classroom attendance scanning with continuous presence tracking.                                              |
| **Attendance Roster** | `attendance`       | Session management, roster attendance tables, manual overrides, and excuse audits.                                      |
| **Cameras**           | `cameras`          | Camera device management, dynamic stream health status, and mobile QR pairing.                                          |
| **Reports**           | `reports`          | Institutional attendance analytics, defaulters list (<75%), and CSV export.                                             |
| **Mobile Camera**     | `/mobile-camera`   | Standalone mobile camera interface for wireless smartphone streaming.                                                   |

---

## License

Academic and Educational Use. Developed for Smart Attendance Management.
