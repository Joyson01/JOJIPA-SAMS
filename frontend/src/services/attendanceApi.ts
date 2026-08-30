import { apiClient } from './api';
import {
  AttendanceOverridePayload,
  AttendanceRecord,
  AttendanceSession,
  SessionCreatePayload,
} from '../types/attendance';

export const fetchSessions = async (filters?: {
  class_name?: string;
  subject?: string;
  subject_id?: string;
  status?: string;
  scheduled_date?: string;
}): Promise<AttendanceSession[]> => {
  const response = await apiClient.get<AttendanceSession[]>('/attendance/sessions', {
    params: filters,
  });
  return response.data;
};

export const fetchSessionById = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await apiClient.get<AttendanceSession>(`/attendance/sessions/${sessionId}`);
  return response.data;
};

export const createSession = async (payload: SessionCreatePayload): Promise<AttendanceSession> => {
  const response = await apiClient.post<AttendanceSession>('/attendance/sessions', payload);
  return response.data;
};

export const startSession = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await apiClient.put<AttendanceSession>(`/attendance/sessions/${sessionId}/start`);
  return response.data;
};

export const closeSession = async (
  sessionId: string,
  autoMarkAbsent = true
): Promise<AttendanceSession> => {
  const response = await apiClient.put<AttendanceSession>(
    `/attendance/sessions/${sessionId}/close`,
    null,
    {
      params: { auto_mark_absent: autoMarkAbsent },
    }
  );
  return response.data;
};

export const fetchSessionRecords = async (
  sessionId: string,
  status?: string
): Promise<AttendanceRecord[]> => {
  const response = await apiClient.get<AttendanceRecord[]>(
    `/attendance/sessions/${sessionId}/records`,
    {
      params: status ? { status } : undefined,
    }
  );
  return response.data;
};

export const overrideRecord = async (
  recordId: string,
  payload: AttendanceOverridePayload
): Promise<AttendanceRecord> => {
  const response = await apiClient.put<AttendanceRecord>(
    `/attendance/records/${recordId}/override`,
    payload
  );
  return response.data;
};

export const markManualAttendance = async (
  sessionId: string,
  studentId: string,
  status: string,
  remarks?: string
): Promise<AttendanceRecord> => {
  const response = await apiClient.post<AttendanceRecord>('/attendance/manual', null, {
    params: {
      session_id: sessionId,
      student_id: studentId,
      status,
      remarks: remarks || 'Manual Attendance',
    },
  });
  return response.data;
};
