import axios from 'axios';
import { ServiceHealthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export const fetchHealthStatus = async (): Promise<ServiceHealthResponse> => {
  const response = await apiClient.get<ServiceHealthResponse>('/health');
  return response.data;
};

