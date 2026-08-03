import axios from 'axios';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Fixed demo user until auth lands — backend get-or-creates this user on first chat.
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export default api;
