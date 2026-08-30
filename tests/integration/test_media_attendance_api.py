import pytest
import io
from datetime import date, time
from PIL import Image

from backend.app.models.entities import AttendanceSession
from backend.app.schemas.attendance import SessionCreate
from backend.app.schemas.subject import SubjectCreate
from backend.app.services.attendance_service import AttendanceService
from backend.app.services.subject_service import SubjectService


@pytest.mark.asyncio
async def test_media_attendance_api_endpoints(client, test_db_session):
    # 1. Setup Subject & Session
    subj = await SubjectService.create_subject(
        test_db_session,
        SubjectCreate(
            code="CS801",
            name="Computer Graphics",
            department="Computer Science",
            credits=4,
            semester=8,
        ),
    )
    sess = await AttendanceService.create_session(
        test_db_session,
        SessionCreate(
            class_name="CSE-8A",
            subject="Computer Graphics",
            room="Graphics Studio",
            scheduled_date=date.today(),
            start_time=time(11, 0),
            end_time=time(12, 0),
            subject_id=subj.id,
        ),
    )

    # 2. Test Image Attendance API
    img = Image.new('RGB', (100, 100), color='white')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    files = {'file': ('classroom.jpg', img_bytes, 'image/jpeg')}
    data = {'session_id': sess.id}

    img_resp = await client.post('/api/v1/media-attendance/image', data=data, files=files)
    assert img_resp.status_code == 200
    img_json = img_resp.json()
    assert img_json['status'] == 'COMPLETED'
    assert img_json['session_id'] == sess.id
    assert img_json['media_type'] == 'IMAGE'
    job_id = img_json['job_id']

    # 3. Test List Jobs API
    list_resp = await client.get('/api/v1/media-attendance/jobs')
    assert list_resp.status_code == 200
    jobs_list = list_resp.json()
    assert len(jobs_list) >= 1

    # 4. Test Get Specific Job
    if job_id:
        get_resp = await client.get(f'/api/v1/media-attendance/jobs/{job_id}')
        assert get_resp.status_code == 200
        assert get_resp.json()['id'] == job_id

        # 5. Test Delete Job
        del_resp = await client.delete(f'/api/v1/media-attendance/jobs/{job_id}')
        assert del_resp.status_code == 204

    # Clean up
    sess_obj = await test_db_session.get(AttendanceSession, sess.id)
    if sess_obj:
        await test_db_session.delete(sess_obj)
    await SubjectService.delete_subject(test_db_session, subj.id)
