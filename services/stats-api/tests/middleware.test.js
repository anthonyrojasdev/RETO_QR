'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { errorHandler } = require('../src/middleware');

describe('accessLog', () => {
  test('registra cada petición en una línea JSON', async () => {
    const lines = [];
    const app = createApp({ diagonalTolerance: 1e-10, bodyLimit: '1mb', logger: { info: (line) => lines.push(line) } });

    await request(app).get('/health').set('X-Request-ID', 'req-log').expect(200);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ requestId: 'req-log', method: 'GET', path: '/health', status: 200 });
  });
});

describe('errorHandler', () => {
  test('oculta los detalles de errores inesperados y responde 500', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    jest.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(new Error('fallo interno con datos sensibles'), { id: 'req-500' }, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor', requestId: 'req-500' },
    });
  });
});
