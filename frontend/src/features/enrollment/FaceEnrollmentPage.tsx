import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle,
  RefreshCw,
  ArrowLeft,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { Student } from '../../types/student';
import { fetchStudents } from '../../services/studentApi';
import { apiClient } from '../../services/api';

const TOTAL_SAMPLES_TARGET = 6;

const POSE_INSTRUCTIONS = [
  'Look straight at the camera',
  'Turn your head slightly to the left',
  'Turn your head slightly to the right',
  'Tilt your head slightly upwards',
  'Tilt your head slightly downwards',
  'Smile or natural expression',
];

interface DetectedFaceData {
  box: [number, number, number, number];
  confidence: number;
  landmarks: [number, number][];
  sharpness: number;
  brightness: number;
  is_valid: boolean;
  rejection_reason?: string | null;
  pose: {
    yaw: number;
    pitch: number;
    roll: number;
    is_frontal: boolean;
    pose_type: string;
  };
}

interface FaceEnrollmentPageProps {
  initialStudentId?: string;
  onNavigate?: (tab: string) => void;
}

export const FaceEnrollmentPage: React.FC<FaceEnrollmentPageProps> = ({
  initialStudentId,
  onNavigate,
}) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [enrolledThumbnails, setEnrolledThumbnails] = useState<string[]>([]);
  
  // Real-time detector states
  const [detectedFaces, setDetectedFaces] = useState<DetectedFaceData[]>([]);
  const [liveGuidance, setLiveGuidance] = useState<string>('Opening camera...');
  const [guidanceType, setGuidanceType] = useState<'neutral' | 'success' | 'warning'>('neutral');
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [detectorLatencyMs, setDetectorLatencyMs] = useState<number>(0);
  const [fpsCount, setFpsCount] = useState<number>(0);
  const [frameDimensions, setFrameDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);
  const fpsCounterRef = useRef<number>(0);

  // Load student list
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const res = await fetchStudents({ limit: 100 });
        setStudents(res.items);
        if (!selectedStudentId && res.items.length > 0) {
          const pending = res.items.find((s) => s.enrollment_status !== 'ENROLLED');
          setSelectedStudentId(pending ? pending.id : res.items[0].id);
        }
      } catch (err) {
        console.error('Failed to load students:', err);
      }
    };
    loadStudents();
  }, [selectedStudentId]);

  // Start Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported or context is insecure (requires HTTPS).');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setLiveGuidance('Camera online. Scanning for faces...');
      setGuidanceType('neutral');
    } catch (err: any) {
      console.error('Camera access error:', err);
      const name = err.name || 'Error';
      const msg = err.message || 'Camera permission denied.';
      setCameraError(`${name}: ${msg}`);
      setLiveGuidance(`Camera error: ${name}`);
      setGuidanceType('warning');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (detectionLoopRef.current) {
      clearInterval(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Draw Bounding Boxes & Landmarks on Canvas Overlay
  const drawBoundingBoxes = useCallback((faces: DetectedFaceData[], vWidth: number, vHeight: number) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = vWidth;
    canvas.height = vHeight;
    ctx.clearRect(0, 0, vWidth, vHeight);

    if (faces.length === 0) return;

    faces.forEach((face, idx) => {
      const [x1, y1, x2, y2] = face.box;
      const boxW = x2 - x1;
      const boxH = y2 - y1;

      // Because the video element is mirrored via CSS `transform: scaleX(-1)`,
      // we transform the coordinates so the overlay aligns seamlessly.
      const mirroredX1 = vWidth - x2;

      // Choose stroke color based on validity and face count
      const isGood = face.is_valid && faces.length === 1;
      const strokeColor = isGood ? '#10b981' : '#f59e0b'; // Emerald or Amber

      // Draw bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(mirroredX1, y1, boxW, boxH, 8);
      ctx.stroke();

      // Draw fiducial landmarks (eyes, nose, mouth)
      if (face.landmarks && face.landmarks.length > 0) {
        ctx.fillStyle = '#60a5fa';
        face.landmarks.forEach(([lx, ly]) => {
          const mlx = vWidth - lx;
          ctx.beginPath();
          ctx.arc(mlx, ly, 3, 0, 2 * Math.PI);
          ctx.fill();
        });
      }

      // Draw status label chip above box
      ctx.fillStyle = isGood ? 'rgba(16, 185, 129, 0.85)' : 'rgba(245, 158, 11, 0.85)';
      const labelText = isGood
        ? `Face #${idx + 1} (${Math.round(face.confidence * 100)}%)`
        : face.rejection_reason || 'Uncertain';
      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(labelText).width;

      ctx.beginPath();
      ctx.roundRect(mirroredX1, Math.max(4, y1 - 22), textWidth + 12, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX1 + 6, Math.max(16, y1 - 8));
    });
  }, []);

  // Real-time Detection Frame Loop
  const runDetectionScan = async () => {
    if (isDetectingRef.current || !videoRef.current || !captureCanvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    isDetectingRef.current = true;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setFrameDimensions({ w: video.videoWidth, h: video.videoHeight });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isDetectingRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        isDetectingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const tStart = performance.now();
      try {
        const res = await apiClient.post('/recognition/detect', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const elapsed = Math.round(performance.now() - tStart);
        setDetectorLatencyMs(elapsed);
        fpsCounterRef.current += 1;

        const data = res.data;
        const faces: DetectedFaceData[] = data.faces || [];
        setDetectedFaces(faces);

        // Update live visual canvas
        drawBoundingBoxes(faces, video.videoWidth, video.videoHeight);

        // Evaluate human-friendly guidance
        if (faces.length === 0) {
          setLiveGuidance('Face not detected — position face clearly in frame');
          setGuidanceType('warning');
        } else if (faces.length > 1) {
          setLiveGuidance(`Multiple faces (${faces.length}) detected — ensure only 1 student is in view`);
          setGuidanceType('warning');
        } else {
          const f = faces[0];
          if (!f.is_valid) {
            setLiveGuidance(f.rejection_reason || 'Hold steady for clear sample');
            setGuidanceType('warning');
          } else if (!f.pose.is_frontal) {
            setLiveGuidance(`Face angle steep (${f.pose.pose_type}) — turn towards camera`);
            setGuidanceType('warning');
          } else {
            setLiveGuidance('Good sample detected — click capture');
            setGuidanceType('success');
          }
        }
      } catch (err) {
        // quiet background frame error
      } finally {
        isDetectingRef.current = false;
      }
    }, 'image/jpeg', 0.80);
  };

  // Start periodic detection scanner (every 350ms)
  useEffect(() => {
    detectionLoopRef.current = setInterval(runDetectionScan, 350);
    
    // FPS tracking interval
    const fpsInterval = setInterval(() => {
      setFpsCount(fpsCounterRef.current);
      fpsCounterRef.current = 0;
    }, 1000);

    return () => {
      if (detectionLoopRef.current) clearInterval(detectionLoopRef.current);
      clearInterval(fpsInterval);
    };
  }, [drawBoundingBoxes]);

  const currentInstruction = POSE_INSTRUCTIONS[sampleCount] || 'Face enrollment complete';
  const isComplete = sampleCount >= TOTAL_SAMPLES_TARGET;

  // Capture face sample
  const handleCaptureSample = async () => {
    if (!videoRef.current || !captureCanvasRef.current || !selectedStudentId || capturing || isComplete) return;

    setCapturing(true);
    setLiveGuidance('Verifying & generating 512-d ArcFace embeddings...');
    setGuidanceType('neutral');

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setCapturing(false);
        return;
      }

      const previewUrl = canvas.toDataURL('image/jpeg');
      const formData = new FormData();
      formData.append('file', blob, `sample_${sampleCount + 1}.jpg`);
      formData.append('pose_type', `SAMPLE_${sampleCount + 1}`);

      try {
        const response = await apiClient.post(`/students/${selectedStudentId}/enroll`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
          const nextCount = sampleCount + 1;
          setSampleCount(nextCount);
          setEnrolledThumbnails((prev) => [...prev, previewUrl]);
          setGuidanceType('success');

          if (nextCount >= TOTAL_SAMPLES_TARGET) {
            setLiveGuidance('Enrollment complete! Student biometric profile saved.');
          } else {
            setLiveGuidance(`Sample ${nextCount} enrolled. Next: ${POSE_INSTRUCTIONS[nextCount]}`);
          }
        } else {
          setGuidanceType('warning');
          setLiveGuidance(response.data.message || 'Face not clear. Please hold steady.');
        }
      } catch (err: any) {
        setGuidanceType('warning');
        setLiveGuidance(err.response?.data?.detail?.message || 'Failed to process biometrics.');
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="text-center space-y-1">
        {onNavigate && (
          <button
            onClick={() => onNavigate('students')}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-2 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Students</span>
          </button>
        )}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Face Enrollment</h1>
        <p className="text-sm text-slate-500">
          Real-time AI face detection and biometric profile enrollment.
        </p>
      </div>

      {/* Camera Permission Error Notice */}
      {cameraError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Camera Access Notice:</span>
            <p>{cameraError}</p>
            <p className="text-[11px] text-rose-600">
              Ensure you are on a secure HTTPS context and browser camera permissions are granted.
            </p>
          </div>
        </div>
      )}

      {/* Student Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
        <span className="text-xs font-semibold text-slate-600 shrink-0">Enroll face for:</span>
        <select
          value={selectedStudentId}
          onChange={(e) => {
            setSelectedStudentId(e.target.value);
            setSampleCount(0);
            setEnrolledThumbnails([]);
            setLiveGuidance('Align face inside the frame');
            setGuidanceType('neutral');
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name} ({s.student_code}) {s.enrollment_status === 'ENROLLED' ? '✓ Enrolled' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Camera Viewport with Live Canvas Bounding Boxes */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden flex items-center justify-center shadow-inner">
          {/* Raw Video Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
          {/* Hidden Capture Canvas */}
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* Live Overlay Canvas with Bounding Boxes */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Target Oval Reticle */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={`w-44 h-56 border-2 rounded-[50%] transition-colors duration-200 ${
                isComplete
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : guidanceType === 'success'
                  ? 'border-emerald-400/80'
                  : guidanceType === 'warning'
                  ? 'border-amber-400/80'
                  : 'border-white/40'
              }`}
            ></div>
          </div>

          {/* Live Feed Status Pill */}
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                detectedFaces.length === 1 && detectedFaces[0].is_valid
                  ? 'bg-emerald-500 animate-pulse'
                  : detectedFaces.length > 1
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            ></span>
            <span>
              {detectedFaces.length === 0
                ? 'Scanning...'
                : `${detectedFaces.length} Face(s) Detected`}
            </span>
          </div>

          {/* Debug Mode Toggle Pill */}
          <button
            onClick={() => setDebugMode(!debugMode)}
            className="absolute top-3 right-3 bg-black/60 backdrop-blur-md hover:bg-black/80 px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5 transition"
          >
            <Activity className="w-3 h-3 text-blue-400" />
            <span>{debugMode ? 'Hide Diagnostics' : 'Show Diagnostics'}</span>
          </button>
        </div>

        {/* Debug HUD Panel */}
        {debugMode && (
          <div className="p-3 bg-slate-900 rounded-xl text-slate-300 font-mono text-[11px] space-y-1 border border-slate-800">
            <div className="flex items-center justify-between text-blue-400 font-bold border-b border-slate-800 pb-1">
              <span>LIVE DETECTOR DIAGNOSTICS</span>
              <span>SCRFD-10G ONNX</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <span className="text-slate-500 block">Resolution</span>
                <span>{frameDimensions.w} × {frameDimensions.h}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Inference</span>
                <span className="text-emerald-400">{detectorLatencyMs} ms</span>
              </div>
              <div>
                <span className="text-slate-500 block">Detect Rate</span>
                <span>{fpsCount} FPS</span>
              </div>
              <div>
                <span className="text-slate-500 block">Faces</span>
                <span className="text-blue-400">{detectedFaces.length}</span>
              </div>
            </div>

            {detectedFaces.length > 0 && (
              <div className="pt-2 border-t border-slate-800 text-[10px] space-y-0.5 text-slate-400">
                <div>Confidence: {detectedFaces[0].confidence.toFixed(3)}</div>
                <div>Sharpness: {detectedFaces[0].sharpness.toFixed(1)} | Brightness: {detectedFaces[0].brightness.toFixed(1)}</div>
                <div>Pose: Yaw {detectedFaces[0].pose.yaw.toFixed(1)}°, Pitch {detectedFaces[0].pose.pitch.toFixed(1)}°, Roll {detectedFaces[0].pose.roll.toFixed(1)}°</div>
              </div>
            )}
          </div>
        )}

        {/* Live Guidance Feedback & Pose Instructions */}
        <div className="text-center space-y-1.5 py-1">
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1 rounded-full ${
              guidanceType === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : guidanceType === 'warning'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                guidanceType === 'success'
                  ? 'bg-emerald-500'
                  : guidanceType === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
            ></span>
            <span>{liveGuidance}</span>
          </div>

          <div className="text-sm font-semibold text-slate-800">
            {isComplete ? 'Enrollment Complete' : `Target: ${currentInstruction}`}
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Sample {sampleCount} of {TOTAL_SAMPLES_TARGET}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2">
          {isComplete ? (
            <button
              onClick={() => onNavigate && onNavigate('students')}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Finish & Return to Students</span>
            </button>
          ) : (
            <button
              onClick={handleCaptureSample}
              disabled={capturing || !selectedStudentId}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {capturing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing ArcFace Embeddings...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Capture Sample ({sampleCount + 1}/{TOTAL_SAMPLES_TARGET})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Captured Thumbnails */}
      {enrolledThumbnails.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-600">Enrolled Face Samples</span>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
            {enrolledThumbnails.map((thumb, idx) => (
              <div key={idx} className="relative group shrink-0">
                <img
                  src={thumb}
                  alt={`Sample ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-xl border-2 border-emerald-500/50 shadow-sm"
                />
                <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded font-mono font-bold">
                  #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
