import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Play,
  RotateCw,
  Tv,
  AlertCircle,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { apiClient } from '../../services/api';

export const MobileCameraPage: React.FC = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const cameraIdParam = queryParams.get('camera_id') || '';
  const tokenParam = queryParams.get('token') || '';
  const sessionIdParam = queryParams.get('session_id') || '';

  const [cameraId, setCameraId] = useState<string>(cameraIdParam);
  const [cameraName, setCameraName] = useState<string>('Smartphone Station');
  const [cameraLocation, setCameraLocation] = useState<string>('');
  const [sessionValid, setSessionValid] = useState<boolean>(true);
  const [validatingSession, setValidatingSession] = useState<boolean>(!!tokenParam);

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [framesSent, setFramesSent] = useState<number>(0);
  const [lastRecognition, setLastRecognition] = useState<string>('Ready to stream');
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);

  // Validate Pairing Session on Mount
  useEffect(() => {
    if (!tokenParam) {
      setValidatingSession(false);
      return;
    }

    const validate = async () => {
      try {
        const res = await apiClient.get(`/cameras/pairing-session/${tokenParam}`);
        if (res.data && res.data.valid) {
          setCameraId(res.data.camera_id);
          setCameraName(res.data.camera_name || 'Mobile Camera');
          setCameraLocation(res.data.location || 'Classroom');
          setSessionValid(true);
        } else {
          setSessionValid(false);
        }
      } catch (err) {
        setSessionValid(false);
      } finally {
        setValidatingSession(false);
      }
    };

    validate();
  }, [tokenParam]);

  const startCamera = async () => {
    setErrorMessage(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreaming(true);

      // Stream frames to server at controlled rate (600ms = ~1.7 FPS, reliable over mobile Wi-Fi)
      intervalRef.current = setInterval(sendFrameToBackend, 600);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMessage(
        'Could not access smartphone camera. Please verify camera permissions and HTTPS secure context.'
      );
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsStreaming(false);
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    }
  }, [facingMode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const sendFrameToBackend = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append('file', blob, 'mobile_frame.jpg');
        formData.append('camera_id', cameraId);
        if (tokenParam) formData.append('token', tokenParam);
        if (sessionIdParam) formData.append('session_id', sessionIdParam);

        try {
          const res = await apiClient.post('/cameras/mobile-frame', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          setFramesSent((prev) => prev + 1);
          const data = res.data;
          setDetectedCount(data.faces_detected || 0);

          if (data.results && data.results.length > 0) {
            const names = data.results
              .map((r: any) => r.name)
              .filter((n: string) => n !== 'UNKNOWN');
            if (names.length > 0) {
              setLastRecognition(`Identified: ${names.join(', ')}`);
            } else {
              setLastRecognition(`${data.faces_detected} face(s) tracking...`);
            }
          } else {
            setLastRecognition('Scanning for faces...');
          }
        } catch (err) {
          // network frame skip
        }
      },
      'image/jpeg',
      0.8
    );
  };

  if (validatingSession) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center text-xs">
        <div className="space-y-3">
          <Smartphone className="w-10 h-10 animate-bounce mx-auto text-blue-500" />
          <p className="font-semibold">Validating wireless pairing session...</p>
        </div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm space-y-4 shadow-xl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">Pairing Session Expired</h2>
          <p className="text-xs text-slate-400">
            This wireless camera pairing token is invalid, expired, or was revoked. Please generate a new QR code from the SAMS admin console.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs text-white shadow">
            JS
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight text-slate-100">{cameraName}</h1>
            <p className="text-[11px] text-slate-400">{cameraLocation || 'Mobile Camera Station'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <span className="text-slate-300 font-semibold">
            {isStreaming ? 'Live Stream' : 'Standby'}
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="my-2 p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Video Viewport */}
      <div className="my-auto space-y-3">
        <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              facingMode === 'user' ? 'transform -scale-x-100' : ''
            }`}
          />
          <canvas ref={canvasRef} className="hidden" />

          {!isStreaming && (
            <div className="text-center p-6 text-slate-400 space-y-2">
              <Tv className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium text-slate-200">Smartphone Camera Ready</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Tap Start Camera below to begin wireless frame transmission to classroom attendance.
              </p>
            </div>
          )}

          {/* Real-time Recognition Overlay HUD */}
          {isStreaming && (
            <div className="absolute bottom-3 inset-x-3 bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-xl text-center border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-200 font-medium truncate">{lastRecognition}</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                {detectedCount} Face(s)
              </span>
            </div>
          )}
        </div>

        {/* Telemetry Counter */}
        <div className="flex items-center justify-between px-2 text-[11px] text-slate-400 font-mono">
          <span>Camera ID: {cameraId ? cameraId.slice(0, 10) : 'mobile'}</span>
          <span>Frames Sent: {framesSent}</span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              onClick={stopCamera}
              className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]"
            >
              <Square className="w-4 h-4" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98]"
            >
              <Play className="w-4 h-4" />
              <span>Start Camera</span>
            </button>
          )}

          <button
            onClick={toggleFacingMode}
            className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition active:scale-[0.98]"
            title="Switch Front / Rear Camera"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[10px] text-center text-slate-500">
          Keep this browser window active on your phone while capturing classroom attendance.
        </p>
      </div>
    </div>
  );
};
