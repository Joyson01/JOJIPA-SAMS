import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ai_engine.pipeline.verification import MultiFrameVerifier
from ai_engine.tracking.iou_tracker import IoUTracker
from backend.app.database.session import Base
from backend.app.models.entities import AttendanceSession, Student
from backend.app.services.attendance import AttendanceService


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.database = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.database.close()
        self.engine.dispose()

    def test_multiframe_verification_requires_consistency(self):
        verifier = MultiFrameVerifier(required_frames=3, threshold=0.6)
        self.assertFalse(verifier.add("1", "student", 0.8).confirmed)
        self.assertFalse(verifier.add("1", "student", 0.7).confirmed)
        result = verifier.add("1", "student", 0.9)
        self.assertTrue(result.confirmed)
        self.assertAlmostEqual(result.average_confidence, 0.8)

    def test_tracker_reuses_track_for_overlapping_face(self):
        import numpy as np
        tracker = IoUTracker()
        first = tracker.update([np.array([0, 0, 100, 100])])[0]
        second = tracker.update([np.array([5, 5, 105, 105])])[0]
        self.assertEqual(first, second)

    def test_attendance_prevents_duplicate_record(self):
        student = Student(student_code="S-1", name="Test Student")
        session = AttendanceSession(name="Test Session")
        self.database.add_all([student, session])
        self.database.commit()
        service = AttendanceService()
        first = service.mark_if_valid(self.database, session_id=session.id, student_id=student.id, camera_id=None, track_id="1", confidence=0.9, liveness="disabled", confirmed=True)
        second = service.mark_if_valid(self.database, session_id=session.id, student_id=student.id, camera_id=None, track_id="1", confidence=0.9, liveness="disabled", confirmed=True)
        self.assertTrue(first.marked)
        self.assertFalse(second.marked)


if __name__ == "__main__":
    unittest.main()
