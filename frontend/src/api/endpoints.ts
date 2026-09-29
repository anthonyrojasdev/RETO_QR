import { request } from './client';
import type { FactorizeResponse, FactorizeResult, HistoryEntry, LoginResponse, Matrix } from './types';

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

/** GET /api/qr/history → últimas factorizaciones del usuario (PostgreSQL). */
export async function fetchHistory(token: string, limit = 8): Promise<HistoryEntry[]> {
  const { data } = await request<{ items: HistoryEntry[] }>(`/api/qr/history?limit=${limit}`, { token });
  return data.items;
}
