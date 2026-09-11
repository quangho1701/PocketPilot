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

// Fixed demo user until auth lands — backend get-or-creates this user on first chat.
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export default api;
