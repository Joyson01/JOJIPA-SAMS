import axios from 'axios';
import { ServiceHealthResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Interceptor: Delete Content-Type for FormData so browser sets correct multipart boundary
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type'] && config.data && typeof config.data === 'object') {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

export const fetchHealthStatus = async (): Promise<ServiceHealthResponse> => {
  const response = await apiClient.get<ServiceHealthResponse>('/health');
  return response.data;
};
