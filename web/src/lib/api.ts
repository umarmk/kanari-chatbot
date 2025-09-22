import axios from 'axios';
import { useAuth } from '../store/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({ baseURL: API_BASE, withCredentials: true });

// Attach Authorization header when we have an access token
api.interceptors.request.use((config) => {
  const { accessToken } = useAuth.getState();
  const url = config.url || '';
  const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/logout');
  if (accessToken && !isAuthEndpoint) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let pending: Array<() => void> = [];

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { response, config } = error || {};
    if (!response || response.status !== 401 || config.__retried) throw error;

    const store = useAuth.getState();
    if (!store.refreshToken) {
      store.clear();
      throw error;
    }

    if (isRefreshing) {
      await new Promise<void>((resolve) => pending.push(resolve));
    } else {
      isRefreshing = true;
      try {
        const res = await api.post('/auth/refresh', { refresh_token: store.refreshToken });
        store.setTokens(res.data.access_token, res.data.refresh_token);
      } catch (e) {
        store.clear();
        pending = [];
        isRefreshing = false;
        throw error;
      }
      isRefreshing = false;
      pending.forEach((fn) => fn());
      pending = [];
    }

    // retry once with new token
    const retry = { ...config, __retried: true };
    retry.headers = retry.headers || {};
    const { accessToken } = useAuth.getState();
    (retry.headers as any).Authorization = accessToken ? `Bearer ${accessToken}` : undefined;
    return api.request(retry);
  },
);

