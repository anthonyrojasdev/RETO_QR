// Pruebas de extremo a extremo a través de Kong, con todos los servicios reales.
//
//   docker compose up -d --build --wait
//   node --test tests/e2e/
//
// Usan los usuarios de .env.example. E2E_BASE_URL cambia la URL de Kong (por defecto http://localhost:8000).
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8000';
const SPEC_MATRIX = [[1, 2, 3], [4, 5, 6]];

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* respuesta sin JSON */ }
  return { status: response.status, headers: response.headers, json };
}

async function login(username, password) {
  const res = await call('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(res.status, 200, `login de ${username}: ${JSON.stringify(res.json)}`);
  return res.json.accessToken;
}

let analystToken;
let adminToken;

before(async () => {
  analystToken = await login('analyst', 'Analyst123!');
  adminToken = await login('admin', 'Admin123!');
});

describe('autenticación (Kong + Auth API)', () => {
  test('credenciales incorrectas → 401', async () => {
    const res = await call('/api/auth/login', { method: 'POST', body: { username: 'analyst', password: 'mala' } });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'INVALID_CREDENTIALS');
  });

  test('sin token → 401 de Kong, sin llegar a la QR API', async () => {
    const res = await call('/api/qr', { method: 'POST', body: { matrix: SPEC_MATRIX } });
    assert.equal(res.status, 401);
  });

  test('token con firma inválida → 401', async () => {
    const [header, payload] = analystToken.split('.');
    const res = await call('/api/qr', { method: 'POST', body: { matrix: SPEC_MATRIX }, token: `${header}.${payload}.firma-falsa` });
    assert.equal(res.status, 401);
  });
});

describe('factorización QR (Kong → Go → Node)', () => {
  test('devuelve Q, R y las estadísticas del ejemplo del enunciado', async () => {
    const res = await call('/api/qr', { method: 'POST', body: { matrix: SPEC_MATRIX }, token: analystToken });
    assert.equal(res.status, 200, JSON.stringify(res.json));

    const s = 1 / Math.sqrt(17);
    const { Q, R, statistics } = res.json;
    assert.equal(Q.length, 2);
    assert.equal(R[0].length, 3);
    assert.ok(Math.abs(Q[0][0] - s) < 1e-12);
    assert.ok(Math.abs(R[0][0] - 17 * s) < 1e-12);
    assert.equal(R[1][0], 0);
    assert.ok(Math.abs(statistics.max - 27 * s) < 1e-12);
    assert.ok(Math.abs(statistics.sum - 83 * s) < 1e-12);
    assert.equal(statistics.count, 10);
    assert.equal(statistics.isAnyDiagonal, false);
    assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}/i);
  });

  test('una matriz repetida sale del caché de Redis', async () => {
    const matrix = [[Date.now() % 97, 1], [2, 3]];
    const first = await call('/api/qr', { method: 'POST', body: { matrix }, token: analystToken });
    const second = await call('/api/qr', { method: 'POST', body: { matrix }, token: analystToken });

    assert.equal(first.headers.get('x-cache'), 'MISS');
    assert.equal(second.headers.get('x-cache'), 'HIT');
    assert.deepEqual(second.json, first.json);
  });

  test('detecta matrices diagonales', async () => {
    const res = await call('/api/qr', { method: 'POST', body: { matrix: [[2, 0], [0, 3]] }, token: analystToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.statistics.isAnyDiagonal, true);
  });

  test('matriz no rectangular → 400 con el formato común de error', async () => {
    const res = await call('/api/qr', { method: 'POST', body: { matrix: [[1, 2], [3]] }, token: analystToken });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'INVALID_MATRIX');
    assert.ok(res.json.error.requestId);
  });

  test('guarda el cálculo en el historial del usuario (PostgreSQL)', async () => {
    const matrix = [[7, Date.now() % 89], [1, 4]];
    await call('/api/qr', { method: 'POST', body: { matrix }, token: analystToken });

    const res = await call('/api/qr/history?limit=5', { token: analystToken });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.items[0].matrix, matrix);

    const adminHistory = await call('/api/qr/history?limit=50', { token: adminToken });
    assert.ok(!adminHistory.json.items.some((item) => JSON.stringify(item.matrix) === JSON.stringify(matrix)),
      'un usuario no debe ver el historial de otro');
  });
});

describe('autorización por rol (ACL de Kong)', () => {
  const body = { Q: [[1, 0], [0, 1]], R: [[2, 1], [0, 3]] };

  test('analyst no puede llamar directamente a la Stats API → 403', async () => {
    const res = await call('/api/statistics', { method: 'POST', body, token: analystToken });
    assert.equal(res.status, 403);
  });

  test('admin sí puede → 200', async () => {
    const res = await call('/api/statistics', { method: 'POST', body, token: adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.max, 3);
    assert.equal(res.json.isAnyDiagonal, true);
  });
});

describe('políticas transversales de Kong', () => {
  test('CORS permite al frontend', async () => {
    const res = await fetch(`${BASE_URL}/api/qr`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  test('conserva el X-Request-ID recibido', async () => {
    const res = await call('/api/qr', { method: 'POST', body: { matrix: [[1]] }, token: analystToken, headers: { 'X-Request-ID': 'e2e-trace-1' } });
    assert.equal(res.headers.get('x-request-id'), 'e2e-trace-1');
  });

  test('la documentación OpenAPI es pública', async () => {
    assert.equal((await fetch(`${BASE_URL}/api/docs/qr/doc.json`)).status, 200);
    assert.equal((await fetch(`${BASE_URL}/api/docs/stats/`)).status, 200);
  });

  test('el login tiene límite de peticiones por IP → 429', async () => {
    let limited = false;
    for (let i = 0; i < 15 && !limited; i++) {
      const res = await call('/api/auth/login', { method: 'POST', body: { username: 'x', password: 'y' } });
      limited = res.status === 429;
    }
    assert.ok(limited, 'se esperaba 429 tras superar 10 intentos por minuto');
  });
});
