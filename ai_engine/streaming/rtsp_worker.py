import logging
import threading
import time
from typing import Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger("sams.rtsp_worker")


class RTSPStreamWorker:
    """High-performance threaded RTSP video stream worker.
    
    Features:
    - Dedicated capture thread maintaining a zero-latency latest-frame atomic buffer.
    - Stale frame dropping to avoid buffer lag during network delays or heavy inference loads.
    - Automatic reconnection with exponential backoff (1s, 2s, 4s, up to 30s) on stream drops.
    - Real-time stream telemetry: FPS, total frames captured, dropped frames count.
    """

    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        name: str = "Camera",
        target_fps: int = 15,
        reconnect_interval_sec: float = 2.0,
        max_reconnect_interval_sec: float = 30.0,
    ):
        self.camera_id = camera_id
        self.stream_url = stream_url
        self.name = name
        self.target_fps = target_fps
        self.reconnect_interval_sec = reconnect_interval_sec
        self.max_reconnect_interval_sec = max_reconnect_interval_sec

        # Threading state
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        # Frame Buffer
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_frame_time: float = 0.0
        self._is_connected: bool = False
        self._last_error: Optional[str] = None

        # Telemetry metrics
        self.frames_captured: int = 0
        self.frames_dropped: int = 0
        self.fps: float = 0.0
        self.last_reconnect_time: float = 0.0

    def start(self) -> bool:
        """Starts background RTSP capture thread."""
        if self._running:
            return True

        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, name=f"RTSPWorker-{self.camera_id}", daemon=True)
        self._thread.start()
        logger.info(f"Started RTSP worker for camera '{self.name}' ({self.camera_id}) -> {self.stream_url}")
        return True

    def stop(self) -> None:
        """Stops background RTSP capture thread and releases video source."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None
        self._is_connected = False
        logger.info(f"Stopped RTSP worker for camera '{self.name}' ({self.camera_id})")

    def get_latest_frame(self) -> Tuple[Optional[np.ndarray], float]:
        """Retrieves latest frame without blocking capture thread.
        
        Returns:
            Tuple[Optional[np.ndarray], float]: (frame_bgr, timestamp)
        """
        with self._lock:
            if self._latest_frame is None:
                return None, 0.0
            return self._latest_frame.copy(), self._latest_frame_time

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def status_summary(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "stream_url": self.stream_url,
            "is_connected": self._is_connected,
            "fps": round(self.fps, 1),
            "frames_captured": self.frames_captured,
            "frames_dropped": self.frames_dropped,
            "last_error": self._last_error,
        }

    def _capture_loop(self) -> None:
        """Dedicated thread continuously pulling latest frames and reconnecting on error."""
        reconnect_delay = self.reconnect_interval_sec

        while self._running:
            logger.info(f"Connecting to video stream for camera '{self.name}' at {self.stream_url}...")
            cap: Optional[cv2.VideoCapture] = None

            try:
                # Handle numeric webcam index vs RTSP/file URL
                url = int(self.stream_url) if self.stream_url.isdigit() else self.stream_url
                cap = cv2.VideoCapture(url)

                if not cap.isOpened():
                    raise RuntimeError(f"Failed to open video stream at '{self.stream_url}'")

                # Configure low-latency buffer settings if supported
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                self._is_connected = True
                self._last_error = None
                reconnect_delay = self.reconnect_interval_sec  # Reset backoff on success
                logger.info(f"Stream connected successfully for camera '{self.name}'")

                fps_counter = 0
                fps_start = time.perf_counter()

                while self._running:
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        logger.warning(f"Stream frame read failed for camera '{self.name}'")
                        break

                    now = time.perf_counter()

                    with self._lock:
                        if self._latest_frame is not None:
                            self.frames_dropped += 1
                        self._latest_frame = frame
                        self._latest_frame_time = now
                        self.frames_captured += 1

                    fps_counter += 1
                    if now - fps_start >= 1.0:
                        self.fps = fps_counter / (now - fps_start)
                        fps_counter = 0
                        fps_start = now

                    # Sleep tiny fraction to respect target FPS if reading video file/webcam
                    if self.target_fps > 0:
                        time.sleep(max(0.001, (1.0 / self.target_fps) - 0.01))

            except Exception as e:
                self._last_error = str(e)
                logger.warning(f"RTSP stream error on camera '{self.name}': {e}")
            finally:
                self._is_connected = False
                if cap is not None:
                    cap.release()

            if self._running:
                logger.info(f"Reconnecting camera '{self.name}' in {reconnect_delay:.1f}s...")
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2.0, self.max_reconnect_interval_sec)

