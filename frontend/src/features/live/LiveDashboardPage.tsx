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
  Upload,
  Image as ImageIcon,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Check,
  SwitchCamera,
} from 'lucide-react';
import { fetchCameras, testRegisteredCamera, captureCameraFrame } from '../../services/cameraApi';
import { fetchSessions } from '../../services/attendanceApi';
import {
  recognizeImageAttendance,
  recognizeFrameAttendance,
  PhotoRecognitionResponse,
} from '../../services/attendanceApi';
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
  // Mobile Device Detection
  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

  // Mode Selector: LIVE_CAMERA | CAPTURE_PHOTO | UPLOAD_PHOTO
  const [attendanceMode, setAttendanceMode] = useState<'LIVE_CAMERA' | 'CAPTURE_PHOTO' | 'UPLOAD_PHOTO'>('LIVE_CAMERA');

  // Facing mode state: Mobile defaults to environment (rear), Laptop defaults to user (webcam)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(isMobileDevice ? 'environment' : 'user');

  // Data State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loadingCameras, setLoadingCameras] = useState<boolean>(true);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Camera Diagnostic Test State
  const [testingCamera, setTestingCamera] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Mode 1 (Live Camera) Stream State
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
  const [verifiedCount, setVerifiedCount] = useState<number>(0);
  const [verifyingCount, setVerifyingCount] = useState<number>(0);
  const [activeFaceResults, setActiveFaceResults] = useState<any[]>([]);
  const [framesProcessedTotal, setFramesProcessedTotal] = useState<number>(0);
  const [unknownCount, setUnknownCount] = useState<number>(0);

  // Mode 2 (Capture Photo) State
  const [captureCameraActive, setCaptureCameraActive] = useState<boolean>(false);
  const [captureCameraStarting, setCaptureCameraStarting] = useState<boolean>(false);
  const [captureCameraError, setCaptureCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [processingCapturedPhoto, setProcessingCapturedPhoto] = useState<boolean>(false);
  const [captureRecognitionResult, setCaptureRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [captureErrorMessage, setCaptureErrorMessage] = useState<string | null>(null);
  const [showCaptureOverlay, setShowCaptureOverlay] = useState<boolean>(true);

  // Mode 3 (Upload Photo) State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [processingUploadPhoto, setProcessingUploadPhoto] = useState<boolean>(false);
  const [uploadRecognitionResult, setUploadRecognitionResult] = useState<PhotoRecognitionResponse | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [showUploadOverlay, setShowUploadOverlay] = useState<boolean>(true);

  // DOM Refs - Live Camera
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

  // DOM Refs - Capture Photo
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const captureFrameCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureImageRef = useRef<HTMLImageElement>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);

  // DOM Refs - Upload Photo
  const uploadImageRef = useRef<HTMLImageElement>(null);
  const uploadOverlayCanvasRef = useRef<HTMLCanvasElement>(null);

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

      const active = sessionList.find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSessionId(active.id);
        if (active.camera_id && camList.some((c) => c.id === active.camera_id)) {
          setSelectedCameraId(active.camera_id);
        } else if (camList.length > 0) {
          setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
        }
      } else if (sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].id);
        if (sessionList[0].camera_id && camList.some((c) => c.id === sessionList[0].camera_id)) {
          setSelectedCameraId(sessionList[0].camera_id);
        } else if (camList.length > 0) {
          setSelectedCameraId((prev) => (prev && camList.some((c) => c.id === prev) ? prev : camList[0].id));
        }
      } else if (camList.length > 0) {
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
    if (selectedSessionId && sessions.length > 0) {
      const sess = sessions.find((s) => s.id === selectedSessionId);
      if (sess && sess.camera_id && cameras.some((c) => c.id === sess.camera_id)) {
        setSelectedCameraId(sess.camera_id);
      }
    }
  }, [selectedSessionId, sessions, cameras]);

  useEffect(() => {
    loadResources();
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

  // Draw Face Bounding Boxes Over Video or Remote Stream (Mode 1)
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

      const status = face.status || (face.decision === 'KNOWN' ? 'VERIFIED' : face.decision === 'UNCERTAIN' ? 'VERIFYING' : 'UNKNOWN');
      const isVerified = status === 'VERIFIED';
      const isVerifying = status === 'VERIFYING';
      const isRejected = status === 'QUALITY_REJECTED' || face.is_quality_valid === false;

      let strokeColor = '#94a3b8';
      let bgColor = 'rgba(51, 65, 85, 0.95)';
      let label = 'UNKNOWN FACE';
      const simVal = face.similarity !== undefined ? face.similarity : (face.best_match ? face.best_match.similarity : 0.40);
      let subLabel = `${Math.round(simVal * 100)}% Similarity`;

      if (isRejected) {
        strokeColor = '#f43f5e';
        bgColor = 'rgba(225, 29, 72, 0.95)';
        label = 'LOW QUALITY FACE';
        subLabel = face.reason || face.decision_reason || 'Blur or steep angle';
      } else if (isVerified) {
        strokeColor = '#10b981';
        bgColor = 'rgba(5, 150, 105, 0.95)';
        const name = face.student_name || (face.best_match ? face.best_match.name : 'STUDENT');
        const conf = Math.round(simVal * 100);
        label = `${name.toUpperCase()} (VERIFIED • ${conf}%)`;
        subLabel = `Track #${face.track_id ?? '1'} • VISIBLE`;
      } else if (isVerifying) {
        strokeColor = '#f59e0b';
        bgColor = 'rgba(217, 119, 6, 0.95)';
        const name = face.provisional_name || face.student_name || (face.best_match ? face.best_match.name : 'SCANNING...');
        const conf = Math.round(simVal * 100);
        const needed = face.frames_needed || 2;
        label = `${name.toUpperCase()} (VERIFYING • ${conf}%)`;
        subLabel = `Need ${needed} more clear frame${needed > 1 ? 's' : ''}`;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isVerified ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.roundRect(renderX, y1, boxW, boxH, 8);
      ctx.stroke();

      ctx.font = 'bold 11px Inter, sans-serif';
      const mainTextWidth = ctx.measureText(label).width;
      const subTextWidth = ctx.measureText(subLabel).width;
      const pillWidth = Math.max(mainTextWidth, subTextWidth) + 16;
      const pillHeight = 32;
      const pillY = Math.max(4, y1 - pillHeight - 4);

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(renderX, pillY, pillWidth, pillHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, renderX + 8, pillY + 13);

      ctx.font = 'normal 10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(subLabel, renderX + 8, pillY + 26);
    });
  }, []);

  // Stop Live Attendance Stream (Mode 1)
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

  // Start Live Attendance (Mode 1)
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (wsDownlinkRef.current) {
        wsDownlinkRef.current.close();
        wsDownlinkRef.current = null;
      }

      if (selectedCamera.source_type === 'WEBCAM') {
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
        if (selectedCamera.source_type === 'RTSP') {
          try {
            await apiClient.post(`/cameras/${selectedCamera.id}/start`);
          } catch (startErr) {
            console.warn('CCTV worker auto-start notice:', startErr);
          }
        }

        setMjpegTimestamp(Date.now());

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
      recognitionIntervalRef.current = setInterval(processCurrentFrame, 750);
    } catch (err: any) {
      console.error('Camera connection failure:', err);
      setCameraState('ERROR');
      let msg = err.message || 'Camera failed to start.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera permissions in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical webcam hardware detected.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Webcam is currently locked or in use by another program.';
      }
      setCameraError(msg);
    }
  };

  useEffect(() => {
    return () => {
      stopLiveAttendance();
      stopCaptureCamera();
    };
  }, []);

  // Frame Capture & Recognition Dispatcher (Mode 1)
  const processCurrentFrame = async () => {
    if (isProcessingRef.current || !selectedCamera) return;

    if (selectedCamera.source_type === 'WEBCAM') {
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
      setActiveFaceResults(faces);

      const verified = faces.filter((f: any) => f.status === 'VERIFIED' || f.decision === 'KNOWN').length;
      const verifying = faces.filter((f: any) => f.status === 'VERIFYING' || (f.decision === 'UNCERTAIN' && f.best_match)).length;
      const unks = faces.filter((f: any) => f.decision === 'UNKNOWN' && !f.best_match).length;

      setVerifiedCount(verified);
      setVerifyingCount(verifying);
      if (unks > 0) setUnknownCount((c) => c + unks);

      drawOverlayBoxes(faces, width, height, isMirrored);

      const hasKnown = faces.some((f: any) => f.status === 'VERIFIED' || f.decision === 'KNOWN');
      if (hasKnown) {
        fetchPresenceData();
      }
    } catch (err) {
      // quiet frame skip
    }
  };

  const handleCameraChange = (cameraId: string) => {
    stopLiveAttendance();
    setSelectedCameraId(cameraId);
    setCameraError(null);
    setTestResult(null);
  };

  const handleTestCamera = async () => {
    if (!selectedCamera) return;
    setTestingCamera(true);
    setTestResult(null);
    try {
      const res = await testRegisteredCamera(selectedCamera.id);
      setTestResult(res);
      loadResources();
    } catch (err: any) {
      console.error('Camera connection test error:', err);
      setTestResult({
        success: false,
        status: 'OFFLINE',
        message: err.response?.data?.detail || err.message || 'Could not connect to camera stream.',
      });
    } finally {
      setTestingCamera(false);
    }
  };

  const handleCaptureFromLiveCamera = async () => {
    if (!selectedCamera) return;
    setCaptureErrorMessage(null);
    try {
      if (selectedCamera.source_type === 'WEBCAM') {
        const video = videoRef.current;
        if (video && video.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                setCapturedBlob(blob);
                setCapturedPreviewUrl(url);
                setCaptureRecognitionResult(null);
                setAttendanceMode('CAPTURE_PHOTO');
                stopLiveAttendance();
              }
            }, 'image/jpeg', 0.95);
          }
        } else {
          setCameraError('Webcam frame not ready yet.');
        }
      } else {
        // IP Camera / RTSP stream: Grab high-res snapshot directly from backend
        const cap = await captureCameraFrame(selectedCamera.id);
        if (cap && cap.frame_url) {
          setCapturedBlob(null);
          setCapturedPreviewUrl(cap.frame_url);
          setCaptureRecognitionResult(null);
          setAttendanceMode('CAPTURE_PHOTO');
          stopLiveAttendance();
        }
      }
    } catch (err: any) {
      console.error('Failed to capture frame from camera:', err);
      const msg = err.response?.data?.detail || err.message || 'Failed to capture frame from camera.';
      setCameraError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  // =========================================================================
  // MODE 2: CAPTURE PHOTO (MOBILE + DESKTOP) IMPLEMENTATION
  // =========================================================================
  const startCaptureCamera = async (targetFacingMode: 'environment' | 'user' = facingMode) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCaptureCameraError('Camera access is unavailable. Secure HTTPS context is required for mobile browsers.');
      return;
    }

    setCaptureCameraStarting(true);
    setCaptureCameraError(null);
    setCaptureErrorMessage(null);

    try {
      if (captureStreamRef.current) {
        captureStreamRef.current.getTracks().forEach((t) => t.stop());
        captureStreamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: targetFacingMode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (modeErr) {
        console.warn(`Specific facingMode '${targetFacingMode}' fallback:`, modeErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      captureStreamRef.current = stream;

      const video = captureVideoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch (e) {
          console.warn('Capture video initial play notice:', e);
        }
      }

      setFacingMode(targetFacingMode);
      setCaptureCameraActive(true);
      setCapturedBlob(null);
      setCapturedPreviewUrl(null);
      setCaptureRecognitionResult(null);
    } catch (err: any) {
      console.error('Capture camera error:', err);
      let msg = err.message || 'Failed to start camera for photo capture.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical camera hardware was detected on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is currently locked or in use by another app.';
      }
      setCaptureCameraError(msg);
      setCaptureCameraActive(false);
    } finally {
      setCaptureCameraStarting(false);
    }
  };

  const stopCaptureCamera = () => {
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((t) => t.stop());
      captureStreamRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null;
    }
    setCaptureCameraActive(false);
  };

  const handleSwitchCamera = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (captureCameraActive) {
      await startCaptureCamera(newMode);
    }
  };

  const handleCaptureFrame = () => {
    const video = captureVideoRef.current;
    const canvas = captureFrameCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      setCaptureErrorMessage('Camera is not ready yet. Please wait for camera stream.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) {
        setCaptureErrorMessage('Failed to capture frame from video.');
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setCapturedPreviewUrl(blobUrl);
      setCaptureRecognitionResult(null);
      setCaptureErrorMessage(null);
      stopCaptureCamera();
    }, 'image/jpeg', 0.95);
  };

  const handleRetakePhoto = () => {
    if (capturedPreviewUrl && capturedPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setCaptureRecognitionResult(null);
    setCaptureErrorMessage(null);
    startCaptureCamera(facingMode);
  };

  const drawPhotoBoundingBoxes = (
    results: any[],
    imageElement: HTMLImageElement,
    canvasElement: HTMLCanvasElement
  ) => {
    if (!imageElement || !canvasElement || !Array.isArray(results)) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    const naturalWidth = imageElement.naturalWidth || imageElement.width || 1;
    const naturalHeight = imageElement.naturalHeight || imageElement.height || 1;
    const displayedWidth = imageElement.clientWidth || imageElement.width || naturalWidth;
    const displayedHeight = imageElement.clientHeight || imageElement.height || naturalHeight;

    canvasElement.width = displayedWidth;
    canvasElement.height = displayedHeight;
    ctx.clearRect(0, 0, displayedWidth, displayedHeight);

    const scaleX = displayedWidth / naturalWidth;
    const scaleY = displayedHeight / naturalHeight;

    results.forEach((item) => {
      if (!item.bbox) return;
      const x1 = (item.bbox.x1 ?? item.bbox.x ?? 0) * scaleX;
      const y1 = (item.bbox.y1 ?? item.bbox.y ?? 0) * scaleY;
      const x2 = (item.bbox.x2 ?? (item.bbox.x + (item.bbox.width || 0))) * scaleX;
      const y2 = (item.bbox.y2 ?? (item.bbox.y + (item.bbox.height || 0))) * scaleY;
      const w = Math.max(0, x2 - x1);
      const h = Math.max(0, y2 - y1);

      const isRecognized = item.status === 'recognized' || item.status === 'VERIFIED';
      const isAlreadyMarked = item.status === 'already_marked' || item.already_present;
      const isLowQuality = item.status === 'low_quality';

      let strokeColor = '#94a3b8';
      let bgColor = 'rgba(51, 65, 85, 0.95)';
      let label = `${item.name || 'Unknown'} (${item.confidence_pct || 0}%)`;

      if (isRecognized && !isAlreadyMarked) {
        strokeColor = '#10b981'; // Green
        bgColor = 'rgba(5, 150, 105, 0.95)';
        label = `✓ ${item.name} (${item.confidence_pct}%) [PRESENT]`;
      } else if (isAlreadyMarked) {
        strokeColor = '#3b82f6'; // Blue
        bgColor = 'rgba(37, 99, 235, 0.95)';
        label = `✓ ${item.name} (${item.confidence_pct}%) [ALREADY PRESENT]`;
      } else if (isLowQuality) {
        strokeColor = '#f59e0b'; // Orange
        bgColor = 'rgba(217, 119, 6, 0.95)';
        label = `⚠ Low Quality (${item.rejection_reason || 'Blur/Small'})`;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x1, y1, w, h, 6);
      ctx.stroke();

      ctx.font = 'bold 11px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const pillW = textWidth + 14;
      const pillH = 22;
      const pillY = Math.max(2, y1 - pillH - 3);

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(x1, pillY, pillW, pillH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x1 + 7, pillY + 15);
    });
  };

  const handleRecognizeCapturePhoto = async () => {
    if (!selectedSessionId) {
      setCaptureErrorMessage('Please select an attendance session before recognizing photo.');
      return;
    }
    if (!capturedBlob && !capturedPreviewUrl) {
      setCaptureErrorMessage('No captured photo available. Please take a photo first.');
      return;
    }

    setProcessingCapturedPhoto(true);
    setCaptureErrorMessage(null);

    try {
      let resp: PhotoRecognitionResponse;
      if (capturedBlob) {
        resp = await recognizeImageAttendance(selectedSessionId, capturedBlob, 0.40);
      } else if (capturedPreviewUrl && capturedPreviewUrl.startsWith('/outputs/')) {
        resp = await recognizeFrameAttendance({
          sessionId: selectedSessionId,
          cameraId: selectedCameraId || undefined,
          frameUrl: capturedPreviewUrl,
          threshold: 0.40,
        });
      } else {
        resp = await recognizeFrameAttendance({
          sessionId: selectedSessionId,
          cameraId: selectedCameraId || undefined,
          threshold: 0.40,
        });
      }

      if (!resp || typeof resp !== 'object') {
        throw new Error('Invalid response received from face recognition backend.');
      }
      setCaptureRecognitionResult(resp);
      fetchPresenceData();
    } catch (err: any) {
      console.error('Error recognizing captured photo:', err);
      const msg = err.response?.data?.detail || err.message || 'Photo recognition failed. Please try again.';
      setCaptureErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setProcessingCapturedPhoto(false);
    }
  };

  // =========================================================================
  // MODE 3: UPLOAD PHOTO IMPLEMENTATION
  // =========================================================================
  const handleUploadSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setUploadFile(file);
    setUploadPreviewUrl(preview);
    setUploadRecognitionResult(null);
    setUploadErrorMessage(null);
  };

  const handleRecognizeUploadPhoto = async () => {
    if (!selectedSessionId) {
      setUploadErrorMessage('Please select an attendance session before processing uploaded photo.');
      return;
    }
    if (!uploadFile) {
      setUploadErrorMessage('No image uploaded. Please choose an image file.');
      return;
    }

    setProcessingUploadPhoto(true);
    setUploadErrorMessage(null);

    try {
      const resp = await recognizeImageAttendance(selectedSessionId, uploadFile, 0.40);
      if (!resp || typeof resp !== 'object') {
        throw new Error('Invalid response received from face recognition backend.');
      }
      setUploadRecognitionResult(resp);
      fetchPresenceData();
    } catch (err: any) {
      console.error('Error recognizing uploaded photo:', err);
      const msg = err.response?.data?.detail || err.message || 'Image recognition failed. Please try again.';
      setUploadErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setProcessingUploadPhoto(false);
    }
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
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Live Attendance & Presence</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Multi-modal biometric attendance (Live Camera, Mobile Snapshot, Photo Upload) powered by InsightFace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Attendance Input Mode Selector */}
          <div className="w-full sm:w-auto bg-slate-100 p-1 rounded-2xl flex items-center border border-slate-200 shadow-xs justify-between sm:justify-start">
            <button
              onClick={() => {
                if (cameraState === 'STREAMING') stopLiveAttendance();
                stopCaptureCamera();
                setAttendanceMode('LIVE_CAMERA');
              }}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition ${
                attendanceMode === 'LIVE_CAMERA'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              <span>Live Camera</span>
            </button>

            <button
              onClick={() => {
                if (cameraState === 'STREAMING') stopLiveAttendance();
                setAttendanceMode('CAPTURE_PHOTO');
              }}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition ${
                attendanceMode === 'CAPTURE_PHOTO'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Capture Photo</span>
            </button>

            <button
              onClick={() => {
                if (cameraState === 'STREAMING') stopLiveAttendance();
                stopCaptureCamera();
                setAttendanceMode('UPLOAD_PHOTO');
              }}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition ${
                attendanceMode === 'UPLOAD_PHOTO'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo</span>
            </button>
          </div>

          {/* Session Selector */}
          <div className="w-full sm:w-auto flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 shrink-0">Session:</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={cameraState === 'STREAMING'}
              className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm truncate"
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

          {/* Mode 1 Start / Stop Button */}
          {attendanceMode === 'LIVE_CAMERA' && (
            <>
              <div className="w-full sm:w-auto flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 shrink-0">Camera:</span>
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
                    {onNavigate && (
                      <button
                        onClick={() => onNavigate('cameras')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Camera</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    disabled={cameraState === 'STREAMING'}
                    className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm max-w-xs truncate"
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

              {cameraState === 'STREAMING' ? (
                <button
                  onClick={stopLiveAttendance}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Attendance</span>
                </button>
              ) : (
                <button
                  onClick={startLiveAttendance}
                  disabled={cameraState === 'STARTING' || cameras.length === 0 || !selectedSessionId}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
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
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: LIVE CAMERA VIEWPORT */}
      {/* ========================================================================= */}
      {attendanceMode === 'LIVE_CAMERA' && (
        <div className="space-y-6 animate-in fade-in-50">
          {selectedCamera && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    {selectedCamera.source_type === 'MOBILE' ? (
                      <Smartphone className="w-4.5 h-4.5" />
                    ) : selectedCamera.source_type === 'RTSP' ? (
                      <Tv className="w-4.5 h-4.5" />
                    ) : (
                      <VideoIcon className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span className="text-sm">{selectedCamera.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        {selectedCamera.source_type === 'RTSP' ? 'CCTV / RTSP' : selectedCamera.source_type === 'MOBILE' ? 'Mobile IP Camera' : 'Hardware Webcam'}
                      </span>
                      <span className="text-slate-400 font-normal hidden sm:inline">· {selectedCamera.location}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Stream:</span>
                      <span className="font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        {selectedCamera.stream_url || selectedCamera.device_id || 'Webcam'}
                      </span>
                      <span>· Status:</span>
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
                      {selectedCamera.fps > 0 && <span>· {selectedCamera.fps} FPS</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestCamera}
                    disabled={testingCamera}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition border border-slate-200 disabled:opacity-50"
                  >
                    {testingCamera ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    <span>{testingCamera ? 'Testing Stream...' : 'Test Connection'}</span>
                  </button>

                  <button
                    onClick={loadResources}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition border border-slate-200"
                    title="Refresh Camera Status"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold">{testResult.status}: </span>
                      <span>{testResult.message}</span>
                    </div>
                  </div>
                  {testResult.latency_ms && (
                    <span className="font-mono text-[11px] font-bold shrink-0">
                      {testResult.latency_ms} ms
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {cameraError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 shadow-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm">Camera Stream Failed</div>
                <p>{cameraError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
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

                  <canvas ref={captureCanvasRef} className="hidden" />
                  <canvas
                    ref={overlayCanvasRef}
                    className={`absolute inset-0 w-full h-full pointer-events-none ${
                      cameraState === 'STREAMING' ? 'block' : 'hidden'
                    }`}
                  />

                  {cameraState === 'IDLE' && (
                    <div className="text-center text-slate-400 space-y-2 p-6">
                      <Camera className="w-12 h-12 mx-auto text-slate-600" />
                      <p className="text-sm font-semibold text-slate-200">
                        {selectedCamera ? `${selectedCamera.name} is Standby` : 'No Camera Selected'}
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Click "Start Attendance" to initialize biometric recognition on this camera.
                      </p>
                    </div>
                  )}

                  {cameraState === 'STARTING' && (
                    <div className="text-center text-white space-y-2 p-6">
                      <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500" />
                      <p className="text-xs font-semibold">Connecting to camera...</p>
                    </div>
                  )}

                  {cameraState === 'STREAMING' && isMobileNoFrame && (
                    <div className="text-center text-amber-300 space-y-2 p-6">
                      <Smartphone className="w-10 h-10 mx-auto text-amber-400 animate-pulse" />
                      <p className="text-sm font-bold">Mobile Connected — Waiting for Video</p>
                    </div>
                  )}

                  {cameraState === 'ERROR' && (
                    <div className="text-center text-rose-400 space-y-2 p-6">
                      <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
                      <p className="text-xs font-semibold">Camera Stream Offline</p>
                    </div>
                  )}

                  {cameraState === 'STREAMING' && (
                    <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2 border border-white/10">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>
                        {selectedCamera?.name} ({videoResolution.width > 0 ? `${videoResolution.width}×${videoResolution.height}` : 'Live'}) — {activeFacesDetected} Face(s)
                      </span>
                    </div>
                  )}

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

                {debugMode && cameraState === 'STREAMING' && (
                  <div className="mt-3 p-3.5 bg-slate-950/90 backdrop-blur-md rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-2.5 font-mono shadow-xl">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 uppercase font-sans">Pipeline Latency</div>
                        <div className="font-bold text-emerald-400 text-sm mt-0.5">{lastLatencyMs} ms</div>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 uppercase font-sans">Verified In View</div>
                        <div className="font-bold text-emerald-400 text-sm mt-0.5">{verifiedCount}</div>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 uppercase font-sans">Verifying Frames</div>
                        <div className="font-bold text-amber-400 text-sm mt-0.5">{verifyingCount}</div>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                        <div className="text-[10px] text-slate-400 uppercase font-sans">Frames Processed</div>
                        <div className="font-bold text-blue-400 text-sm mt-0.5">{framesProcessedTotal}</div>
                      </div>
                    </div>

                    {activeFaceResults.length > 0 && (
                      <div className="pt-1 border-t border-slate-800/60 space-y-1">
                        <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Active Face Observations:</div>
                        <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                          {activeFaceResults.map((f, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-900/60 px-2 py-1 rounded text-[11px]">
                              <span className={f.status === 'VERIFIED' ? 'text-emerald-400 font-bold' : f.status === 'VERIFYING' ? 'text-amber-400' : 'text-slate-400'}>
                                {f.status === 'VERIFIED' ? `[VERIFIED] ${f.student_name || f.best_match?.name}` : f.status === 'VERIFYING' ? `[VERIFYING] ${f.provisional_name || f.best_match?.name || 'STUDENT'}` : '[UNKNOWN] Face'}
                              </span>
                              <span className="text-slate-400">
                                {Math.round((f.similarity || f.best_match?.similarity || 0) * 100)}% sim
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Stream Controls Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={handleCaptureFromLiveCamera}
                    disabled={!selectedSessionId || !selectedCamera}
                    className="flex-1 sm:flex-none min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition border border-slate-700 shadow-sm active:scale-95 disabled:opacity-50"
                    title="Freeze latest camera frame and process with InsightFace"
                  >
                    <Camera className="w-4 h-4 text-blue-400" />
                    <span>📸 Capture Photo</span>
                  </button>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {cameraState === 'STREAMING' ? (
                      <button
                        onClick={stopLiveAttendance}
                        className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <Square className="w-4 h-4" />
                        <span>Stop Live Attendance</span>
                      </button>
                    ) : (
                      <button
                        onClick={startLiveAttendance}
                        disabled={cameraState === 'STARTING' || !selectedCamera || !selectedSessionId}
                        className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                      >
                        {cameraState === 'STARTING' ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Start Live Attendance</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm text-center">
                  <div className="text-[11px] text-slate-400 font-medium">Marked Present</div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{totalMarkedPresent}</div>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 shadow-sm text-center">
                  <div className="text-[11px] text-emerald-600 font-medium">In Frame (Verified)</div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">{verifiedCount || currentlyVisibleCount}</div>
                </div>
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3.5 shadow-sm text-center">
                  <div className="text-[11px] text-amber-600 font-medium">Verifying Frames</div>
                  <div className="text-xl font-bold text-amber-700 mt-1">{verifyingCount}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 shadow-sm text-center">
                  <div className="text-[11px] text-slate-500 font-medium">Unknown / Away</div>
                  <div className="text-xl font-bold text-slate-700 mt-1">{unknownCount > 0 ? unknownCount : awayCount}</div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Attendance Roster */}
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
      )}

      {/* ========================================================================= */}
      {/* MODE 2: CAPTURE PHOTO (MOBILE + DESKTOP) VIEWPORT */}
      {/* ========================================================================= */}
      {attendanceMode === 'CAPTURE_PHOTO' && (
        <div className="space-y-6 animate-in fade-in-50">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Camera / Captured Frame & Results */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
                
                {/* Header with Camera Facing Selector & Switch Button */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-white">
                    <Camera className="w-5 h-5 text-blue-400" />
                    <span className="font-bold text-sm">Classroom Photo Capture</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Camera Selector (Rear vs Front) */}
                    <div className="bg-slate-800/80 p-0.5 rounded-xl flex items-center border border-slate-700">
                      <button
                        onClick={() => {
                          setFacingMode('environment');
                          if (captureCameraActive) startCaptureCamera('environment');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          facingMode === 'environment'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Rear Camera
                      </button>
                      <button
                        onClick={() => {
                          setFacingMode('user');
                          if (captureCameraActive) startCaptureCamera('user');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          facingMode === 'user'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Front Camera
                      </button>
                    </div>

                    {/* Switch Camera Button */}
                    <button
                      onClick={handleSwitchCamera}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
                      title="Switch Camera (Front / Rear)"
                    >
                      <SwitchCamera className="w-4 h-4 text-blue-400" />
                    </button>
                  </div>
                </div>

                {/* Camera Viewport Container (Responsive Full-width) */}
                <div className="relative aspect-video sm:aspect-video w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner min-h-[260px] sm:min-h-[380px]">
                  
                  {/* Live Mobile / Webcam Stream */}
                  <video
                    ref={captureVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      facingMode === 'user' ? 'transform -scale-x-100' : ''
                    } ${captureCameraActive && !capturedPreviewUrl ? 'block' : 'hidden'}`}
                  />

                  {/* Hidden High-Resolution Capture Canvas */}
                  <canvas ref={captureFrameCanvasRef} className="hidden" />

                  {/* Captured Photo Preview with AI Bounding Box Canvas Overlay */}
                  {capturedPreviewUrl && (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img
                        ref={captureImageRef}
                        src={capturedPreviewUrl}
                        alt="Captured Classroom Photo"
                        onLoad={() => {
                          if (captureImageRef.current && captureOverlayCanvasRef.current && captureRecognitionResult?.results) {
                            drawPhotoBoundingBoxes(
                              captureRecognitionResult.results,
                              captureImageRef.current,
                              captureOverlayCanvasRef.current
                            );
                          }
                        }}
                        className="max-h-full max-w-full object-contain block"
                      />
                      <canvas
                        ref={captureOverlayCanvasRef}
                        className={`absolute inset-0 w-full h-full pointer-events-none ${
                          showCaptureOverlay ? 'block' : 'hidden'
                        }`}
                      />
                    </div>
                  )}

                  {/* Idle Prompt */}
                  {!captureCameraActive && !capturedPreviewUrl && (
                    <div className="text-center text-slate-400 space-y-2 p-6">
                      <Camera className="w-12 h-12 mx-auto text-slate-600" />
                      <p className="text-sm font-semibold text-slate-200">
                        {isMobileDevice ? 'Mobile Camera Standby' : 'Camera Standby'}
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {isMobileDevice
                          ? 'Tap "Start Camera" to activate your phone rear camera, frame the classroom, and snap a high-resolution attendance photo.'
                          : 'Click "Start Camera" to preview your classroom stream, then snap a photo to recognize all students.'}
                      </p>
                    </div>
                  )}

                  {captureCameraStarting && (
                    <div className="text-center text-white space-y-2 p-6">
                      <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500" />
                      <p className="text-xs font-semibold">
                        Activating {facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}...
                      </p>
                    </div>
                  )}

                  {/* Camera Status Badge */}
                  {captureCameraActive && !capturedPreviewUrl && (
                    <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium flex items-center gap-2 border border-white/10">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>
                        {facingMode === 'environment' ? 'Rear Camera (Classroom View)' : 'Front Camera'} · Ready to Snap
                      </span>
                    </div>
                  )}
                </div>

                {/* Helpful Errors & Guidance */}
                {captureCameraError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold">Camera Access Notice</div>
                      <p>{captureCameraError}</p>
                      <p className="text-[11px] text-rose-300/80">
                        Mobile Note: When connecting over local Wi-Fi, ensure you visit via HTTPS or allow camera permissions in your mobile browser.
                      </p>
                    </div>
                  </div>
                )}

                {captureErrorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{captureErrorMessage}</span>
                  </div>
                )}

                {/* Touch-Friendly Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    {!captureCameraActive && !capturedPreviewUrl && (
                      <button
                        onClick={() => startCaptureCamera(facingMode)}
                        disabled={captureCameraStarting || !selectedSessionId}
                        className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition shadow-sm disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Start Camera</span>
                      </button>
                    )}

                    {captureCameraActive && !capturedPreviewUrl && (
                      <>
                        <button
                          onClick={handleCaptureFrame}
                          className="flex-1 sm:flex-none min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition shadow-sm active:scale-95"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Capture Photo</span>
                        </button>
                        <button
                          onClick={handleSwitchCamera}
                          className="min-h-[48px] px-3.5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
                          title="Switch Camera"
                        >
                          <SwitchCamera className="w-4 h-4 text-blue-400" />
                        </button>
                        <button
                          onClick={stopCaptureCamera}
                          className="min-h-[48px] px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition border border-slate-700"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline ml-1">Stop</span>
                        </button>
                      </>
                    )}

                    {capturedPreviewUrl && (
                      <button
                        onClick={handleRetakePhoto}
                        disabled={processingCapturedPhoto}
                        className="flex-1 sm:flex-none min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition border border-slate-700 disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Retake Photo</span>
                      </button>
                    )}
                  </div>

                  {capturedPreviewUrl && (
                    <div className="flex items-center gap-2.5">
                      {captureRecognitionResult && (
                        <button
                          onClick={() => setShowCaptureOverlay(!showCaptureOverlay)}
                          className={`min-h-[48px] inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-2xl text-xs font-bold transition border ${
                            showCaptureOverlay
                              ? 'bg-blue-900/40 text-blue-300 border-blue-700'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {showCaptureOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">{showCaptureOverlay ? 'Overlays Visible' : 'Overlays Hidden'}</span>
                        </button>
                      )}

                      <button
                        onClick={handleRecognizeCapturePhoto}
                        disabled={processingCapturedPhoto || !selectedSessionId}
                        className="flex-1 sm:flex-none min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50 active:scale-95"
                      >
                        {processingCapturedPhoto ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Recognizing Faces & Marking...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Recognize & Mark Attendance</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo Recognition Results Card */}
              {captureRecognitionResult && (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 animate-in fade-in-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Attendance Results</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Latency: {captureRecognitionResult.processing_time_ms} ms · InsightFace buffalo_l Pipeline
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  </div>

                  {/* Summary Metric Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Faces Detected</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">{captureRecognitionResult.faces_detected || 0}</div>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-emerald-600">Students Recognized</div>
                      <div className="text-lg sm:text-xl font-black text-emerald-700 mt-0.5">{captureRecognitionResult.students_recognized || 0}</div>
                    </div>
                    <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-blue-600">Marked Present</div>
                      <div className="text-lg sm:text-xl font-black text-blue-700 mt-0.5">{captureRecognitionResult.attendance_marked || 0}</div>
                    </div>
                    <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-amber-600">Already Present</div>
                      <div className="text-lg sm:text-xl font-black text-amber-700 mt-0.5">{captureRecognitionResult.duplicates_skipped || 0}</div>
                    </div>
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 col-span-2 sm:col-span-1">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Unknown Faces</div>
                      <div className="text-lg sm:text-xl font-black text-slate-700 mt-0.5">{captureRecognitionResult.unknown_faces || 0}</div>
                    </div>
                  </div>

                  {/* Results Table */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-slate-800">Detected Student Identities</h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Roll / Code</th>
                            <th className="p-3">Confidence</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Attendance Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {Array.isArray(captureRecognitionResult.results) && captureRecognitionResult.results.length > 0 ? (
                            captureRecognitionResult.results.map((st, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70 transition">
                                <td className="p-3 font-bold text-slate-900">{st.name || st.student_name}</td>
                                <td className="p-3 font-mono text-[11px] text-slate-500">{st.roll_number || st.student_code || '—'}</td>
                                <td className="p-3 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                    st.status === 'recognized'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : st.status === 'already_marked'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : st.status === 'low_quality'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {st.status === 'already_marked' ? 'ALREADY PRESENT' : st.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {st.attendance_marked ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 w-fit">
                                      <Check className="w-3 h-3" />
                                      <span>MARKED PRESENT</span>
                                    </span>
                                  ) : st.already_present ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold w-fit">
                                      ALREADY PRESENT
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">Not Marked</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                                No faces detected in captured photo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Attendance Roster */}
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

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[520px] pr-1">
                {presenceList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-semibold text-slate-700">No Attendance Marked Yet</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Recognized students will appear in this roster immediately.
                    </p>
                  </div>
                ) : (
                  presenceList.map((st) => (
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
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        PRESENT
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: UPLOAD PHOTO VIEWPORT */}
      {/* ========================================================================= */}
      {attendanceMode === 'UPLOAD_PHOTO' && (
        <div className="space-y-6 animate-in fade-in-50">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Upload Area & Results */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Upload Classroom Photo</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Upload a classroom photo (JPG, PNG, WEBP). Multiple students in a single frame are recognized independently with duplicate protection.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <label className="w-full sm:w-auto cursor-pointer min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200">
                    <Upload className="w-4 h-4" />
                    <span>Choose Photo (JPG, PNG, WEBP)</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadSelect} className="hidden" />
                  </label>

                  {uploadFile && (
                    <div className="text-xs font-mono text-slate-600 flex items-center gap-2">
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{uploadFile.name}</span>
                      </span>
                    </div>
                  )}
                </div>

                {uploadPreviewUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="relative max-h-[500px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
                      <img
                        ref={uploadImageRef}
                        src={uploadPreviewUrl}
                        alt="Classroom Photo Preview"
                        onLoad={() => {
                          if (uploadImageRef.current && uploadOverlayCanvasRef.current && uploadRecognitionResult?.results) {
                            drawPhotoBoundingBoxes(
                              uploadRecognitionResult.results,
                              uploadImageRef.current,
                              uploadOverlayCanvasRef.current
                            );
                          }
                        }}
                        className="max-h-[500px] w-auto object-contain block select-none"
                      />
                      <canvas
                        ref={uploadOverlayCanvasRef}
                        className={`absolute inset-0 w-full h-full pointer-events-none ${
                          showUploadOverlay ? 'block' : 'hidden'
                        }`}
                      />
                    </div>

                    {uploadErrorMessage && (
                      <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{uploadErrorMessage}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {uploadRecognitionResult && (
                          <button
                            onClick={() => setShowUploadOverlay(!showUploadOverlay)}
                            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                              showUploadOverlay
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {showUploadOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{showUploadOverlay ? 'AI Overlays Visible' : 'AI Overlays Hidden'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        onClick={handleRecognizeUploadPhoto}
                        disabled={processingUploadPhoto || !selectedSessionId}
                        className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50 active:scale-95"
                      >
                        {processingUploadPhoto ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Recognizing Faces & Marking Attendance...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Recognize & Mark Attendance</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Recognition Results */}
              {uploadRecognitionResult && (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 animate-in fade-in-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Upload Recognition Results</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Latency: {uploadRecognitionResult.processing_time_ms} ms · InsightFace buffalo_l Pipeline
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  </div>

                  {/* Summary Metric Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                    <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Faces Detected</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">{uploadRecognitionResult.faces_detected || 0}</div>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-emerald-600">Students Recognized</div>
                      <div className="text-lg sm:text-xl font-black text-emerald-700 mt-0.5">{uploadRecognitionResult.students_recognized || 0}</div>
                    </div>
                    <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-blue-600">Marked Present</div>
                      <div className="text-lg sm:text-xl font-black text-blue-700 mt-0.5">{uploadRecognitionResult.attendance_marked || 0}</div>
                    </div>
                    <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3">
                      <div className="text-[10px] uppercase font-bold text-amber-600">Already Present</div>
                      <div className="text-lg sm:text-xl font-black text-amber-700 mt-0.5">{uploadRecognitionResult.duplicates_skipped || 0}</div>
                    </div>
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 col-span-2 sm:col-span-1">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Unknown Faces</div>
                      <div className="text-lg sm:text-xl font-black text-slate-700 mt-0.5">{uploadRecognitionResult.unknown_faces || 0}</div>
                    </div>
                  </div>

                  {/* Results Table */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-slate-800">Detected Student Identities</h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                          <tr>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Roll / Code</th>
                            <th className="p-3">Confidence</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Attendance Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {Array.isArray(uploadRecognitionResult.results) && uploadRecognitionResult.results.length > 0 ? (
                            uploadRecognitionResult.results.map((st, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70 transition">
                                <td className="p-3 font-bold text-slate-900">{st.name || st.student_name}</td>
                                <td className="p-3 font-mono text-[11px] text-slate-500">{st.roll_number || st.student_code || '—'}</td>
                                <td className="p-3 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                    st.status === 'recognized'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : st.status === 'already_marked'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : st.status === 'low_quality'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {st.status === 'already_marked' ? 'ALREADY PRESENT' : st.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {st.attendance_marked ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 w-fit">
                                      <Check className="w-3 h-3" />
                                      <span>MARKED PRESENT</span>
                                    </span>
                                  ) : st.already_present ? (
                                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold w-fit">
                                      ALREADY PRESENT
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">Not Marked</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                                No faces detected in uploaded photo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Attendance Roster */}
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

              <div className="flex-1 overflow-y-auto space-y-2 max-h-[520px] pr-1">
                {presenceList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-semibold text-slate-700">No Attendance Marked Yet</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Recognized students will appear in this roster immediately.
                    </p>
                  </div>
                ) : (
                  presenceList.map((st) => (
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
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        PRESENT
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
