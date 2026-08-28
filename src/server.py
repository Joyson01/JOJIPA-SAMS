import argparse
import asyncio
import json
import os
import socket
import tempfile
import time
from datetime import date, datetime
from pathlib import Path
import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, PlainTextResponse
from insightface.app import FaceAnalysis

import attendance_db

PROJECT_DIR = Path(__file__).resolve().parent.parent
EMBEDDINGS_PATH = PROJECT_DIR / "embeddings" / "student_embeddings.npy"
REGISTRATION_SAMPLES = 5
MIN_SAMPLE_INTERVAL_SECONDS = 0.35
MIN_FACE_WIDTH_PIXELS = 80
MIN_DETECTION_CONFIDENCE = 0.60
MATCH_THRESHOLD = 0.4
MAX_FRAME_BYTES = 2 * 1024 * 1024

app = FastAPI(title="SAMS 3D Face Scanner & Recognition Server")

# Determine a writeable InsightFace root directory
insightface_root = os.path.expanduser("~/.insightface")
try:
    os.makedirs(insightface_root, exist_ok=True)
    test_file = Path(insightface_root) / ".write_test"
    test_file.touch()
    test_file.unlink()
except (OSError, PermissionError):
    insightface_root = str(PROJECT_DIR / ".insightface")
    print(f"Default home directory read-only; falling back to local root: {insightface_root}")

# Initialize FaceAnalysis
face_app = FaceAnalysis(
    name="buffalo_l",
    root=insightface_root,
    providers=["CPUExecutionProvider"],
)
face_app.prepare(
    ctx_id=-1,
    # The client already downsamples every frame to <=320px on its longest
    # side before sending it (see sendFrame() in the HTML client below), so a
    # 640x640 detector input just pads the real image with black and wastes
    # ~4x the compute for zero extra resolution. Matching det_size to the
    # actual incoming frame size is the single biggest CPU win available here.
    det_size=(320, 320),
)

def normalize_embedding(embedding: np.ndarray) -> np.ndarray | None:
    """Return a unit-length, float32 embedding or None for unusable input."""
    try:
        vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
    except (TypeError, ValueError):
        return None
    if vector.size == 0 or not np.all(np.isfinite(vector)):
        return None

    norm = np.linalg.norm(vector)
    if norm == 0:
        return None
    return vector / norm


def load_embeddings() -> dict[str, np.ndarray]:
    """Load only valid entries, so a bad record cannot break recognition."""
    if not EMBEDDINGS_PATH.is_file():
        print("No embeddings database found. New registrations will create it.")
        return {}

    try:
        stored_embeddings = np.load(EMBEDDINGS_PATH, allow_pickle=True).item()
        if not isinstance(stored_embeddings, dict):
            raise ValueError("database does not contain a dictionary")

        embeddings = {}
        for name, embedding in stored_embeddings.items():
            if not isinstance(name, str):
                continue
            normalized = normalize_embedding(embedding)
            if normalized is not None:
                embeddings[name] = normalized

        print(f"Loaded {len(embeddings)} student embeddings from database.")
        return embeddings
    except Exception as error:
        print(f"Warning: Could not load embeddings database: {error}")
        return {}


def save_embeddings(embeddings: dict[str, np.ndarray]) -> None:
    """Atomically replace the database, preserving the old file on a failed save."""
    EMBEDDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=EMBEDDINGS_PATH.parent, prefix=".student_embeddings-", delete=False
        ) as temporary_file:
            temp_path = temporary_file.name
            np.save(temporary_file, embeddings, allow_pickle=True)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temp_path, EMBEDDINGS_PATH)
    except Exception:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        raise


def lan_ip_address() -> str | None:
    """Return the address other devices on the local network can use."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            # No traffic is sent; connect only asks the OS which route it would use.
            connection.connect(("10.255.255.255", 1))
            address = connection.getsockname()[0]
        return address if address != "127.0.0.1" else None
    except OSError:
        return None


def enrollment_quality_message(face) -> str | None:
    """Return guidance when a frame should not be used for enrollment."""
    bbox = face.bbox
    face_width = float(bbox[2] - bbox[0])
    if face_width < MIN_FACE_WIDTH_PIXELS:
        return "Move closer so your face fills more of the frame."

    try:
        confidence = float(getattr(face, "det_score", 1.0))
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence < MIN_DETECTION_CONFIDENCE:
        return "Improve the lighting and keep your face facing the camera."
    return None


attendance_db.init_db()

# student_embeddings: {eid: unit-normalized embedding}. Keying by EID (not
# name) means two students who share a name can never collide or overwrite
# each other's face template.
student_embeddings = load_embeddings()

# Recognition runs once per incoming frame (~12x/sec per connected phone), so
# rebuilding a Python-level structure for it on every frame is wasted work.
# _embedding_matrix / _embedding_eids are a cache of student_embeddings laid
# out for a single vectorized matmul instead of a per-student Python loop.
# They're rebuilt only when the underlying dict actually changes (on
# registration), not on every frame.
_embedding_matrix: np.ndarray | None = None
_embedding_eids: list[str] = []


def rebuild_embedding_index(embeddings: dict[str, np.ndarray]) -> None:
    """Recompute the stacked embedding matrix used for similarity search."""
    global _embedding_matrix, _embedding_eids
    if embeddings:
        _embedding_eids = list(embeddings.keys())
        _embedding_matrix = np.stack([embeddings[eid] for eid in _embedding_eids]).astype(np.float32)
    else:
        _embedding_eids = []
        _embedding_matrix = None


rebuild_embedding_index(student_embeddings)

# student_names: {eid: display name}, kept in sync with the SQLite students
# table so recognition responses can show a name without a DB hit per frame.
student_names: dict[str, str] = attendance_db.get_all_students()
# marked_today: {eid: "HH:MM:SS"} for students already marked present today.
# Rebuilt from SQLite at startup so a server restart can't create duplicate
# same-day attendance rows.
marked_today: dict[str, str] = attendance_db.get_attendance_for_date(date.today())
marked_today_date: date = date.today()

embedding_db_lock = asyncio.Lock()
attendance_lock = asyncio.Lock()


def refresh_marked_today_if_new_day() -> None:
    """Reset the same-day attendance cache when the calendar date rolls over."""
    global marked_today, marked_today_date
    today = date.today()
    if today != marked_today_date:
        marked_today = attendance_db.get_attendance_for_date(today)
        marked_today_date = today

# Mobile Web Client HTML/JS
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>SAMS 3D Face Scanner</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #0b0f19;
            color: #e2e8f0;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        header {
            width: 100%;
            background: linear-gradient(135deg, #1e293b, #0f172a);
            padding: 15px 0;
            text-align: center;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
            border-bottom: 1px solid #1e293b;
        }
        h1 {
            margin: 0;
            font-size: 1.5rem;
            color: #38bdf8;
            letter-spacing: 1px;
        }
        .container {
            width: 90%;
            max-width: 640px;
            margin: 20px auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .view-panel {
            background-color: #151f32;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid #1e293b;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
        }
        .canvas-container {
            position: relative;
            width: 100%;
            aspect-ratio: 4/3;
            background-color: #000;
        }
        canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        #viewCanvas {
            z-index: 1;
        }
        #meshCanvas {
            z-index: 2;
            background-color: rgba(0, 0, 0, 0.3);
            pointer-events: none; /* Let clicks pass through if needed */
        }
        .control-panel {
            background-color: #151f32;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid #1e293b;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .status-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #0f172a;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 0.9rem;
            border: 1px solid #1e293b;
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: #ef4444; /* red by default */
            display: inline-block;
            margin-right: 5px;
        }
        .status-dot.connected {
            background-color: #22c55e; /* green */
            box-shadow: 0 0 8px #22c55e;
        }
        .result-box {
            text-align: center;
            padding: 15px;
            background-color: #0f172a;
            border-radius: 8px;
            border: 1px solid #1e293b;
            min-height: 50px;
        }
        .name-label {
            font-size: 1.4rem;
            font-weight: bold;
            color: #38bdf8;
            margin: 0;
        }
        .sim-label {
            font-size: 0.9rem;
            color: #94a3b8;
            margin-top: 5px;
        }
        .input-group {
            display: flex;
            gap: 10px;
        }
        input[type="text"] {
            flex-grow: 1;
            padding: 12px;
            background-color: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 8px;
            color: #f8fafc;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
        }
        input[type="text"]:focus {
            border-color: #38bdf8;
        }
        button {
            padding: 12px 20px;
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        button:active {
            transform: scale(0.98);
        }
        button:disabled {
            background: #475569;
            cursor: not-allowed;
            opacity: 0.6;
        }
        .reg-btn {
            background: linear-gradient(135deg, #10b981, #047857);
        }
        .info-txt {
            font-size: 0.8rem;
            color: #64748b;
            text-align: center;
            margin: 0;
        }
        .registered-faces {
            color: #94a3b8;
            font-size: 0.8rem;
            line-height: 1.4;
            margin: 0;
            text-align: center;
        }
    </style>
</head>
<body>
    <header>
        <h1>SAMS 3D Face Scanner</h1>
    </header>
    
    <div class="container">
        <div class="view-panel">
            <div class="canvas-container">
                <canvas id="viewCanvas"></canvas>
                <canvas id="meshCanvas"></canvas>
            </div>
        </div>

        <div class="control-panel">
            <div class="status-box">
                <div>
                    <span id="statusDot" class="status-dot"></span>
                    <span id="statusTxt">Connecting...</span>
                </div>
                <div id="fpsTxt" style="color: #64748b;">FPS: 0</div>
            </div>

            <div class="result-box">
                <p id="nameLabel" class="name-label">Scanning...</p>
                <p id="simLabel" class="sim-label">Position your face in front of the camera</p>
            </div>

            <div class="input-group">
                <input type="text" id="studentNameInput" placeholder="Full name" />
                <input type="text" id="studentEidInput" placeholder="Enrollment ID (EID)" style="max-width: 140px;" />
            </div>
            <div class="input-group">
                <button id="registerBtn" class="reg-btn" style="flex-grow: 1;">Register</button>
            </div>
            <p class="info-txt">Registered face data is processed and stored locally on the connected laptop.</p>
            <p id="registeredFaces" class="registered-faces">Loading registered faces...</p>
        </div>
    </div>

    <!-- Hidden video element to read frames -->
    <video id="video" autoplay playsinline style="display:none;"></video>
    
    <script>
        const video = document.getElementById('video');
        const viewCanvas = document.getElementById('viewCanvas');
        const meshCanvas = document.getElementById('meshCanvas');
        const viewCtx = viewCanvas.getContext('2d');
        const meshCtx = meshCanvas.getContext('2d');
        
        const statusDot = document.getElementById('statusDot');
        const statusTxt = document.getElementById('statusTxt');
        const fpsTxt = document.getElementById('fpsTxt');
        const nameLabel = document.getElementById('nameLabel');
        const simLabel = document.getElementById('simLabel');
        const studentNameInput = document.getElementById('studentNameInput');
        const registerBtn = document.getElementById('registerBtn');
        const registeredFaces = document.getElementById('registeredFaces');

        let ws = null;
        let isConnected = false;
        let isRegistering = false;

        async function loadRegisteredFaces() {
            try {
                const response = await fetch('/api/students');
                if (!response.ok) throw new Error('Could not load registrations');
                const data = await response.json();
                registeredFaces.innerText = data.students.length
                    ? `Registered (${data.students.length}): ${data.students.map(s => `${s.name} (${s.eid})`).join(', ')}`
                    : 'No faces registered yet.';
            } catch (error) {
                registeredFaces.innerText = 'Registered faces are unavailable.';
            }
        }

        loadRegisteredFaces();
        
        // 3D face landmarks configuration
        let active3DLandmarks = null;
        let activeBBox = null;
        let rotationAngleY = 0;
        let rotationAngleX = 0.2; // slight tilt down

        // Standard 68 Face Landmarks Wireframe Connections
        const connections = [
            // Face outline
            [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,7], [7,8], [8,9], [9,10], [10,11], [11,12], [12,13], [13,14], [14,15], [15,16],
            // Left eyebrow
            [17,18], [18,19], [19,20], [20,21],
            // Right eyebrow
            [22,23], [23,24], [24,25], [25,26],
            // Nose bridge
            [27,28], [28,29], [29,30],
            // Nose bottom
            [30,31], [31,32], [32,33], [33,34], [34,35], [30,35],
            // Left eye
            [36,37], [37,38], [38,39], [39,40], [40,41], [41,36],
            // Right eye
            [42,43], [43,44], [44,45], [45,46], [46,47], [47,42],
            // Outer mouth
            [48,49], [49,50], [50,51], [51,52], [52,53], [53,54], [54,55], [55,56], [56,57], [57,58], [58,59], [59,48],
            // Inner mouth
            [60,61], [61,62], [62,63], [63,64], [64,65], [65,66], [66,67], [67,60]
        ];

        // Access the front camera
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        }).then(stream => {
            video.srcObject = stream;
            video.addEventListener('loadedmetadata', () => {
                viewCanvas.width = video.videoWidth;
                viewCanvas.height = video.videoHeight;
                meshCanvas.width = video.videoWidth;
                meshCanvas.height = video.videoHeight;
                setupWebSocket();
                requestAnimationFrame(renderLoop);
            });
        }).catch(err => {
            console.error("Camera access failed:", err);
            nameLabel.innerText = "Camera Error";
            simLabel.innerText = "Could not access front camera. Please grant camera permission.";
        });

        // Initialize WebSocket Connection
        function setupWebSocket() {
            const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${proto}//${window.location.host}/ws`;
            
            ws = new WebSocket(wsUrl);
            ws.binaryType = "blob";

            ws.onopen = () => {
                isConnected = true;
                statusDot.className = "status-dot connected";
                statusTxt.innerText = "Connected to Laptop";
                nameLabel.innerText = "Ready to Scan";
                simLabel.innerText = "Position face in view";
            };

            ws.onclose = () => {
                isConnected = false;
                statusDot.className = "status-dot";
                statusTxt.innerText = "Disconnected";
                nameLabel.innerText = "Connection Lost";
                simLabel.innerText = "Trying to reconnect...";
                setTimeout(setupWebSocket, 3000);
            };

            ws.onmessage = (evt) => {
                try {
                    const res = JSON.parse(evt.data);
                    if (res.event === "registration_started") {
                        isRegistering = true;
                        registerBtn.disabled = true;
                        studentNameInput.disabled = true;
                        nameLabel.innerText = "Registration Started";
                        simLabel.innerText = `Hold still while ${res.required_samples} face samples are captured.`;
                    } else if (res.event === "registered") {
                        isRegistering = false;
                        studentNameInput.value = "";
                        studentEidInput.value = "";
                        registerBtn.disabled = false;
                        studentNameInput.disabled = false;
                        studentEidInput.disabled = false;
                        nameLabel.innerText = "Register Success!";
                        simLabel.innerText = `${res.name} (${res.eid}) is saved and ready for recognition.`;
                        loadRegisteredFaces();
                    } else if (res.status === "success" && res.detected) {
                        active3DLandmarks = res.landmarks;
                        activeBBox = res.bbox;
                        activeWidth = res.width;
                        activeHeight = res.height;
                        
                        if (isRegistering) {
                            const progressPct = typeof res.progress === "number" ? res.progress : 0;
                            nameLabel.innerText = `Registering: ${progressPct}%`;
                            const guidance = res.guidance || "Hold steady while samples are captured.";
                            simLabel.innerText = `Captured ${res.samples_collected}/${res.required_samples}: ${guidance}`;
                        } else {
                            if (res.name === "Unknown") {
                                nameLabel.innerText = "Unknown Face";
                                simLabel.innerText = "Face not recognized in database.";
                            } else {
                                nameLabel.innerText = `${res.name} (${res.eid})`;
                                if (res.attendance_marked) {
                                    simLabel.innerText = `Present marked at ${res.marked_time}. Match: ${(res.similarity * 100).toFixed(1)}%`;
                                } else if (res.already_marked_today) {
                                    simLabel.innerText = `Already marked present today at ${res.marked_time}.`;
                                } else {
                                    simLabel.innerText = `Match similarity: ${(res.similarity * 100).toFixed(1)}%`;
                                }
                            }
                        }
                    } else if (res.status === "success" && !res.detected) {
                        active3DLandmarks = null;
                        activeBBox = null;
                        if (isRegistering) {
                            nameLabel.innerText = "No Face Detected";
                            simLabel.innerText = "Make sure your face is clearly visible.";
                        } else {
                            nameLabel.innerText = "Scanning...";
                            simLabel.innerText = "Position your face in front of the camera";
                        }
                    } else if (res.status === "error") {
                        isRegistering = false;
                        registerBtn.disabled = false;
                        studentNameInput.disabled = false;
                        studentEidInput.disabled = false;
                        nameLabel.innerText = "Scan Error";
                        simLabel.innerText = res.message;
                    }
                } catch(e) {
                    console.error("Message parse failed:", e);
                }
            };
        }

        // Live stream looping & rendering
        let lastFrameTime = 0;
        const frameInterval = 80; // ~12 FPS
        let frameCount = 0;
        let lastFpsTime = 0;
        let activeWidth = 320;
        let activeHeight = 240;

        function renderLoop(now) {
            // Draw standard video stream on background canvas
            viewCtx.save();
            // Mirror display for self camera
            viewCtx.translate(viewCanvas.width, 0);
            viewCtx.scale(-1, 1);
            viewCtx.drawImage(video, 0, 0, viewCanvas.width, viewCanvas.height);
            viewCtx.restore();

            // Handle WS transmission
            if (isConnected && now - lastFrameTime >= frameInterval) {
                lastFrameTime = now;
                sendFrame();
                
                // Track FPS
                frameCount++;
                if (now - lastFpsTime >= 1000) {
                    fpsTxt.innerText = `FPS: ${frameCount}`;
                    frameCount = 0;
                    lastFpsTime = now;
                }
            }

            // Draw 3D wireframe mesh projection on foreground canvas
            draw3DOverlay();

            requestAnimationFrame(renderLoop);
        }

        function sendFrame() {
            // Determine dimensions maintaining aspect ratio with max dimension 320
            const aspect = video.videoWidth / video.videoHeight;
            const sendCanvas = document.createElement('canvas');
            sendCanvas.width = aspect >= 1 ? 320 : Math.round(320 * aspect);
            sendCanvas.height = aspect >= 1 ? Math.round(320 / aspect) : 320;
            const sendCtx = sendCanvas.getContext('2d');
            
            // Mirror frame and draw
            sendCtx.translate(sendCanvas.width, 0);
            sendCtx.scale(-1, 1);
            sendCtx.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
            
            sendCanvas.toBlob((blob) => {
                if (blob && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(blob);
                }
            }, 'image/jpeg', 0.6);
        }

        // Project and render 3D landmarks
        function draw3DOverlay() {
            meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);
            
            if (!active3DLandmarks) return;

            // Compute scaling factors to map processed frame size to full display canvas
            const scaleX = meshCanvas.width / activeWidth;
            const scaleY = meshCanvas.height / activeHeight;

            // Auto-rotate the wireframe Y-axis
            rotationAngleY += 0.04;
            
            // Center of mass calculation for the 3D landmarks (using normalized dimensions)
            let sumX = 0, sumY = 0, sumZ = 0;
            for (let p of active3DLandmarks) {
                sumX += p[0]; sumY += p[1]; sumZ += p[2];
            }
            const avgX = sumX / active3DLandmarks.length;
            const avgY = sumY / active3DLandmarks.length;
            const avgZ = sumZ / active3DLandmarks.length;

            // Calculate bounding box center to position the 3D avatar on screen
            // Or render it floating on the top-right corner as a separate futuristic scanner widget!
            const widgetWidth = 140;
            const widgetHeight = 140;
            const widgetX = meshCanvas.width - widgetWidth - 10;
            const widgetY = 10;

            // Draw widget background container
            meshCtx.fillStyle = "rgba(15, 23, 42, 0.8)";
            meshCtx.strokeStyle = "#38bdf8";
            meshCtx.lineWidth = 1;
            meshCtx.beginPath();
            meshCtx.roundRect(widgetX, widgetY, widgetWidth, widgetHeight, 8);
            meshCtx.fill();
            meshCtx.stroke();

            // Label widget
            meshCtx.fillStyle = "#38bdf8";
            meshCtx.font = "bold 9px sans-serif";
            meshCtx.fillText("3D SCAN GEO", widgetX + 8, widgetY + 15);

            // Project coordinates for the mini 3D scanner avatar
            const miniProjected = [];
            const miniScale = 1.3; // scale for the 140x140 box

            for (let p of active3DLandmarks) {
                const cx = p[0] - avgX;
                const cy = p[1] - avgY;
                const cz = p[2] - avgZ;

                // Rotation calculations
                const x1 = cx * Math.cos(rotationAngleY) - cz * Math.sin(rotationAngleY);
                const z1 = cx * Math.sin(rotationAngleY) + cz * Math.cos(rotationAngleY);

                const x2 = x1;
                const y2 = cy * Math.cos(rotationAngleX) - z1 * Math.sin(rotationAngleX);

                // Map inside widget bounds
                const px = (widgetX + widgetWidth / 2) + x2 * miniScale;
                const py = (widgetY + widgetHeight / 2 + 10) + y2 * miniScale;
                miniProjected.push([px, py]);
            }

            // Draw mini wireframe connections
            meshCtx.strokeStyle = "rgba(56, 189, 248, 0.5)"; // cyan wireframe
            meshCtx.lineWidth = 1;
            for (let conn of connections) {
                const p1 = miniProjected[conn[0]];
                const p2 = miniProjected[conn[1]];
                if (p1 && p2) {
                    meshCtx.beginPath();
                    meshCtx.moveTo(p1[0], p1[1]);
                    meshCtx.lineTo(p2[0], p2[1]);
                    meshCtx.stroke();
                }
            }

            // Draw mini points
            meshCtx.fillStyle = "#f43f5e"; // rose dots
            for (let p of miniProjected) {
                meshCtx.beginPath();
                meshCtx.arc(p[0], p[1], 1.5, 0, 2 * Math.PI);
                meshCtx.fill();
            }

            // Draw main 3D landmarks overlaid directly on the face (mirrored)
            const faceProjected = [];
            for (let p of active3DLandmarks) {
                // Scale coordinate back to display canvas size
                const scaledX = p[0] * scaleX;
                const scaledY = p[1] * scaleY;
                
                // Since the background video is mirrored, we mirror the X coordinate
                const px = meshCanvas.width - scaledX;
                const py = scaledY;
                faceProjected.push([px, py]);
            }

            // Draw subtle lines overlay on face
            meshCtx.strokeStyle = "rgba(34, 197, 94, 0.4)"; // green wireframe
            meshCtx.lineWidth = 0.8;
            for (let conn of connections) {
                const p1 = faceProjected[conn[0]];
                const p2 = faceProjected[conn[1]];
                if (p1 && p2) {
                    meshCtx.beginPath();
                    meshCtx.moveTo(p1[0], p1[1]);
                    meshCtx.lineTo(p2[0], p2[1]);
                    meshCtx.stroke();
                }
            }

            // Draw face overlay dots
            meshCtx.fillStyle = "#22c55e"; // green dots
            for (let p of faceProjected) {
                meshCtx.beginPath();
                meshCtx.arc(p[0], p[1], 1.5, 0, 2 * Math.PI);
                meshCtx.fill();
            }

            // Draw face bounding box
            if (activeBBox) {
                const bx1 = activeBBox[0] * scaleX;
                const by1 = activeBBox[1] * scaleY;
                const bx2 = activeBBox[2] * scaleX;
                const by2 = activeBBox[3] * scaleY;

                const x1 = meshCanvas.width - bx2;
                const y1 = by1;
                const w = bx2 - bx1;
                const h = by2 - by1;
                
                meshCtx.strokeStyle = "#22c55e";
                meshCtx.lineWidth = 2;
                meshCtx.strokeRect(x1, y1, w, h);
            }
        }

        // Trigger Student Registration
        const studentEidInput = document.getElementById('studentEidInput');
        registerBtn.onclick = () => {
            const name = studentNameInput.value.trim();
            const eid = studentEidInput.value.trim();
            if (!name) {
                alert("Please enter a valid student name.");
                return;
            }
            if (!eid) {
                alert("Please enter the student's enrollment ID (EID).");
                return;
            }

            if (!isConnected) {
                alert("Not connected to the server.");
                return;
            }

            // NOTE: isRegistering is intentionally NOT set to true here.
            // It only flips once the server confirms the session with a
            // "registration_started" event (see ws.onmessage above). If it
            // were set optimistically on click, a recognition-mode response
            // already in flight for the previous frame could be rendered as
            // a bogus "Registering: undefined%" - which is the bug this
            // avoids.
            registerBtn.disabled = true;
            studentNameInput.disabled = true;
            studentEidInput.disabled = true;
            nameLabel.innerText = "Starting Registration...";
            simLabel.innerText = "Align your face with the camera.";

            // Send registration command
            ws.send(JSON.stringify({
                command: "register",
                name: name,
                eid: eid
            }));
        };
    </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    return HTML_CONTENT


@app.get("/api/students")
async def list_registered_students():
    """Small, mobile-friendly view of the enrollment database."""
    async with embedding_db_lock:
        students = [{"eid": eid, "name": name} for eid, name in student_names.items()]
    students.sort(key=lambda s: s["name"].casefold())
    return {"count": len(students), "students": students}


@app.get("/api/attendance")
async def get_attendance(day: str | None = None):
    """Attendance records for one date (default: today), newest first."""
    if day is None:
        target_date = date.today()
    else:
        try:
            target_date = date.fromisoformat(day)
        except ValueError:
            return {"error": "day must be in YYYY-MM-DD format"}
    records = await asyncio.to_thread(attendance_db.list_attendance, target_date)
    return {"date": target_date.isoformat(), "count": len(records), "records": records}


@app.get("/api/attendance/export")
async def export_attendance(day: str | None = None):
    """Download attendance for one date (default: today) as CSV."""
    if day is None:
        target_date = date.today()
    else:
        try:
            target_date = date.fromisoformat(day)
        except ValueError:
            return {"error": "day must be in YYYY-MM-DD format"}
    csv_text = await asyncio.to_thread(attendance_db.attendance_csv, target_date)
    filename = f"attendance_{target_date.isoformat()}.csv"
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected.")

    # This state belongs to this phone/browser only.  Keeping it local prevents a
    # second mobile client from adding samples to, or cancelling, another user's
    # registration.
    registration_name: str | None = None
    registration_eid: str | None = None
    registration_embeddings: list[np.ndarray] = []
    last_sample_at = 0.0

    async def send_response(payload: dict) -> None:
        await websocket.send_text(json.dumps(payload))

    def face_payload(face, width: int, height: int) -> dict:
        landmarks = getattr(face, "landmark_3d_68", None)
        return {
            "status": "success",
            "detected": True,
            "landmarks": landmarks.tolist() if landmarks is not None else [],
            "bbox": face.bbox.tolist(),
            "width": width,
            "height": height,
        }

    try:
        while True:
            # Receive data (can be text command or binary image bytes)
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break
            
            # Check text commands (registration init)
            if message.get("text") is not None:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send_response({"status": "error", "message": "Invalid command message."})
                    continue

                if not isinstance(data, dict):
                    await send_response({"status": "error", "message": "Invalid command message."})
                    continue

                if data.get("command") != "register":
                    await send_response({"status": "error", "message": "Unknown command."})
                    continue

                name = attendance_db.clean_name(data.get("name"))
                if name is None:
                    await send_response({
                        "status": "error",
                        "message": "Enter a student name between 1 and 100 characters.",
                    })
                    continue

                eid = attendance_db.clean_eid(data.get("eid"))
                if eid is None:
                    await send_response({
                        "status": "error",
                        "message": "Enter a valid enrollment ID (letters, numbers, - or _ only).",
                    })
                    continue

                registration_name = name
                registration_eid = eid
                registration_embeddings = []
                last_sample_at = 0.0
                print(f"Started registration session for student: {registration_name} ({registration_eid})")
                await send_response({
                    "status": "success",
                    "event": "registration_started",
                    "required_samples": REGISTRATION_SAMPLES,
                })
                continue

            # Check binary frames (JPEG images)
            if message.get("bytes") is not None:
                frame_bytes = message["bytes"]
                if len(frame_bytes) > MAX_FRAME_BYTES:
                    await send_response({"status": "error", "message": "Camera frame is too large."})
                    continue
                
                # Decode image. JPEG decode + face detection/embedding are both
                # CPU-bound, synchronous, native calls that would otherwise
                # block the asyncio event loop for their full duration -
                # freezing every other connected phone's websocket (and the
                # REST endpoints) until this one frame finishes. Running them
                # via asyncio.to_thread lets the loop keep servicing other
                # clients while OpenCV/ONNX Runtime do their work (both
                # release the GIL during the heavy native portions).
                nparr = np.frombuffer(frame_bytes, np.uint8)
                img = await asyncio.to_thread(cv2.imdecode, nparr, cv2.IMREAD_COLOR)

                if img is None:
                    continue

                # Get dimensions
                h, w = img.shape[:2]

                # Run Face Analysis
                faces = await asyncio.to_thread(face_app.get, img)
                
                if not faces:
                    # No face detected
                    await send_response({
                        "status": "success",
                        "detected": False
                    })
                    continue

                # Pick the largest face
                face = max(
                    faces,
                    key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
                )

                response = face_payload(face, w, h)

                # 1. Registration mode
                if registration_name is not None:
                    quality_message = enrollment_quality_message(face)
                    now = time.monotonic()
                    if quality_message is not None:
                        response.update({
                            "progress": int((len(registration_embeddings) / REGISTRATION_SAMPLES) * 100),
                            "samples_collected": len(registration_embeddings),
                            "required_samples": REGISTRATION_SAMPLES,
                            "guidance": quality_message,
                        })
                        await send_response(response)
                        continue

                    if now - last_sample_at < MIN_SAMPLE_INTERVAL_SECONDS:
                        response.update({
                            "progress": int((len(registration_embeddings) / REGISTRATION_SAMPLES) * 100),
                            "samples_collected": len(registration_embeddings),
                            "required_samples": REGISTRATION_SAMPLES,
                            "guidance": "Hold steady while the next sample is captured.",
                        })
                        await send_response(response)
                        continue

                    embedding = normalize_embedding(getattr(face, "embedding", None))
                    if embedding is None:
                        response.update({
                            "progress": int((len(registration_embeddings) / REGISTRATION_SAMPLES) * 100),
                            "samples_collected": len(registration_embeddings),
                            "required_samples": REGISTRATION_SAMPLES,
                            "guidance": "Face template could not be read. Keep your face centered.",
                        })
                        await send_response(response)
                        continue

                    registration_embeddings.append(embedding)
                    last_sample_at = now

                    collected = len(registration_embeddings)
                    response.update({
                        "progress": int((collected / REGISTRATION_SAMPLES) * 100),
                        "samples_collected": collected,
                        "required_samples": REGISTRATION_SAMPLES,
                        "guidance": "Good sample captured. Keep looking at the camera.",
                    })

                    if collected < REGISTRATION_SAMPLES:
                        await send_response(response)
                        continue

                    average_embedding = normalize_embedding(np.mean(registration_embeddings, axis=0))
                    if average_embedding is None:
                        registration_embeddings = []
                        await send_response({
                            "status": "error",
                            "message": "Could not create a usable face template. Please try again.",
                        })
                        continue

                    name_to_save = registration_name
                    eid_to_save = registration_eid
                    try:
                        async with embedding_db_lock:
                            previous_embedding = student_embeddings.get(eid_to_save)
                            student_embeddings[eid_to_save] = average_embedding
                            try:
                                # Disk write + fsync is blocking I/O; keep it off
                                # the event loop like the CPU-bound calls above.
                                await asyncio.to_thread(save_embeddings, student_embeddings)
                            except Exception:
                                if previous_embedding is None:
                                    student_embeddings.pop(eid_to_save, None)
                                else:
                                    student_embeddings[eid_to_save] = previous_embedding
                                raise
                            await asyncio.to_thread(attendance_db.upsert_student, eid_to_save, name_to_save)
                            student_names[eid_to_save] = name_to_save
                            # Keep the vectorized search index in sync with the
                            # dict it's derived from - this only happens on
                            # registration, not on every recognition frame.
                            rebuild_embedding_index(student_embeddings)
                    except Exception as error:
                        print(f"Could not save embedding for {eid_to_save}: {error}")
                        registration_embeddings = []
                        await send_response({
                            "status": "error",
                            "message": "Could not save the face template. Please try again.",
                        })
                        continue

                    registration_name = None
                    registration_eid = None
                    registration_embeddings = []
                    last_sample_at = 0.0
                    print(f"Successfully registered student embedding for {name_to_save} ({eid_to_save}).")
                    async with embedding_db_lock:
                        registered_count = len(student_embeddings)
                    response.update({
                        "event": "registered",
                        "name": name_to_save,
                        "eid": eid_to_save,
                        "progress": 100,
                        "registered_count": registered_count,
                    })
                    await send_response(response)

                # 2. Recognition mode (default)
                else:
                    best_eid = None
                    best_sim = -1.0

                    query_embedding = normalize_embedding(getattr(face, "embedding", None))
                    if query_embedding is not None:
                        async with embedding_db_lock:
                            matrix = _embedding_matrix
                            eids = _embedding_eids
                        if matrix is not None:
                            # One BLAS matmul against every known student at
                            # once instead of a Python loop calling np.dot()
                            # per student - scales far better as the roster
                            # grows, and avoids per-call Python/NumPy overhead
                            # that dominates at small embedding sizes.
                            similarities = matrix @ query_embedding
                            best_idx = int(np.argmax(similarities))
                            best_sim = float(similarities[best_idx])
                            best_eid = eids[best_idx]

                    recognized_eid = best_eid if best_sim >= MATCH_THRESHOLD else None

                    if recognized_eid is None:
                        response.update({"name": "Unknown", "similarity": 0.0})
                        await send_response(response)
                        continue

                    recognized_name = student_names.get(recognized_eid, "Unknown")
                    now = datetime.now()

                    async with attendance_lock:
                        refresh_marked_today_if_new_day()
                        already_marked_time = marked_today.get(recognized_eid)
                        if already_marked_time is not None:
                            attendance_marked = False
                            marked_time = already_marked_time
                        else:
                            inserted = await asyncio.to_thread(
                                attendance_db.mark_attendance, recognized_eid, recognized_name, now
                            )
                            marked_time = now.strftime("%H:%M:%S")
                            marked_today[recognized_eid] = marked_time
                            # inserted can be False on a race with another
                            # connection marking the same student in the same
                            # instant; either way the day is now covered.
                            attendance_marked = inserted

                    response.update({
                        "name": recognized_name,
                        "eid": recognized_eid,
                        "similarity": best_sim,
                        "attendance_marked": attendance_marked,
                        "already_marked_today": not attendance_marked,
                        "marked_time": marked_time,
                    })
                    await send_response(response)

    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"Error in WebSocket loop: {e}")
        try:
            await send_response({"status": "error", "message": "Server could not process this frame."})
        except Exception:
            pass


def start_server():
    parser = argparse.ArgumentParser(description="Start the SAMS mobile 3D face scanner server")
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host interface to bind the server to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to run the server on (default: 8000)",
    )
    args = parser.parse_args()

    # SSL certificates for HTTPS (required for mobile camera access)
    cert_dir = PROJECT_DIR / "certs"
    ssl_certfile = cert_dir / "cert.pem"
    ssl_keyfile = cert_dir / "key.pem"

    if ssl_certfile.is_file() and ssl_keyfile.is_file():
        lan_ip = lan_ip_address()
        print(f"Starting HTTPS server on https://{args.host}:{args.port}")
        if lan_ip:
            print(f"Open this address on your phone (on the same Wi-Fi): https://{lan_ip}:{args.port}")
        print("NOTE: On your phone, accept the self-signed certificate warning to proceed.")
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            ssl_certfile=str(ssl_certfile),
            ssl_keyfile=str(ssl_keyfile),
        )
    else:
        print(f"WARNING: No SSL certs found at {cert_dir}/. Camera will NOT work on mobile browsers over HTTP.")
        print(f"Generate certs with: openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj '/CN=SAMS-Local'")
        print(f"Starting HTTP server on http://{args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    start_server()