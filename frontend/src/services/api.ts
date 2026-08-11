import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function defaultApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri?.replace(/^\w+:\/\//, '');
  const metroHost = hostUri?.split(':')[0];
  const androidLoopback =
    Platform.OS === 'android' &&
    (metroHost === 'localhost' || metroHost === '127.0.0.1');
  if (__DEV__ && metroHost && !androidLoopback) return `http://${metroHost}:8000`;
  if (__DEV__ && Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://localhost:8000';
}

const api = axios.create({
  // An explicit URL always wins. In Expo development, derive the computer's
  // Metro host so a physical phone does not try to call its own localhost.
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl(),
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

export const generateBudgetProposal = async (
  userId: string,
  payload: Record<string, unknown>
) => {
  const response = await api.post(
    `/api/v1/budget/proposals/generate?user_id=${encodeURIComponent(userId)}`,
    payload
  );
  return response.data;
};

export const updateBudgetProposal = async (
  userId: string,
  budgetId: string,
  payload: Record<string, unknown>
) => {
  const response = await api.patch(
    `/api/v1/budget/proposals/${encodeURIComponent(budgetId)}?user_id=${encodeURIComponent(userId)}`,
    payload
  );
  return response.data;
};

export const approveBudgetProposal = async (userId: string, budgetId: string) => {
  const response = await api.post(
    `/api/v1/budget/proposals/${encodeURIComponent(budgetId)}/approve?user_id=${encodeURIComponent(userId)}`
  );
  return response.data;
};

export const getBudgetProgress = async (userId: string, month: number, year: number) => {
  const response = await api.get('/api/v1/budget/progress', {
    params: { user_id: userId, month, year },
  });
  return response.data;
};

export const listBudgetCategories = async (userId: string) => {
  const response = await api.get('/api/v1/budget/categories', {
    params: { user_id: userId },
  });
  return response.data;
};

export const createBudgetCategory = async (
  userId: string,
  payload: { slug: string; name: string; mapping_group: 'needs' | 'wants' | 'savings' }
) => {
  const response = await api.post('/api/v1/budget/categories', payload, {
    params: { user_id: userId },
  });
  return response.data;
};
// Fixed demo user until auth lands — backend get-or-creates this user on first chat.
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export default api;
