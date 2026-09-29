'use strict';

const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
  test('usa valores por defecto', () => {
    expect(loadConfig({})).toEqual({ port: 3000, diagonalTolerance: 1e-10, bodyLimit: '1mb' });
  });

  test('lee las variables de entorno', () => {
    expect(loadConfig({ PORT: '4000', DIAGONAL_TOLERANCE: '0.001', BODY_LIMIT: '2mb' }))
      .toEqual({ port: 4000, diagonalTolerance: 0.001, bodyLimit: '2mb' });
  });

  test.each([
    [{ PORT: 'abc' }, /PORT/],
    [{ PORT: '-1' }, /PORT/],
    [{ DIAGONAL_TOLERANCE: '-5' }, /DIAGONAL_TOLERANCE/],
  ])('rechaza configuración inválida %o', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });
});
