'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp({ diagonalTolerance: 1e-10, bodyLimit: '1mb' });
const validBody = { Q: [[1, 0], [0, 1]], R: [[3, 1, 2], [0, 4, 5]] };

describe('POST /statistics', () => {
  test('devuelve las estadísticas de Q y R', async () => {
    const res = await request(app).post('/statistics').send(validBody).expect(200);

    expect(res.body).toEqual({
      max: 5,
      min: 0,
      sum: 17,
      average: 1.7,
      count: 10,
      isAnyDiagonal: true,
      matrices: {
        Q: { rows: 2, columns: 2, isDiagonal: true },
        R: { rows: 2, columns: 3, isDiagonal: false },
      },
    });
  });

  test('propaga el X-Request-ID recibido', async () => {
    const res = await request(app)
      .post('/statistics')
      .set('X-Request-ID', 'req-123')
      .send(validBody)
      .expect(200);

    expect(res.headers['x-request-id']).toBe('req-123');
  });

  test('genera un X-Request-ID si no llega', async () => {
    const res = await request(app).post('/statistics').send(validBody).expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('responde 400 con el detalle si las matrices son inválidas', async () => {
    const res = await request(app)
      .post('/statistics')
      .set('X-Request-ID', 'req-400')
      .send({ Q: [[1, 0, 0]], R: [[1]] })
      .expect(400);

    expect(res.body.error).toMatchObject({ code: 'INVALID_MATRICES', requestId: 'req-400' });
    expect(res.body.error.details).toEqual(['Q debe ser cuadrada por ser ortogonal (se recibió 1×3)']);
  });

  test('responde 400 si el JSON está mal formado', async () => {
    const res = await request(app)
      .post('/statistics')
      .set('Content-Type', 'application/json')
      .send('{"Q": [[1]')
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('responde 413 si el cuerpo supera el límite', async () => {
    const smallApp = createApp({ diagonalTolerance: 1e-10, bodyLimit: '100b' });
    const res = await request(smallApp).post('/statistics').send({ Q: [[1]], R: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], padding: 'x'.repeat(200) }).expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('otras rutas', () => {
  test('GET /health', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  test('GET /docs.json expone la especificación OpenAPI', async () => {
    const res = await request(app).get('/docs.json').expect(200);

    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/statistics'].post).toBeDefined();
  });

  test('ruta inexistente responde 404 con el formato común', async () => {
    const res = await request(app).get('/no-existe').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
