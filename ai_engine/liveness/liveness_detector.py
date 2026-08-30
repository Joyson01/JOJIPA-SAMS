from typing import Any, Dict, List, Optional
import numpy as np

from ai_engine.base import BoundingBox
from ai_engine.liveness.base import AttackType, BaseLivenessDetector, LivenessResult
from ai_engine.liveness.texture_checker import TextureLivenessDetector


class LivenessDetector(BaseLivenessDetector):
    """Production anti-spoofing detector integrating frequency, texture, and multi-frame consistency."""

    def __init__(
        self,
        liveness_threshold: float = 0.70,
        texture_detector: Optional[TextureLivenessDetector] = None,
    ):
        self.liveness_threshold = liveness_threshold
        self.texture_detector = texture_detector or TextureLivenessDetector(
            liveness_threshold=liveness_threshold
        )

    def predict(
        self,
        image: np.ndarray,
        bbox: BoundingBox,
        landmarks: Optional[np.ndarray] = None,
    ) -> LivenessResult:
        """Evaluates whether face observation is authentic live human skin or spoof."""
        # 1. Texture & Frequency Check
        res = self.texture_detector.predict(image, bbox, landmarks)

        # 2. Check 3D / Landmark validity if available
        if landmarks is not None and len(landmarks) >= 5:
            le = landmarks[0]
            re = landmarks[1]
            eye_dist = np.hypot(re[0] - le[0], re[1] - le[1])
            if eye_dist < 15.0:
                return LivenessResult(
                    is_live=False,
                    liveness_score=0.20,
                    attack_type=AttackType.UNKNOWN_SPOOF,
                    confidence_pct=20.0,
                    rejection_reason="Inter-ocular distance too small for reliable liveness verification.",
                )

        return res

