import json
from pathlib import Path
import pytest
from starlette.testclient import TestClient

from backend.app.main import app

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


def test_websocket_stream_preview():
    client = TestClient(app)
    with client.websocket_connect("/api/v1/stream/ws/preview") as websocket:
        # 1. Test reset message
        websocket.send_text(json.dumps({"type": "reset"}))
        resp_reset = websocket.receive_json()
        assert resp_reset["type"] == "reset_ack"

        # 2. Test sync gallery message
        websocket.send_text(json.dumps({"type": "sync_gallery"}))
        resp_sync = websocket.receive_json()
        assert resp_sync["type"] == "sync_ack"
        assert "count" in resp_sync

        # 3. Send image frame (bytes)
        img_path = WORKSPACE_ROOT / "src" / "Test" / "pankaj.jpg"
        if img_path.exists():
            with open(img_path, "rb") as f:
                img_bytes = f.read()

            websocket.send_bytes(img_bytes)
            telemetry = websocket.receive_json()

            assert telemetry["type"] == "telemetry"
            assert "fps" in telemetry
            assert "latencies_ms" in telemetry
            assert "faces" in telemetry
            assert telemetry["faces_count"] >= 1
            assert len(telemetry["faces"]) >= 1

            first_face = telemetry["faces"][0]
            assert "track_id" in first_face
            assert "bbox" in first_face
            assert len(first_face["bbox"]) == 5
            assert first_face["decision"] in ["KNOWN", "UNKNOWN", "UNCERTAIN"]

