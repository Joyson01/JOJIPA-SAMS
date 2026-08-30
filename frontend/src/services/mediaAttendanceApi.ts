import { apiClient } from './api';
import {
  MediaAnalysisResponse,
  MediaJobResponse,
} from '../types/mediaAttendance';

export const analyzeImageAttendance = async (
  sessionId: string,
  file: File
): Promise<MediaAnalysisResponse> => {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('file', file);

  const response = await apiClient.post<MediaAnalysisResponse>(
    '/media-attendance/image',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return response.data;
};

export const processVideoAttendance = async (
  sessionId: string,
  file: File,
  sampleFps: number = 3.0
): Promise<MediaJobResponse> => {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('sample_fps', sampleFps.toString());
  formData.append('file', file);

  const response = await apiClient.post<MediaJobResponse>(
    '/media-attendance/video',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return response.data;
};

export const fetchMediaJobs = async (
  sessionId?: string,
  limit: number = 50
): Promise<MediaJobResponse[]> => {
  const response = await apiClient.get<MediaJobResponse[]>('/media-attendance/jobs', {
    params: {
      session_id: sessionId || undefined,
      limit,
    },
  });
  return response.data;
};

export const fetchMediaJob = async (jobId: string): Promise<MediaJobResponse> => {
  const response = await apiClient.get<MediaJobResponse>(`/media-attendance/jobs/${jobId}`);
  return response.data;
};

export const cancelMediaJob = async (jobId: string): Promise<void> => {
  await apiClient.post(`/media-attendance/jobs/${jobId}/cancel`);
};

export const deleteMediaJob = async (jobId: string): Promise<void> => {
  await apiClient.delete(`/media-attendance/jobs/${jobId}`);
};
