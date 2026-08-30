import pytest


@pytest.mark.asyncio
async def test_camera_api_endpoints(client):
    # 1. Register a Camera
    create_payload = {
        "name": "Classroom-3B Dome Camera",
        "location": "Block-C Room 302",
        "source_type": "RTSP",
        "stream_url": "rtsp://192.168.1.150:554/ch0",
        "target_fps": 15,
        "resolution": "1920x1080",
        "is_active": True,
    }
    create_resp = await client.post("/api/v1/cameras", json=create_payload)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["name"] == "Classroom-3B Dome Camera"
    camera_id = data["id"]

    # 2. List Cameras
    list_resp = await client.get("/api/v1/cameras?location=Block-C")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # 3. Get Camera Details
    get_resp = await client.get(f"/api/v1/cameras/{camera_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == camera_id

    # 4. Update Camera
    update_resp = await client.put(f"/api/v1/cameras/{camera_id}", json={"name": "Classroom-3B PTZ Pro"})
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Classroom-3B PTZ Pro"

    # 5. Test Camera Connection Diagnostic
    test_resp = await client.post("/api/v1/cameras/test-connection", json={"stream_url": "rtsp://invalid-test-url:554/live"})
    assert test_resp.status_code == 200
    assert "success" in test_resp.json()

    # 6. Delete Camera
    del_resp = await client.delete(f"/api/v1/cameras/{camera_id}")
    assert del_resp.status_code == 204

