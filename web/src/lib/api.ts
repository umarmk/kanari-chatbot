import axios from 'axios';
import { useAuth } from '../store/auth';
import { log } from './logger';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({ baseURL: API_BASE, withCredentials: true });
// Separate client for refresh to avoid interceptor recursion / deadlocks when refresh itself 401s.
const refreshApi = axios.create({ baseURL: API_BASE, withCredentials: true });

// Request logging + auth header
api.interceptors.request.use((config) => {
  (config as any).meta = { start: performance.now() };
  const { accessToken } = useAuth.getState();
  const url = config.url || '';
  const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh') || url.includes('/auth/logout');
  if (accessToken && !isAuthEndpoint) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${accessToken}`;
  }
  log.info('api.request', { method: config.method, url: config.baseURL + url });
  return config;
});

// Single-flight refresh: coalesces concurrent 401s into one refresh request.
let refreshInFlight: Promise<void> | null = null;

api.interceptors.response.use(
  (r) => {
    const ms = performance.now() - ((r.config as any).meta?.start ?? performance.now());
    log.info('api.response', { status: r.status, url: r.config?.url, ms: Math.round(ms) });
    return r;
  },
  async (error) => {
    const { response, config } = error || {};
    const ms = performance.now() - ((config as any)?.meta?.start ?? performance.now());
    log.warn('api.error', { status: response?.status, url: config?.url, ms: Math.round(ms) });
    if (!response || response.status !== 401 || config.__retried) throw error;

    const store = useAuth.getState();
    const url = String(config?.url || '');
    if (url.includes('/auth/refresh')) {
      // If refresh fails, force logout rather than hanging awaiting a refresh that will never succeed.
      store.clear();
      throw error;
    }
    if (!store.refreshToken) {
      store.clear();
      throw error;
    }

    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const res = await refreshApi.post('/auth/refresh', { refresh_token: store.refreshToken });
        store.setTokens(res.data.access_token, res.data.refresh_token);
        log.info('auth.refreshed');
      })()
        .catch((e) => {
          store.clear();
          log.error('auth.refresh_failed');
          throw e;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }

    try {
      await refreshInFlight;
    } catch {
      throw error;
    }

    // retry once with new token
    const retry = { ...config, __retried: true };
    retry.headers = retry.headers || {};
    const { accessToken } = useAuth.getState();
    (retry.headers as any).Authorization = accessToken ? `Bearer ${accessToken}` : undefined;
    return api.request(retry);
  },
);
