import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  UserCheck,
  Camera,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Tv,
  Smartphone,
  Video as VideoIcon,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { fetchCameras } from '../../services/cameraApi';
import { fetchSessions } from '../../services/attendanceApi';
import { CameraDevice } from '../../types/camera';
import { AttendanceSession } from '../../types/attendance';
import { apiClient } from '../../services/api';

interface StudentPresenceItem {
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  attendance_status: string;
  presence_state: 'PRESENT_AND_VISIBLE' | 'TEMPORARILY_NOT_VISIBLE' | 'NOT_CURRENTLY_VISIBLE' | 'VERIFYING';
  first_seen: string;
  last_seen: string;
  seconds_since_last_seen: number;
  confidence: number;
  return_count: number;
  camera_id?: string;
}

interface LiveDashboardProps {
  onNavigate?: (tab: string) => void;
}

export const LiveDashboardPage: React.FC<LiveDashboardProps> = ({ onNavigate }) => {
  // Data State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loadingCameras, setLoadingCameras] = useState<boolean>(true);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Camera Stream & Lifecycle State
  const [cameraState, setCameraState] = useState<'IDLE' | 'STARTING' | 'STREAMING' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [mjpegTimestamp, setMjpegTimestamp] = useState<number>(Date.now());
  const [hasReceivedRemoteFrames, setHasReceivedRemoteFrames] = useState<boolean>(false);

  // Presence & AI Telemetry State
  const [presenceList, setPresenceList] = useState<StudentPresenceItem[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const [activeFacesDetected, setActiveFacesDetected] = useState<number>(0);
  const [framesProcessedTotal, setFramesProcessedTotal] = useState<number>(0);
  const [unknownCount, setUnknownCount] = useState<number>(0);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mjpegImgRef = useRef<HTMLImageElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsDownlinkRef = useRef<WebSocket | null>(null);
  const recognitionIntervalRef = useRef<any>(null);
  const presencePollIntervalRef = useRef<any>(null);
  const cameraPollIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Load Sessions & Registered Cameras from DB
  const loadResources = useCallback(async () => {
    try {
      setLoadingCameras(true);
      setLoadingSessions(true);

      const [camList, sessionList] = await Promise.all([
        fetchCameras(),
        fetchSessions(),
      ]);

      setCameras(camList);
      setSessions(sessionList);

      // Pick active session or first session
      const active = sessionList.find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSessionId(active.id);
      } else if (sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].id);
      }

      // Pick best camera (e.g. matching room or first camera)
      if (camList.length > 0) {
        setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
      } else {
        setSelectedCameraId('');
      }
    } catch (err) {
      console.error('Failed to load live resources:', err);
    } finally {
      setLoadingCameras(false);
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
    // Refresh camera health telemetry every 4 seconds
    cameraPollIntervalRef.current = setInterval(async () => {
      try {
        const camList = await fetchCameras();
        setCameras(camList);
      } catch (e) {
        // silent
      }
    }, 4000);

    return () => {
      if (cameraPollIntervalRef.current) clearInterval(cameraPollIntervalRef.current);
    };
  }, [loadResources]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedCamera = cameras.find((c) => c.id === selectedCameraId);

  // Sort / Prefer Cameras Matching Current Session Room
  const sortedCameras = React.useMemo(() => {
    if (!selectedSession || !selectedSession.room) return cameras;
    const sessionRoom = selectedSession.room.toLowerCase().trim();
    return [...cameras].sort((a, b) => {
      const aMatch = a.location.toLowerCase().includes(sessionRoom) || (a.assigned_class && a.assigned_class === selectedSession.class_name);
      const bMatch = b.location.toLowerCase().includes(sessionRoom) || (b.assigned_class && b.assigned_class === selectedSession.class_name);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }, [cameras, selectedSession]);

  // Poll presence state from backend
  const fetchPresenceData = useCallback(async () => {
    if (!selectedSessionId) return;
    try {
      const res = await apiClient.get(`/attendance/sessions/${selectedSessionId}/presence`);
      setPresenceList(res.data || []);
    } catch (err) {
      // quiet poll error
    }
  }, [selectedSessionId]);

  useEffect(() => {
    fetchPresenceData();
    presencePollIntervalRef.current = setInterval(fetchPresenceData, 2000);
    return () => {
      if (presencePollIntervalRef.current) clearInterval(presencePollIntervalRef.current);
    };
  }, [fetchPresenceData]);

  // Draw Face Bounding Boxes Over Video or Remote Stream
  const drawOverlayBoxes = useCallback((faces: any[], vWidth: number, vHeight: number, isMirrored: boolean = false) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = vWidth;
    canvas.height = vHeight;
    ctx.clearRect(0, 0, vWidth, vHeight);

    if (faces.length === 0) return;

    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const boxW = x2 - x1;
      const boxH = y2 - y1;
      const renderX = isMirrored ? vWidth - x2 : x1;

      const isKnown = face.decision === 'KNOWN';
      const isUncertain = face.decision === 'UNCERTAIN';
      const strokeColor = isKnown ? '#10b981' : isUncertain ? '#f59e0b' : '#94a3b8';

      // Draw bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(renderX, y1, boxW, boxH, 8);
      ctx.stroke();

      // Label text
      const labelText = isKnown && face.best_match
        ? `${face.best_match.name} (${Math.round(face.best_match.confidence_pct)}%)`
        : isUncertain
        ? 'Scanning...'
        : 'Unknown Face';

      ctx.fillStyle = isKnown
        ? 'rgba(16, 185, 129, 0.9)'
        : isUncertain
        ? 'rgba(245, 158, 11, 0.9)'
        : 'rgba(71, 85, 105, 0.9)';

      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(labelText).width;

      ctx.beginPath();
      ctx.roundRect(renderX, Math.max(4, y1 - 22), textWidth + 14, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, renderX + 7, Math.max(16, y1 - 7));
    });
  }, []);

  // Stop Live Attendance Stream
  const stopLiveAttendance = () => {
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsDownlinkRef.current) {
      wsDownlinkRef.current.close();
      wsDownlinkRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    setCameraState('IDLE');
    setVideoResolution({ width: 0, height: 0 });
    setActiveFacesDetected(0);
    setHasReceivedRemoteFrames(false);
  };

  // Start Live Attendance with Selected Registered Camera
  const startLiveAttendance = async () => {
    if (!selectedSessionId) {
      alert('Please select an attendance session first.');
      return;
    }
    if (!selectedCamera) {
      alert('Please select a registered camera source.');
      return;
    }

    setCameraState('STARTING');
    setCameraError(null);
    setHasReceivedRemoteFrames(false);

    try {
      // 1. Clean up any prior streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (wsDownlinkRef.current) {
        wsDownlinkRef.current.close();
        wsDownlinkRef.current = null;
      }

      if (selectedCamera.source_type === 'WEBCAM') {
        // CASE 1: HARDWARE WEBCAM
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('getUserMedia is unavailable. Secure context (HTTPS) is required.');
        }

        const constraints: MediaStreamConstraints = {
          video: selectedCamera.device_id
            ? { deviceId: { exact: selectedCamera.device_id }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch (playErr) {
            console.warn('Initial video.play() resolved after load:', playErr);
          }
        }
      } else {
        // CASE 2 & 3: REMOTE MOBILE OR CCTV RTSP
        if (selectedCamera.source_type === 'RTSP') {
          try {
            await apiClient.post(`/cameras/${selectedCamera.id}/start`);
          } catch (startErr) {
            console.warn('CCTV worker auto-start notice:', startErr);
          }
        }

        setMjpegTimestamp(Date.now());

        // Connect WebSocket Downlink for ultra-low latency frame reception
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/cameras/${selectedCamera.id}/laptop-stream`;

        try {
          const ws = new WebSocket(wsUrl);
          ws.binaryType = 'blob';

          ws.onmessage = (event) => {
            if (event.data instanceof Blob) {
              setHasReceivedRemoteFrames(true);
              const blobUrl = URL.createObjectURL(event.data);
              const img = new Image();
              img.onload = () => {
                const canvas = remoteCanvasRef.current;
                if (canvas) {
                  canvas.width = img.naturalWidth || 640;
                  canvas.height = img.naturalHeight || 480;
                  setVideoResolution({ width: canvas.width, height: canvas.height });
                  const ctx = canvas.getContext('2d');
                  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                URL.revokeObjectURL(blobUrl);
              };
              img.src = blobUrl;
            }
          };

          wsDownlinkRef.current = ws;
        } catch (wsErr) {
          console.warn('WebSocket downlink setup notice:', wsErr);
        }
      }

      setCameraState('STREAMING');

      // AI Recognition Frame Processing Loop (every 750ms)
      recognitionIntervalRef.current = setInterval(processCurrentFrame, 750);
    } catch (err: any) {
      console.error('Camera connection failure:', err);
      setCameraState('ERROR');
      let msg = err.message || 'Camera failed to start.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera permissions in your browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical webcam hardware detected.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Webcam is currently locked or in use by another program.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    return () => stopLiveAttendance();
  }, []);

  // Frame Capture & Recognition Dispatcher
  const processCurrentFrame = async () => {
    if (isProcessingRef.current || !selectedCamera) return;

    if (selectedCamera.source_type === 'WEBCAM') {
      // Process Webcam Element Frame
      const video = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      setVideoResolution({ width: video.videoWidth, height: video.videoHeight });
      isProcessingRef.current = true;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isProcessingRef.current = false;
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          isProcessingRef.current = false;
          return;
        }
        await sendFrameToRecognition(blob, video.videoWidth, video.videoHeight, true);
        isProcessingRef.current = false;
      }, 'image/jpeg', 0.85);
    } else {
      // Process Remote Stream (from remote canvas or MJPEG element)
      const remoteCanvas = remoteCanvasRef.current;
      const img = mjpegImgRef.current;
      const captureCanvas = captureCanvasRef.current;
      if (!captureCanvas) return;

      let sourceWidth = 0;
      let sourceHeight = 0;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) return;

      if (hasReceivedRemoteFrames && remoteCanvas && remoteCanvas.width > 0) {
        sourceWidth = remoteCanvas.width;
        sourceHeight = remoteCanvas.height;
        captureCanvas.width = sourceWidth;
        captureCanvas.height = sourceHeight;
        ctx.drawImage(remoteCanvas, 0, 0, sourceWidth, sourceHeight);
      } else if (img && img.naturalWidth > 0) {
        sourceWidth = img.naturalWidth;
        sourceHeight = img.naturalHeight;
        captureCanvas.width = sourceWidth;
        captureCanvas.height = sourceHeight;
        try {
          ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
        } catch (e) {
          return;
        }
      } else {
        return;
      }

      setVideoResolution({ width: sourceWidth, height: sourceHeight });
      isProcessingRef.current = true;

      captureCanvas.toBlob(async (blob) => {
        if (!blob) {
          isProcessingRef.current = false;
          return;
        }
        await sendFrameToRecognition(blob, sourceWidth, sourceHeight, false);
        isProcessingRef.current = false;
      }, 'image/jpeg', 0.85);
    }
  };

  const sendFrameToRecognition = async (
    blob: Blob,
    width: number,
    height: number,
    isMirrored: boolean
  ) => {
    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    const startTime = performance.now();
    try {
      const res = await apiClient.post('/recognition/process', formData, {
        params: {
          session_id: selectedSessionId || undefined,
          camera_id: selectedCamera?.id,
        },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLastLatencyMs(elapsed);
      setFramesProcessedTotal((prev) => prev + 1);

      const data = res.data;
      const faces = data.faces || [];
      setActiveFacesDetected(faces.length);

      // Draw bounding boxes on overlay
      drawOverlayBoxes(faces, width, height, isMirrored);

      const unks = faces.filter((f: any) => f.decision === 'UNKNOWN').length;
      if (unks > 0) setUnknownCount((c) => c + unks);

      // Refresh presence list if known student recognized
      const hasKnown = faces.some((f: any) => f.decision === 'KNOWN');
      if (hasKnown) {
        fetchPresenceData();
      }
    } catch (err) {
      // quiet frame skip
    }
  };

  // Handle Camera Switch
  const handleCameraChange = (cameraId: string) => {
    stopLiveAttendance();
    setSelectedCameraId(cameraId);
    setCameraError(null);
  };

  // Compute presence totals
  const totalMarkedPresent = presenceList.filter((p) => p.attendance_status === 'PRESENT').length;
  const currentlyVisibleCount = presenceList.filter((p) => p.presence_state === 'PRESENT_AND_VISIBLE').length;
  const awayCount = presenceList.filter((p) => p.presence_state !== 'PRESENT_AND_VISIBLE').length;

  const isRemoteSource = selectedCamera && (selectedCamera.source_type === 'MOBILE' || selectedCamera.source_type === 'RTSP');
  const isMobileNoFrame = selectedCamera?.source_type === 'MOBILE' && selectedCamera.status === 'NO_FRAME' && !hasReceivedRemoteFrames;

  const mjpegUrl = selectedCamera
    ? `/api/v1/cameras/${selectedCamera.id}/mjpeg?t=${mjpegTimestamp}`
    : '';

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Attendance & Presence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Multi-source biometric attendance (Webcam, Mobile Station, CCTV/RTSP) with duplicate protection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Session Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Session:</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={cameraState === 'STREAMING'}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              {loadingSessions ? (
                <option value="">Loading sessions...</option>
              ) : sessions.length === 0 ? (
                <option value="">No Active Sessions</option>
              ) : (
                sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject} ({s.class_name}) - [{s.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Camera Source Selector (From Cameras Database) */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Camera:</span>
            {loadingCameras ? (
              <div className="text-xs text-slate-400 flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-xl">
                <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                Loading...
              </div>
            ) : cameras.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-600 font-semibold px-2 py-1 bg-rose-50 rounded-lg border border-rose-200">
                  No cameras configured
                </span>
                <a
                  href="/cameras"
                  onClick={(e) => {
                    if (onNavigate) {
                      e.preventDefault();
                      onNavigate('cameras');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Camera</span>
                </a>
              </div>
            ) : (
              <select
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
                disabled={cameraState === 'STREAMING'}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm max-w-xs truncate"
              >
                {sortedCameras.map((c) => {
                  const isPreferred = selectedSession?.room && c.location.toLowerCase().includes(selectedSession.room.toLowerCase());
                  const typeLabel = c.source_type === 'RTSP' ? 'CCTV/RTSP' : c.source_type === 'MOBILE' ? 'Mobile' : 'Webcam';
                  return (
                    <option key={c.id} value={c.id}>
                      {isPreferred ? '★ ' : ''}{c.name} ({c.location}) — [{typeLabel}] — ● {c.status}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Start / Stop Button */}
          {cameraState === 'STREAMING' ? (
            <button
              onClick={stopLiveAttendance}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Attendance</span>
            </button>
          ) : (
            <button
              onClick={startLiveAttendance}
              disabled={cameraState === 'STARTING' || cameras.length === 0 || !selectedSessionId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              {cameraState === 'STARTING' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Attendance</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Camera Information & Telemetry Bar */}
      {selectedCamera && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              {selectedCamera.source_type === 'MOBILE' ? (
                <Smartphone className="w-4 h-4" />
              ) : selectedCamera.source_type === 'RTSP' ? (
                <Tv className="w-4 h-4" />
              ) : (
                <VideoIcon className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <span>{selectedCamera.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                  {selectedCamera.source_type === 'RTSP' ? 'CCTV / RTSP' : selectedCamera.source_type === 'MOBILE' ? 'Mobile Station' : 'Hardware Webcam'}
                </span>
                <span className="text-slate-400 font-normal">· {selectedCamera.location}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Status:</span>
                <span
                  className={`inline-flex items-center gap-1 font-bold ${
                    selectedCamera.status === 'STREAMING'
                      ? 'text-emerald-600'
                      : selectedCamera.status === 'CONNECTED'
                      ? 'text-blue-600'
                      : selectedCamera.status === 'NO_FRAME'
                      ? 'text-amber-600'
                      : 'text-slate-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    selectedCamera.status === 'STREAMING'
                      ? 'bg-emerald-500 animate-pulse'
                      : selectedCamera.status === 'CONNECTED'
                      ? 'bg-blue-500'
                      : selectedCamera.status === 'NO_FRAME'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`} />
                  <span>{selectedCamera.status}</span>
                </span>
                {selectedCamera.seconds_since_last_frame !== null && selectedCamera.seconds_since_last_frame !== undefined && (
                  <span>· Last frame: {selectedCamera.seconds_since_last_frame}s ago</span>
                )}
                {selectedCamera.fps > 0 && <span>· {selectedCamera.fps} FPS</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedCamera.source_type === 'MOBILE' && selectedCamera.status !== 'STREAMING' && (
              <a
                href="/mobile-camera"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-bold text-[11px] hover:bg-purple-100 transition border border-purple-200"
              >
                <span>Launch Mobile Station</span>
                <ArrowRight className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={loadResources}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
              title="Refresh Camera Status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {cameraError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm">Camera Stream Failed</div>
            <p>{cameraError}</p>
            {selectedCamera?.source_type === 'WEBCAM' && (
              <p className="text-[11px] text-rose-700">
                Try visiting <a href="/camera-test" className="underline font-bold">/camera-test</a> to test your local webcam directly.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Feed & Live Overlay (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
              
              {/* FEED 1: LOCAL HARDWARE WEBCAM */}
              {selectedCamera?.source_type === 'WEBCAM' && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={async () => {
                    if (videoRef.current) {
                      setVideoResolution({
                        width: videoRef.current.videoWidth,
                        height: videoRef.current.videoHeight,
                      });
                      try {
                        await videoRef.current.play();
                      } catch (e) {
                        console.warn('Play error on loadedmetadata:', e);
                      }
                    }
                  }}
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    cameraState === 'STREAMING' ? 'block' : 'hidden'
                  }`}
                />
              )}

              {/* FEED 2 & 3: REMOTE MOBILE / CCTV RTSP STREAM */}
              {isRemoteSource && (
                <>
                  <canvas
                    ref={remoteCanvasRef}
                    className={`w-full h-full object-contain ${
                      cameraState === 'STREAMING' && hasReceivedRemoteFrames ? 'block' : 'hidden'
                    }`}
                  />

                  {!hasReceivedRemoteFrames && (
                    <img
                      ref={mjpegImgRef}
                      src={cameraState === 'STREAMING' ? mjpegUrl : ''}
                      alt="Live Remote Stream"
                      crossOrigin="anonymous"
                      onLoad={() => {
                        if (mjpegImgRef.current && mjpegImgRef.current.naturalWidth > 0) {
                          setVideoResolution({
                            width: mjpegImgRef.current.naturalWidth,
                            height: mjpegImgRef.current.naturalHeight,
                          });
                        }
                      }}
                      className={`w-full h-full object-contain ${
                        cameraState === 'STREAMING' && !isMobileNoFrame ? 'block' : 'hidden'
                      }`}
                    />
                  )}
                </>
              )}

              {/* Canvas Overlays for Face Detection */}
              <canvas ref={captureCanvasRef} className="hidden" />
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  cameraState === 'STREAMING' ? 'block' : 'hidden'
                }`}
              />

              {/* State 1: IDLE */}
              {cameraState === 'IDLE' && (
                <div className="text-center text-slate-400 space-y-2 p-6">
                  {selectedCamera?.source_type === 'MOBILE' ? (
                    <Smartphone className="w-12 h-12 mx-auto text-slate-600" />
                  ) : selectedCamera?.source_type === 'RTSP' ? (
                    <Tv className="w-12 h-12 mx-auto text-slate-600" />
                  ) : (
                    <Camera className="w-12 h-12 mx-auto text-slate-600" />
                  )}
                  <p className="text-sm font-semibold text-slate-200">
                    {selectedCamera ? `${selectedCamera.name} is Standby` : 'No Camera Selected'}
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Click "Start Attendance" to initialize biometric recognition on this camera.
                  </p>
                </div>
              )}

              {/* State 2: STARTING */}
              {cameraState === 'STARTING' && (
                <div className="text-center text-white space-y-2 p-6">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500" />
                  <p className="text-xs font-semibold">
                    Connecting to {selectedCamera?.name || 'camera source'}...
                  </p>
                </div>
              )}

              {/* State 3: MOBILE CONNECTED BUT NO FRAME */}
              {cameraState === 'STREAMING' && isMobileNoFrame && (
                <div className="text-center text-amber-300 space-y-2 p-6">
                  <Smartphone className="w-10 h-10 mx-auto text-amber-400 animate-pulse" />
                  <p className="text-sm font-bold">Mobile Connected — Waiting for Video</p>
                  <p className="text-xs text-slate-300 max-w-sm">
                    The mobile device is paired. Please tap "Start Camera" on the mobile phone camera page to transmit frames.
                  </p>
                </div>
              )}

              {/* State 4: ERROR */}
              {cameraState === 'ERROR' && (
                <div className="text-center text-rose-400 space-y-2 p-6">
                  <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
                  <p className="text-xs font-semibold">Camera Stream Offline</p>
                </div>
              )}

              {/* Active Stream Pill Badge */}
              {cameraState === 'STREAMING' && (
                <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>
                    {selectedCamera?.name} ({videoResolution.width > 0 ? `${videoResolution.width}×${videoResolution.height}` : 'Live'}) — {activeFacesDetected} Face(s)
                  </span>
                </div>
              )}

              {/* Diagnostics Toggle */}
              {cameraState === 'STREAMING' && (
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition text-xs border border-white/10"
                  title="Toggle Diagnostics"
                >
                  {debugMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Diagnostics HUD Panel */}
            {debugMode && cameraState === 'STREAMING' && (
              <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div>Source: <span className="text-blue-400">{selectedCamera?.source_type}</span></div>
                <div>Latency: <span className="text-emerald-400">{lastLatencyMs}ms</span></div>
                <div>Frames: <span className="text-amber-400">{framesProcessedTotal}</span></div>
                <div>Unknown: <span className="text-rose-400">{unknownCount}</span></div>
              </div>
            )}
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
              <div className="text-xs text-slate-400 font-medium">Marked Present</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{totalMarkedPresent}</div>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 shadow-sm text-center">
              <div className="text-xs text-emerald-600 font-medium">Currently Visible</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{currentlyVisibleCount}</div>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 shadow-sm text-center">
              <div className="text-xs text-amber-600 font-medium">Away / Not Visible</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{awayCount}</div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Presence List (4 Cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Live Attendance Roster</h3>
              <p className="text-xs text-slate-400">
                Session: {selectedSession ? selectedSession.subject : 'None'}
              </p>
            </div>
            <button
              onClick={fetchPresenceData}
              className="p-1 text-slate-400 hover:text-slate-600 transition"
              title="Refresh Roster"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px] pr-1">
            {presenceList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">No Attendance Marked Yet</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Enrolled students recognized by the AI pipeline will appear here with live presence tracking.
                </p>
              </div>
            ) : (
              presenceList.map((st) => {
                const isVisible = st.presence_state === 'PRESENT_AND_VISIBLE';
                return (
                  <div
                    key={st.student_id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{st.student_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {st.roll_number || st.student_code} · {Math.round(st.confidence * 100)}%
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isVisible
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isVisible ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span>{isVisible ? 'Visible' : 'Away'}</span>
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {st.seconds_since_last_seen}s ago
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
