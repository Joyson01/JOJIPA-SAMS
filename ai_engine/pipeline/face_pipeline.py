import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from ai_engine.alignment.face_aligner import FaceAligner
from ai_engine.base import (
    BoundingBox,
    DecisionState,
    DetectedFace,
    MatchCandidate,
    PoseEstimate,
    QualityMetrics,
    RecognitionResult,
)
from ai_engine.detection.scrfd import SCRFDFaceDetector
from ai_engine.liveness.liveness_detector import LivenessDetector
from ai_engine.quality.pose_estimator import HeadPoseEstimator
from ai_engine.quality.quality_analyzer import FaceQualityAnalyzer
from ai_engine.recognition.arcface import ArcFaceEmbeddingModel
from ai_engine.recognition.vector_matcher import EnrolledTemplate, VectorMatcher


class FaceRecognitionPipeline:
    """Unified Face Recognition Pipeline coordinating Detection -> Quality -> Liveness -> Alignment -> Embedding -> Matching."""

    def __init__(
        self,
        detector: Optional[SCRFDFaceDetector] = None,
        embedder: Optional[ArcFaceEmbeddingModel] = None,
        matcher: Optional[VectorMatcher] = None,
        liveness_detector: Optional[LivenessDetector] = None,
        quality_analyzer: Optional[FaceQualityAnalyzer] = None,
        pose_estimator: Optional[HeadPoseEstimator] = None,
        aligner: Optional[FaceAligner] = None,
    ):
        self.detector = detector or SCRFDFaceDetector(det_size=(640, 640), det_thresh=0.50)
        self.embedder = embedder or ArcFaceEmbeddingModel()
        self.matcher = matcher or VectorMatcher()
        self.liveness_detector = liveness_detector or LivenessDetector()
        self.quality_analyzer = quality_analyzer or FaceQualityAnalyzer()
        self.pose_estimator = pose_estimator or HeadPoseEstimator()
        self.aligner = aligner or FaceAligner(crop_size=112)

    def load_gallery(self, templates: List[EnrolledTemplate]) -> None:
        """Loads and indexes enrolled student templates into the vector search matrix."""
        self.matcher.build_index(templates)

    def process_frame(
        self,
        image: np.ndarray,
        run_quality_check: bool = True,
        run_liveness_check: bool = False,  # Optional flag for passive liveness
        top_k: int = 3,
    ) -> Tuple[List[RecognitionResult], Dict[str, float]]:
        """Executes full face recognition pipeline on a video frame or image.

        Returns:
            Tuple[List[RecognitionResult], Dict[str, float]]: (results, latency_breakdown_ms)
        """
        latencies: Dict[str, float] = {}
        t0 = time.perf_counter()

        # 1. Face Detection
        detected_faces = self.detector.detect(image)
        t1 = time.perf_counter()
        latencies["detection_ms"] = round((t1 - t0) * 1000.0, 2)

        results: List[RecognitionResult] = []
        embedding_time = 0.0
        matching_time = 0.0
        liveness_time = 0.0

        for idx, face in enumerate(detected_faces):
            # 2. Quality & Pose Analysis
            quality = self.quality_analyzer.analyze(image, face.bbox)
            pose = self.pose_estimator.estimate(face.landmarks)

            # If quality check is active and face is unusable, classify as UNCERTAIN
            if run_quality_check and not quality.is_valid:
                results.append(
                    RecognitionResult(
                        face_idx=idx,
                        bbox=face.bbox,
                        landmarks=face.landmarks,
                        decision=DecisionState.UNCERTAIN,
                        best_match=None,
                        top_candidates=[],
                        quality=quality,
                        pose=pose,
                        embedding=None,
                        is_live=False,
                        liveness_score=0.0,
                        decision_reason=f"Quality rejected: {quality.rejection_reason}",
                    )
                )
                continue

            # 3. Liveness / Anti-Spoofing Check
            t_liv_start = time.perf_counter()
            liveness_res = self.liveness_detector.predict(image, face.bbox, face.landmarks)
            liveness_time += (time.perf_counter() - t_liv_start) * 1000.0

            if run_liveness_check and not liveness_res.is_live:
                results.append(
                    RecognitionResult(
                        face_idx=idx,
                        bbox=face.bbox,
                        landmarks=face.landmarks,
                        decision=DecisionState.UNCERTAIN,
                        best_match=None,
                        top_candidates=[],
                        quality=quality,
                        pose=pose,
                        embedding=None,
                        is_live=False,
                        liveness_score=liveness_res.liveness_score,
                        decision_reason=f"Liveness rejected: {liveness_res.rejection_reason}",
                    )
                )
                continue

            # 4. Face Alignment & Embedding Generation
            t_emb_start = time.perf_counter()
            aligned_crop = self.aligner.align(image, face.landmarks)
            embedding = self.embedder.extract_from_crop(aligned_crop)
            embedding_time += (time.perf_counter() - t_emb_start) * 1000.0

            # 5. Vector Similarity Matching
            t_match_start = time.perf_counter()
            decision, best_match, candidates, reason = self.matcher.match(
                query_embedding=embedding,
                top_k=top_k,
            )
            matching_time += (time.perf_counter() - t_match_start) * 1000.0

            results.append(
                RecognitionResult(
                    face_idx=idx,
                    bbox=face.bbox,
                    landmarks=face.landmarks,
                    decision=decision,
                    best_match=best_match,
                    top_candidates=candidates,
                    quality=quality,
                    pose=pose,
                    embedding=embedding,
                    is_live=liveness_res.is_live,
                    liveness_score=liveness_res.liveness_score,
                    decision_reason=reason,
                )
            )

        latencies["liveness_ms"] = round(liveness_time, 2)
        latencies["embedding_ms"] = round(embedding_time, 2)
        latencies["matching_ms"] = round(matching_time, 2)
        latencies["total_pipeline_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)

        return results, latencies

    def process_enrollment_image(
        self,
        image: np.ndarray,
    ) -> Tuple[bool, Optional[np.ndarray], Optional[QualityMetrics], Optional[PoseEstimate], str]:
        """Evaluates a candidate enrollment photo and extracts the normalized template if acceptable.

        Returns:
            Tuple[is_accepted, embedding, quality, pose, guidance_message]
        """
        detected_faces = self.detector.detect(image)

        if len(detected_faces) == 0:
            return False, None, None, None, "No face detected. Position your face clearly in frame."

        if len(detected_faces) > 1:
            return False, None, None, None, f"Multiple faces ({len(detected_faces)}) detected. Ensure only one person is in view."

        face = detected_faces[0]
        quality = self.quality_analyzer.analyze(image, face.bbox)
        if not quality.is_valid:
            return False, None, quality, None, quality.rejection_reason or "Image quality insufficient."

        pose = self.pose_estimator.estimate(face.landmarks)
        if not pose.is_frontal:
            return False, None, quality, pose, f"Face angle is too steep (Yaw {pose.yaw}°, Pitch {pose.pitch}°). Face closer to center."

        # Verify liveness during enrollment
        liv = self.liveness_detector.predict(image, face.bbox, face.landmarks)
        if not liv.is_live:
            return False, None, quality, pose, f"Enrollment liveness check failed: {liv.rejection_reason}"

        aligned_crop = self.aligner.align(image, face.landmarks)
        embedding = self.embedder.extract_from_crop(aligned_crop)

        return True, embedding, quality, pose, "Valid sample accepted."
