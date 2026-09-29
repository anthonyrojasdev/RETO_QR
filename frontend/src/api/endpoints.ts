import { request } from './client';
import type {
  FactorizeResponse, FactorizeResult, HistoryEntry, LoginResponse, Matrix, Statistics, Usage,
} from './types';

/** POST /api/auth/login → Auth API. */
export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await request<LoginResponse>('/api/auth/login', { method: 'POST', body: { username, password } });
  return data;
}

/** POST /api/qr → QR API (Go), que a su vez llama a la Stats API (Node.js). */
export async function factorize(matrix: Matrix, token: string): Promise<FactorizeResult> {
  const { data, headers } = await request<FactorizeResponse>('/api/qr', { method: 'POST', body: { matrix }, token });
  return {
    ...data,
    matrix,
    cached: headers.get('X-Cache') === 'HIT',
    requestId: headers.get('X-Request-ID'),
  };
}

/**
 * GET /api/qr/history → factorizaciones guardadas en PostgreSQL.
 * scope "mine": las del usuario; "all": las de todos, con su autor (solo admin).
 */
export async function fetchHistory(
  token: string,
  { limit = 8, scope = 'mine' }: { limit?: number; scope?: 'mine' | 'all' } = {},
): Promise<HistoryEntry[]> {
  const { data } = await request<{ items: HistoryEntry[] }>(`/api/qr/history?limit=${limit}&scope=${scope}`, { token });
  return data.items;
}

/** GET /api/qr/usage → cálculos por usuario y uso del caché (solo admin). */
export async function fetchUsage(token: string): Promise<Usage> {
  const { data } = await request<Usage>('/api/qr/usage', { token });
  return data;
}

/** POST /api/statistics → Stats API directa, sin pasar por la QR API (Kong solo lo permite a admin). */
export async function computeStatistics(q: Matrix, r: Matrix, token: string): Promise<Statistics> {
  const { data } = await request<Statistics>('/api/statistics', { method: 'POST', body: { Q: q, R: r }, token });
  return data;
}
