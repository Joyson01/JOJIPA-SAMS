import os
import sys
sys.path.insert(0, os.path.abspath("."))

import cv2
import numpy as np
from ai_engine.detection.scrfd import SCRFDFaceDetector
from ai_engine.pipeline.face_pipeline import FaceRecognitionPipeline

def test_detector_standalone():
    print("=== TESTING SCRFD FACE DETECTOR INDEPENDENTLY ===")
    detector = SCRFDFaceDetector(det_size=(640, 640), det_thresh=0.50)

    # 1. Single Face Test
    img1 = cv2.imread("src/Test/pankaj.jpg")
    assert img1 is not None, "Failed to load src/Test/pankaj.jpg"
    faces1 = detector.detect(img1)
    print(f"Test 1: pankaj.jpg -> Detected {len(faces1)} face(s)")
    for idx, f in enumerate(faces1):
        print(f"   Face #{idx+1}: Box=[{f.bbox.x1:.1f}, {f.bbox.y1:.1f}, {f.bbox.x2:.1f}, {f.bbox.y2:.1f}], Confidence={f.det_score:.3f}")
    assert len(faces1) == 1, f"Expected 1 face, got {len(faces1)}"

    # 2. Multi Face Test
    img2 = cv2.imread("src/Test/test_grp.jpg")
    if img2 is not None:
        faces2 = detector.detect(img2)
        print(f"Test 2: test_grp.jpg -> Detected {len(faces2)} face(s)")
        assert len(faces2) > 1, f"Expected multiple faces, got {len(faces2)}"
    else:
        print("Test 2: test_grp.jpg not found, skipping multi-face")

    # 3. No Face (Blank / Black Image) Test
    img_blank = np.zeros((480, 640, 3), dtype=np.uint8)
    faces_blank = detector.detect(img_blank)
    print(f"Test 3: blank black image -> Detected {len(faces_blank)} face(s)")
    assert len(faces_blank) == 0, f"Expected 0 faces in blank image, got {len(faces_blank)}"

    print("=== ALL STANDALONE DETECTOR TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_detector_standalone()
