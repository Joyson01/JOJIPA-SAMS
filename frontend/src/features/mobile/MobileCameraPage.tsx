import React, { useState, useEffect, useRef } from 'react';
import {
  Square,
  Play,
  RotateCw,
  Tv,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '../../services/api';

export const MobileCameraPage: React.FC = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const cameraId = queryParams.get('camera_id') || 'mobile-default';
  const token = queryParams.get('token') || '';
  const sessionId = queryParams.get('session_id') || '';

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [framesSent, setFramesSent] = useState<number>(0);
  const [lastRecognition, setLastRecognition] = useState<string>('Ready to scan');
  const [detectedCount, setDetectedCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);

  const startCamera = async () => {
    setErrorMessage(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsStreaming(true);

      // Start periodic frame ingestion
      intervalRef.current = setInterval(sendFrameToBackend, 1200);
    } catch (err: any) {
      console.error('Camera error:', err);
      setErrorMessage(
        'Could not access mobile camera. Please ensure HTTPS and camera permissions are allowed.'
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

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const formData = new FormData();
      formData.append('file', blob, 'mobile_frame.jpg');
      formData.append('camera_id', cameraId);
      if (token) formData.append('token', token);
      if (sessionId) formData.append('session_id', sessionId);

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
            setLastRecognition(`Recognized: ${names.join(', ')}`);
          } else {
            setLastRecognition(`${data.faces_detected} face(s) scanning...`);
          }
        } else {
          setLastRecognition('Scanning for faces...');
        }
      } catch (err) {
        // quiet network frame failure
      }
    }, 'image/jpeg', 0.85);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-xs text-white">
            JS
          </div>
          <div>
            <h1 className="font-bold text-sm leading-none">JOJIPA-SAMS</h1>
            <p className="text-[10px] text-slate-400">Mobile Camera Station</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
            }`}
          ></span>
          <span className="text-slate-300 font-medium">
            {isStreaming ? 'Live' : 'Standby'}
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

      {/* Main Viewport */}
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
              <p className="text-sm font-medium text-slate-200">Mobile Camera Ready</p>
              <p className="text-xs text-slate-500">
                Press Start below to begin streaming classroom attendance.
              </p>
            </div>
          )}

          {/* Status Overlay */}
          {isStreaming && (
            <div className="absolute bottom-3 inset-x-3 bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl text-center border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-200 truncate">{lastRecognition}</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded">
                {detectedCount} Face(s)
              </span>
            </div>
          )}
        </div>

        {/* Telemetry Counter */}
        <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
          <span>Camera ID: {cameraId.slice(0, 12)}</span>
          <span>Frames Sent: {framesSent}</span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              onClick={stopCamera}
              className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition"
            >
              <Square className="w-4 h-4" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition"
            >
              <Play className="w-4 h-4" />
              <span>Start Camera</span>
            </button>
          )}

          <button
            onClick={toggleFacingMode}
            className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Switch Camera (Front/Rear)"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[10px] text-center text-slate-500">
          Keep this screen active while capturing classroom attendance.
        </p>
      </div>
    </div>
  );
};
