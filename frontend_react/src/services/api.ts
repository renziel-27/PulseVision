import axios from 'axios';

const getBaseUrl = () => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    const cleanUrl = envUrl.replace(/\/+$/, '');
    return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
  }
  return '/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pulsevision_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
