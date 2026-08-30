import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Square,
  UserCheck,
  HelpCircle,
  Camera,
  Calendar,
  Activity,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
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

interface PhysicalDevice {
  deviceId: string;
  label: string;
}

export const LiveDashboardPage: React.FC = () => {
  // Data State
  const [dbCameras, setDbCameras] = useState<CameraDevice[]>([]);
  const [physicalDevices, setPhysicalDevices] = useState<PhysicalDevice[]>([]);
  const [selectedCameraSource, setSelectedCameraSource] = useState<string>('default');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Camera Lifecycle & Stream State
  const [cameraState, setCameraState] = useState<'IDLE' | 'STARTING' | 'STREAMING' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [debugMode, setDebugMode] = useState<boolean>(false);

  // Presence Tracking State
  const [presenceList, setPresenceList] = useState<StudentPresenceItem[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const [activeFacesDetected, setActiveFacesDetected] = useState<number>(0);
  const [framesProcessedTotal, setFramesProcessedTotal] = useState<number>(0);
  const [unknownCount, setUnknownCount] = useState<number>(0);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionIntervalRef = useRef<any>(null);
  const presencePollIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Load Sessions, DB Cameras & Hardware Devices
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [camList, sessionList] = await Promise.all([
          fetchCameras(),
          fetchSessions(),
        ]);
        setDbCameras(camList);
        setSessions(sessionList);
        const active = sessionList.find((s) => s.status === 'ACTIVE');
        if (active) {
          setSelectedSessionId(active.id);
        } else if (sessionList.length > 0) {
          setSelectedSessionId(sessionList[0].id);
        }
      } catch (err) {
        console.error('Failed to load live resources:', err);
      }

      // Enumerate physical hardware video inputs
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const vInputs = allDevices
            .filter((d) => d.kind === 'videoinput')
            .map((d, idx) => ({
              deviceId: d.deviceId,
              label: d.label || `Hardware Webcam ${idx + 1}`,
            }));
          setPhysicalDevices(vInputs);
        }
      } catch (devErr) {
        console.warn('Could not enumerate video inputs:', devErr);
      }
    };

    loadResources();
  }, []);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

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

  // Draw Face Bounding Boxes Over Video
  const drawOverlayBoxes = useCallback((faces: any[], vWidth: number, vHeight: number) => {
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
      const mirroredX1 = vWidth - x2;

      const isKnown = face.decision === 'KNOWN';
      const isUncertain = face.decision === 'UNCERTAIN';
      const strokeColor = isKnown ? '#10b981' : isUncertain ? '#f59e0b' : '#94a3b8';

      // Draw bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(mirroredX1, y1, boxW, boxH, 8);
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
      ctx.roundRect(mirroredX1, Math.max(4, y1 - 22), textWidth + 14, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, mirroredX1 + 7, Math.max(16, y1 - 7));
    });
  }, []);

  // Stop Live Stream
  const stopLiveAttendance = () => {
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
  };

  // Start Live Stream with Real Camera Connection
  const startLiveAttendance = async () => {
    setCameraState('STARTING');
    setCameraError(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is unavailable. Secure context (HTTPS) is required.');
      }

      const constraints: MediaStreamConstraints = {
        video: selectedCameraSource !== 'default' && !selectedCameraSource.startsWith('db-')
          ? { deviceId: { exact: selectedCameraSource }, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
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

      setCameraState('STREAMING');

      // Frame recognition loop (every 750ms)
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
        msg = 'Webcam is currently locked or in use by another program (e.g. Zoom, Chrome).';
      } else if (err.name === 'SecurityError') {
        msg = 'Insecure context. Camera access requires HTTPS.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    return () => stopLiveAttendance();
  }, []);

  // Process Live Frame against Recognition Pipeline
  const processCurrentFrame = async () => {
    if (isProcessingRef.current || !videoRef.current || !captureCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    // Verify video is active and non-zero
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

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

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const startTime = performance.now();
      try {
        const res = await apiClient.post('/recognition/process', formData, {
          params: {
            session_id: selectedSessionId || undefined,
            camera_id: selectedCameraSource,
          },
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const elapsed = Math.round(performance.now() - startTime);
        setLastLatencyMs(elapsed);
        setFramesProcessedTotal((prev) => prev + 1);

        const data = res.data;
        const faces = data.faces || [];
        setActiveFacesDetected(faces.length);

        // Draw bounding boxes on the overlay canvas
        drawOverlayBoxes(faces, video.videoWidth, video.videoHeight);

        // Count unknown faces
        const unks = faces.filter((f: any) => f.decision === 'UNKNOWN').length;
        if (unks > 0) setUnknownCount((c) => c + unks);

        // Refresh presence list immediately if any known face was seen
        const hasKnown = faces.some((f: any) => f.decision === 'KNOWN');
        if (hasKnown) {
          fetchPresenceData();
        }
      } catch (err) {
        // quiet frame skip
      } finally {
        isProcessingRef.current = false;
      }
    }, 'image/jpeg', 0.85);
  };

  // Compute presence totals
  const totalMarkedPresent = presenceList.filter((p) => p.attendance_status === 'PRESENT').length;
  const currentlyVisibleCount = presenceList.filter((p) => p.presence_state === 'PRESENT_AND_VISIBLE').length;
  const awayCount = presenceList.filter((p) => p.presence_state !== 'PRESENT_AND_VISIBLE').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Attendance & Presence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time biometric attendance (marked once) with continuous presence tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Session Selector */}
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            disabled={cameraState === 'STREAMING'}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            {sessions.length === 0 ? (
              <option value="">No Active Sessions</option>
            ) : (
              sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject} ({s.class_name}) - [{s.status}]
                </option>
              ))
            )}
          </select>

          {/* Camera Source Selector */}
          <select
            value={selectedCameraSource}
            onChange={(e) => {
              setSelectedCameraSource(e.target.value);
              if (cameraState === 'STREAMING') {
                stopLiveAttendance();
              }
            }}
            disabled={cameraState === 'STREAMING'}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option value="default">Default Web Camera</option>
            {physicalDevices.map((d, idx) => (
              <option key={d.deviceId || idx} value={d.deviceId}>
                {d.label}
              </option>
            ))}
            {dbCameras.map((c) => (
              <option key={c.id} value={`db-${c.id}`}>
                {c.name} ({c.location})
              </option>
            ))}
          </select>

          {/* Start / Stop Button */}
          {cameraState === 'STREAMING' ? (
            <button
              onClick={stopLiveAttendance}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-sm"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Attendance</span>
            </button>
          ) : (
            <button
              onClick={startLiveAttendance}
              disabled={cameraState === 'STARTING'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm disabled:opacity-50"
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

      {/* Error Alert */}
      {cameraError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm">Camera Stream Failed</div>
            <p>{cameraError}</p>
            <p className="text-[11px] text-rose-700">
              Try visiting <a href="/camera-test" className="underline font-bold">/camera-test</a> to verify hardware webcam stream directly.
            </p>
          </div>
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Feed & Summary Metrics (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
              {/* The Video Element */}
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
              <canvas ref={captureCanvasRef} className="hidden" />
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  cameraState === 'STREAMING' ? 'block' : 'hidden'
                }`}
              />

              {/* Idle Placeholder */}
              {cameraState === 'IDLE' && (
                <div className="text-center text-slate-400 space-y-2 p-6">
                  <Camera className="w-12 h-12 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-200">Camera Feed is Standby</p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Select a class session and click "Start Attendance" to launch live multi-face detection.
                  </p>
                </div>
              )}

              {/* Connecting Placeholder */}
              {cameraState === 'STARTING' && (
                <div className="text-center text-white space-y-2 p-6">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500" />
                  <p className="text-xs font-semibold">Opening webcam hardware stream...</p>
                </div>
              )}

              {/* Error Placeholder */}
              {cameraState === 'ERROR' && (
                <div className="text-center text-rose-400 space-y-2 p-6">
                  <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
                  <p className="text-xs font-semibold">Camera Offline</p>
                </div>
              )}

              {/* Status Pill on Feed */}
              {cameraState === 'STREAMING' && (
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2 border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>
                    {videoResolution.width > 0
                      ? `Live Stream (${videoResolution.width} × ${videoResolution.height}) — ${activeFacesDetected} Face(s)`
                      : 'Initializing Stream...'}
                  </span>
                </div>
              )}

              {/* Diagnostics Button */}
              {cameraState === 'STREAMING' && (
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className="absolute top-3 right-3 bg-black/70 backdrop-blur-md hover:bg-black/90 px-2.5 py-1 rounded-full text-white text-[11px] font-medium flex items-center gap-1.5 transition border border-white/10"
                >
                  <Activity className="w-3 h-3 text-blue-400" />
                  <span>{debugMode ? 'Hide Stats' : 'Show Stats'}</span>
                </button>
              )}
            </div>

            {/* Summary Metrics: Attendance & Presence */}
            <div className="grid grid-cols-3 gap-4 pt-4 text-center divide-x divide-slate-800 text-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-400">Total Present (Once)</div>
                <div className="text-2xl font-bold text-white mt-1">{totalMarkedPresent}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400">Currently Visible</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{currentlyVisibleCount}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400">Temporarily Away</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{awayCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Presence Roster (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Enrolled Presence</span>
              </h3>
              <span className="text-xs font-medium text-slate-400">
                {presenceList.length} Tracked
              </span>
            </div>

            {selectedSession && (
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate font-medium">
                  {selectedSession.subject} ({selectedSession.class_name})
                </span>
              </div>
            )}

            {presenceList.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-1">
                <HelpCircle className="w-6 h-6 mx-auto text-slate-300" />
                <p className="text-xs font-medium text-slate-500">No students verified yet</p>
                <p className="text-[11px] text-slate-400">Students will be marked PRESENT once, then tracked for visibility.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {presenceList.map((item) => {
                  const isVisible = item.presence_state === 'PRESENT_AND_VISIBLE';
                  const isOccluded = item.presence_state === 'TEMPORARILY_NOT_VISIBLE';

                  return (
                    <div
                      key={item.student_id}
                      className={`p-3 rounded-xl border transition text-xs space-y-1.5 ${
                        isVisible
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isOccluded
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{item.student_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{item.student_code} ({item.roll_number})</div>
                        </div>

                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white inline-block">
                            {item.attendance_status}
                          </span>
                        </div>
                      </div>

                      {/* Presence State Pill */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          {isVisible ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700 font-semibold">Visible Live</span>
                            </>
                          ) : isOccluded ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                              <span className="text-amber-700 font-medium">
                                Occluded ({item.seconds_since_last_seen}s ago)
                              </span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-500">
                                Away ({Math.round(item.seconds_since_last_seen)}s ago)
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.return_count > 0 ? `Returned: ${item.return_count}x` : `${Math.round(item.confidence * 100)}% match`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Debug Mode Diagnostic Overlay */}
            {debugMode && (
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] space-y-1 text-slate-300">
                <div className="text-blue-400 font-bold">PIPELINE & PRESENCE STATS</div>
                <div>Camera State: {cameraState}</div>
                <div>Resolution: {videoResolution.width} × {videoResolution.height}</div>
                <div>Inference Latency: {lastLatencyMs} ms</div>
                <div>Frames Processed: {framesProcessedTotal}</div>
                <div>Total Unknown Sightings: {unknownCount}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
