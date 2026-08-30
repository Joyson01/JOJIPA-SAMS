import axios from 'axios';
import {
  AttendanceOverridePayload,
  AttendanceRecord,
  AttendanceSession,
  SessionCreatePayload,
} from '../types/attendance';

const API_BASE = '/api/v1/attendance';

export const fetchSessions = async (status?: string): Promise<AttendanceSession[]> => {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const response = await axios.get<AttendanceSession[]>(`${API_BASE}/sessions`, { params });
  return response.data;
};

export const fetchSessionById = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await axios.get<AttendanceSession>(`${API_BASE}/sessions/${sessionId}`);
  return response.data;
};

export const createSession = async (payload: SessionCreatePayload): Promise<AttendanceSession> => {
  const response = await axios.post<AttendanceSession>(`${API_BASE}/sessions`, payload);
  return response.data;
};

export const startSession = async (sessionId: string): Promise<AttendanceSession> => {
  const response = await axios.put<AttendanceSession>(`${API_BASE}/sessions/${sessionId}/start`);
  return response.data;
};

export const closeSession = async (sessionId: string, autoMarkAbsent = true): Promise<AttendanceSession> => {
  const response = await axios.put<AttendanceSession>(
    `${API_BASE}/sessions/${sessionId}/close?auto_mark_absent=${autoMarkAbsent}`
  );
  return response.data;
};

export const fetchSessionRecords = async (
  sessionId: string,
  status?: string
): Promise<AttendanceRecord[]> => {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const response = await axios.get<AttendanceRecord[]>(`${API_BASE}/sessions/${sessionId}/records`, {
    params,
  });
  return response.data;
};

export const overrideRecord = async (
  recordId: string,
  payload: AttendanceOverridePayload
): Promise<AttendanceRecord> => {
  const response = await axios.put<AttendanceRecord>(
    `${API_BASE}/records/${recordId}/override`,
    payload
  );
  return response.data;
};

