import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Radio, FileVideo, AlertTriangle } from 'lucide-react';
import { CameraDevice } from '../types/camera';

interface CameraPreviewProps {
  camera: CameraDevice;
  className?: string;
  autoPlay?: boolean;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  camera,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [imgError, setImgError] = useState<boolean>(false);

  // Setup stream based on camera source type
  useEffect(() => {
    setStreamError(null);
    setImgError(false);

    if (camera.source_type === 'WEBCAM') {
      let isMounted = true;
      const startWebcam = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            video: camera.device_id
              ? { deviceId: { exact: camera.device_id }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!isMounted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            if (autoPlay) await videoRef.current.play();
          }
        } catch (err: any) {
          console.warn('Webcam preview launch error:', err);
          if (isMounted) setStreamError(err.message || 'Could not access webcam stream.');
        }
      };

      startWebcam();

      return () => {
        isMounted = false;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    } else {
      // For RTSP, Mobile, or Video File -> use server-side MJPEG / preview frame stream
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const streamEndpoint = `${apiUrl}/cameras/${camera.id}/mjpeg`;
      setSnapshotUrl(streamEndpoint);
    }
  }, [camera, autoPlay]);

  const isStreaming = camera.status === 'STREAMING' || camera.status === 'CONNECTED';
  const isNoFrame = camera.status === 'NO_FRAME';

  return (
    <div
      className={`relative bg-slate-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-800 shadow-inner ${className}`}
    >
      {camera.source_type === 'WEBCAM' ? (
        streamError ? (
          <div className="text-center p-4 space-y-2 text-slate-400">
            <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto" />
            <div className="text-xs font-semibold text-slate-300">Webcam Unavailable</div>
            <div className="text-[11px] text-slate-500 max-w-xs">{streamError}</div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay={autoPlay}
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
        )
      ) : (
        // Server-Side Ingestion Stream (RTSP / Mobile / Video File)
        <div className="w-full h-full relative flex items-center justify-center">
          {!imgError && snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={camera.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-6 text-slate-400 space-y-2">
              {camera.source_type === 'MOBILE' ? (
                <Smartphone className="w-8 h-8 mx-auto text-blue-400 animate-pulse" />
              ) : camera.source_type === 'RTSP' ? (
                <Radio className="w-8 h-8 mx-auto text-purple-400 animate-pulse" />
              ) : (
                <FileVideo className="w-8 h-8 mx-auto text-amber-400 animate-pulse" />
              )}
              <div className="text-xs font-semibold text-slate-200">
                {camera.status === 'OFFLINE'
                  ? 'Camera Feed Offline'
                  : isNoFrame
                  ? 'No Video Frames Received'
                  : 'Awaiting Frame Ingestion'}
              </div>
              <div className="text-[11px] text-slate-400 max-w-xs">
                {camera.source_type === 'MOBILE'
                  ? 'Open the mobile camera link on your smartphone to stream live classroom video.'
                  : camera.source_type === 'RTSP'
                  ? 'Ensure RTSP IP camera endpoint is reachable on the local network.'
                  : 'Play video file to feed frames into the AI recognition pipeline.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Status HUD Overlay */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border shadow-sm ${
            isStreaming
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
              : isNoFrame
              ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
              : 'bg-slate-900/80 text-slate-400 border-slate-700/50'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? 'bg-emerald-400 animate-pulse' : isNoFrame ? 'bg-amber-400' : 'bg-slate-500'
            }`}
          />
          <span>{camera.status}</span>
        </span>

        <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/80 text-[10px] font-mono border border-white/10">
          {camera.source_type}
        </span>
      </div>

      {/* Resolution & FPS Indicator Bottom Right */}
      <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono text-slate-300 border border-white/10">
        {camera.resolution} · {camera.fps > 0 ? `${camera.fps} FPS` : `${camera.target_fps} FPS (Target)`}
      </div>
    </div>
  );
};
