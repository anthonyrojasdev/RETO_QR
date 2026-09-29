import { describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './client';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('request', () => {
  it('envía JSON con el token y devuelve datos y cabeceras', async () => {
    const fetchMock = mockFetch(200, { ok: true }, { 'X-Cache': 'HIT' });

    const response = await request<{ ok: boolean }>('/api/qr', { method: 'POST', body: { matrix: [[1]] }, token: 'abc' });

    expect(response.data).toEqual({ ok: true });
    expect(response.headers.get('X-Cache')).toBe('HIT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/qr');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"matrix":[[1]]}');
  });

  it('convierte el formato de error de los servicios (con mayúscula inicial)', async () => {
    mockFetch(400, {
      error: { code: 'INVALID_MATRIX', message: 'la matriz debe ser rectangular', details: ['fila 2'] },
    }, { 'X-Request-ID': 'req-1' });

    const error = await request('/api/qr').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400, code: 'INVALID_MATRIX', message: 'La matriz debe ser rectangular', details: ['fila 2'], requestId: 'req-1',
    });
  });

  it.each([
    [401, /sesión no es válida/],
    [403, /rol no tiene permiso/],
    [429, /Demasiadas peticiones/],
    [502, /no está disponible/],
  ])('traduce el error %i de Kong a un mensaje claro', async (status, message) => {
    mockFetch(status, { message: 'Unauthorized' });

    const error = await request('/api/qr').catch((e: unknown) => e);

    expect(error).toMatchObject({ status, code: `HTTP_${status}` });
    expect((error as ApiError).message).toMatch(message);
  });

  it('informa cuando no hay conexión con el gateway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(request('/api/qr')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
