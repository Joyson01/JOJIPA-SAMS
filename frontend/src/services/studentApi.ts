import { apiClient } from './api';
import {
  Student,
  StudentCreatePayload,
  StudentListResponse,
  StudentStats,
  StudentUpdatePayload,
} from '../types/student';

export interface StudentFilterParams {
  search?: string;
  department?: string;
  class_name?: string;
  section?: string;
  status?: string;
  enrollment_status?: string;
  page?: number;
  limit?: number;
}

export const fetchStudents = async (params: StudentFilterParams = {}): Promise<StudentListResponse> => {
  const response = await apiClient.get<StudentListResponse>('/students', { params });
  return response.data;
};

export const fetchStudentStats = async (): Promise<StudentStats> => {
  const response = await apiClient.get<StudentStats>('/students/stats');
  return response.data;
};

export const fetchStudentById = async (studentId: string): Promise<Student> => {
  const response = await apiClient.get<Student>(`/students/${studentId}`);
  return response.data;
};

export const createStudent = async (payload: StudentCreatePayload): Promise<Student> => {
  const response = await apiClient.post<Student>('/students', payload);
  return response.data;
};

export const updateStudent = async (
  studentId: string,
  payload: StudentUpdatePayload
): Promise<Student> => {
  const response = await apiClient.put<Student>(`/students/${studentId}`, payload);
  return response.data;
};

export const deleteStudent = async (studentId: string): Promise<{ status: string; message: string }> => {
  const response = await apiClient.delete<{ status: string; message: string }>(`/students/${studentId}`);
  return response.data;
};

