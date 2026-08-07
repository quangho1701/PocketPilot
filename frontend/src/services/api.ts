import axios from 'axios';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createBudget = async (userId: string, payload: Record<string, unknown>) => {
  const response = await api.post(`/api/v1/budget/?user_id=${encodeURIComponent(userId)}`, payload);
  return response.data;
};

export const getBudget = async (userId: string) => {
  const response = await api.get(`/api/v1/budget/?user_id=${encodeURIComponent(userId)}`);
  return response.data;
};

export default api;
