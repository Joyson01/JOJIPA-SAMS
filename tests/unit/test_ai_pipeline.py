import os
from pathlib import Path
import cv2
import numpy as np
import pytest

from ai_engine.base import DecisionState
from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline
from ai_engine.recognition.vector_matcher import EnrolledTemplate

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture(scope="module")
def face_pipeline():
    """Module-scoped pipeline instance to reuse ONNX sessions across tests."""
    return FaceRecognitionPipeline()


def test_real_pipeline_enroll_and_recognize(face_pipeline):
    pankaj_img1_path = WORKSPACE_ROOT / "data" / "students" / "Pankaj" / "pankaj_img1.jpg"
    pankaj_img2_path = WORKSPACE_ROOT / "data" / "students" / "Pankaj" / "pankaj_img2.jpg"
    jyoti_img2_path = WORKSPACE_ROOT / "data" / "students" / "Jyoti" / "jyoti_img2.jpg"
    pankaj_test_path = WORKSPACE_ROOT / "src" / "Test" / "pankaj.jpg"
    joy_test_path = WORKSPACE_ROOT / "data" / "students" / "joy.jpg"

    if not pankaj_img1_path.exists():
        pytest.skip("Dataset images not found on disk")

    # 1. Read enrollment images
    img_p1 = cv2.imread(str(pankaj_img1_path))
    img_p2 = cv2.imread(str(pankaj_img2_path))
    img_j2 = cv2.imread(str(jyoti_img2_path))

    # 2. Process enrollment samples
    ok_p1, emb_p1, q_p1, pose_p1, _ = face_pipeline.process_enrollment_image(img_p1)
    ok_p2, emb_p2, q_p2, pose_p2, _ = face_pipeline.process_enrollment_image(img_p2)
    ok_j2, emb_j2, q_j2, pose_j2, _ = face_pipeline.process_enrollment_image(img_j2)

    assert ok_p1 is True
    assert emb_p1 is not None and emb_p1.shape == (512,)
    assert ok_p2 is True
    assert ok_j2 is True

    # 3. Load Gallery with multiple templates
    templates = [
        EnrolledTemplate("p1", "s_pankaj", "STU-001", "CSE-01", "Pankaj", emb_p1, q_p1.sharpness, pose_p1.pose_type),
        EnrolledTemplate("p2", "s_pankaj", "STU-001", "CSE-01", "Pankaj", emb_p2, q_p2.sharpness, pose_p2.pose_type),
        EnrolledTemplate("p3", "s_jyoti", "STU-002", "CSE-02", "Jyoti", emb_j2, q_j2.sharpness, pose_j2.pose_type),
    ]
    face_pipeline.load_gallery(templates)

    # 4. Recognize Pankaj Test Image
    img_test_pankaj = cv2.imread(str(pankaj_test_path))
    results_pankaj, latencies_pankaj = face_pipeline.process_frame(img_test_pankaj)

    assert len(results_pankaj) >= 1
    best_face = results_pankaj[0]
    assert best_face.decision == DecisionState.KNOWN
    assert best_face.best_match is not None
    assert best_face.best_match.name == "Pankaj"
    assert best_face.best_match.similarity >= 0.65

    # Check latency
    assert latencies_pankaj["total_pipeline_ms"] > 0
    print(f"\n[LATENCY BENCHMARK] Single face pipeline: {latencies_pankaj}")

    # 5. Recognize Stranger (Joy is NOT enrolled in gallery)
    if joy_test_path.exists():
        img_test_joy = cv2.imread(str(joy_test_path))
        results_joy, _ = face_pipeline.process_frame(img_test_joy)
        assert len(results_joy) >= 1
        joy_face = results_joy[0]
        # Stranger must NOT be classified as KNOWN
        assert joy_face.decision in [DecisionState.UNKNOWN, DecisionState.UNCERTAIN]
        if joy_face.best_match:
            assert joy_face.best_match.similarity < 0.58


def test_multi_person_classroom_recognition(face_pipeline):
    grp_path = WORKSPACE_ROOT / "src" / "Test" / "test_grp.jpg"
    if not grp_path.exists():
        pytest.skip("Group image not found")

    img_grp = cv2.imread(str(grp_path))
    results, latencies = face_pipeline.process_frame(img_grp, top_k=2)

    # Must detect multiple faces
    assert len(results) > 1
    print(f"\n[GROUP BENCHMARK] Detected {len(results)} faces in {latencies['total_pipeline_ms']}ms")

    # Verify every face has a valid decision state
    for r in results:
        assert r.decision in [DecisionState.KNOWN, DecisionState.UNKNOWN, DecisionState.UNCERTAIN]
        assert r.bbox.width > 0 and r.bbox.height > 0

