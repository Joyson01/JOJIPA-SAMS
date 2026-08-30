# JOJIPA-SAMS
## Smart Attendance Management System

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-100%20passed-success)]()
[![Backend](https://img.shields.io/badge/FastAPI-0.115+-blue)]()
[![Frontend](https://img.shields.io/badge/React-18.3+-61dafb)]()
[![AI Engine](https://img.shields.io/badge/InsightFace-ArcFace-orange)]()

---

## 1. Overview

**JOJIPA-SAMS** is an automated, AI-powered Face Attendance Management System engineered for colleges and university classrooms. It replaces manual roll calls and sign-in sheets with continuous multi-face recognition, 3-level duplicate protection, temporal track verification, automated absentee reconciliation, and seamless academic timetable synchronization.

---

## 2. Key Features

- **Multi-Source Camera Ingestion:**
  - **Hardware Webcams:** Native USB and laptop webcams.
  - **Mobile Camera Stations:** Zero-friction QR code pairing allowing any smartphone to stream live video to the laptop over secure WebSockets.
  - **CCTV / RTSP IP Feeds:** Direct integration with network surveillance cameras with non-blocking stream workers.
  - **Media Attendance:** Batch processing of high-resolution classroom photos (Image Attendance) and recorded lecture videos (Video Attendance).
- **Official Weekly Timetable Grid:**
  - Real 8-period $\times$ 5-day collegiate schedule for Department of Computer Engineering (Class `TE-B`, Effective From: `15/06/2026`).
  - Concurrent multi-batch rendering (`B1` and `B2`) within the same grid cell with one-click session creation.
- **Robust AI Recognition Pipeline:**
  - **SCRFD-10G:** High-precision multi-face detection with 5-point landmark localization.
  - **Umeyama Affine Alignment:** 5-point facial normalization to canonical $112 \times 112$ crops.
  - **ArcFace ResNet-50:** 512-dimensional $L_2$-normalized biometric feature embeddings.
  - **ByteTrack Multi-Target Tracking:** Kalman filter bounding box state tracking with occlusion resilience.
  - **Sliding-Window Temporal Verification:** Multi-frame consensus voting (4/7 frames) to eliminate false detections.
- **Strict 3-Level Duplicate Protection:**
  - Enforces `UNIQUE(session_id, student_id)`. Continuous sightings update presence telemetry without duplicate database records.
- **Presence State Machine:**
  - Real-time tracking of `VISIBLE`, `TEMPORARILY_NOT_VISIBLE`, `RETURNED`, and `LEFT` states.
- **Academic Hierarchy & Defaulters Analytics:**
  - Accredited courses (`24CSPC501C`, `24CSPC502C`, `24MDM501XC`, `24OE501XC`, `24VSE501C`), classes, batch assignments, attendance thresholds ($75\%$), and RFC-4180 CSV export.

---

## 3. Technology Stack

- **Frontend:** React 18.3.1, TypeScript 5.6.3, Vite 5.4.8, Tailwind CSS 3.4.13, Lucide React, Axios, QRCode
- **Backend:** FastAPI 0.115+, Python 3.10+, Uvicorn, SQLAlchemy 2.0 (AsyncIO), Pydantic v2, PyJWT, Bcrypt
- **Computer Vision & AI:** InsightFace 0.7.3 (`buffalo_l`), SCRFD-10G, ArcFace (ResNet-50), ONNX Runtime 1.18+, OpenCV 4.10+, NumPy, SciPy
- **Databases:** SQLite 3 (Async via `aiosqlite`) for local development; PostgreSQL 16+ for enterprise production
- **Testing:** Pytest 8.2+, Pytest-AsyncIO (100 automated tests passing)

---

## 4. Quick Start (One-Click Launch)

### Step 1: Clone Repository and Install Dependencies
```bash
git clone https://github.com/Joyson01/SAMS.git
cd "SAMS Mark-2"

# 1. Setup Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 2. Setup Frontend dependencies
cd frontend
pnpm install
cd ..

# 3. Import Official TE-B Academic Timetable
python3 scripts/import_teb_timetable.py
```

### Step 2: Start All Services
```bash
# Starts FastAPI Backend (Port 8000) and React HTTPS Frontend (Port 5173)
./start.sh
```

### Step 3: Stop Services
```bash
./scripts/stop.sh
```

---

## 5. Application Access Points

- **Administrative Web App:** `https://localhost:5173`
- **Mobile Camera Capture Station:** `https://<YOUR_LOCAL_IP>:5173/mobile-camera`
- **FastAPI Documentation (Swagger UI):** `http://localhost:8000/docs`
- **System Health Probe:** `http://localhost:8000/health`

---

## 6. Camera & Mobile Setup Guide

### 6.1 Hardware / Laptop Webcam
1. Navigate to **Cameras** and click **Add Camera** $\to$ **Hardware Webcam**.
2. Select the webcam in **Live Attendance** to begin scanning.

### 6.2 Mobile Phone Camera (Phone as Camera Station)
1. Ensure laptop and smartphone are connected to the **same Wi-Fi network**.
2. On laptop, open **Cameras** $\to$ click **Add Camera** $\to$ **Mobile Phone**.
3. Click **Generate QR Code**.
4. Scan the QR code with your phone camera to open `https://<LOCAL_IP>:5173/mobile-camera`.
5. On the phone browser, accept the camera permission prompt and tap **Start Camera**.
6. On laptop, select the mobile camera in **Live Attendance** to view the live phone stream.

### 6.3 CCTV / RTSP IP Stream
1. In **Cameras**, click **Add Camera** $\to$ **CCTV / RTSP**.
2. Provide stream URL (e.g. `rtsp://admin:password@192.168.1.50:554/h264`).
3. SAMS spawns a non-blocking background worker to ingest and decode the stream.

### 6.4 Media Attendance (Image & Video)
1. In the sidebar, select **Media Attendance**.
2. Choose **Image Attendance** (upload group classroom photos) or **Video Attendance** (upload pre-recorded lecture MP4/AVI files).
3. Select the target attendance session and click **Analyze**. Attendance records are automatically linked with source tags (`MEDIA_IMAGE` or `MEDIA_VIDEO`).

---

## 7. Automated Testing & Verification

Run the comprehensive automated test suite (100 tests):

```bash
# Run full Pytest suite
./.venv/bin/pytest

# Build frontend to verify TypeScript compilation
pnpm --prefix frontend build
```

---

## 8. Real-World Limitations

- **Passive Liveness on Static Photos:** Single still photos cannot establish continuous dynamic liveness.
- **Extreme Pose Angles:** Head rotations $> 55^\circ$ Yaw or $> 45^\circ$ Pitch lack sufficient bilateral landmark visibility and are filtered by the quality analyzer.
- **Low Illumination:** Ambient brightness $< 40.0$ intensity triggers quality rejections.
- **Wi-Fi Bandwidth:** Mobile phone streaming requires adequate local wireless bandwidth for stable video frame transmission.

---

## 9. Technical Project Report

For deep architectural documentation, mathematical algorithm breakdowns, ER diagrams, and API tables, refer to [`PROJECT_REPORT.md`](file:///home/joyson/Documents/SAMS%20Mark-2/PROJECT_REPORT.md).

---

## 10. License

Academic & Educational Use. Developed for JOJIPA-SAMS — Smart Attendance Management System.
