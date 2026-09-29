'use strict';

const { computeStatistics, isDiagonal } = require('../src/services/statistics');

// Resultado exacto de la factorización QR del ejemplo del enunciado [[1,2,3],[4,5,6]].
const s = 1 / Math.sqrt(17);
const Q = [[s, 4 * s], [4 * s, -s]];
const R = [[17 * s, 22 * s, 27 * s], [0, 3 * s, 6 * s]];

describe('isDiagonal', () => {
  test.each([
    ['identidad', [[1, 0], [0, 1]], true],
    ['diagonal con ceros en la diagonal', [[0, 0], [0, 5]], true],
    ['una celda', [[7]], true],
    ['rectangular diagonal', [[1, 0, 0], [0, 2, 0]], true],
    ['ruido de punto flotante', [[1, 1e-17], [-1e-12, 2]], true],
    ['triangular superior', [[1, 2], [0, 3]], false],
    ['valor fuera de la diagonal', [[1, 0, 0], [0, 2, 0.001]], false],
  ])('%s', (_name, matrix, expected) => {
    expect(isDiagonal(matrix)).toBe(expected);
  });

  test('respeta la tolerancia indicada', () => {
    expect(isDiagonal([[1, 0.01], [0, 1]], 0.1)).toBe(true);
    expect(isDiagonal([[1, 0.01], [0, 1]], 0.001)).toBe(false);
  });
});

describe('computeStatistics', () => {
  test('calcula las estadísticas del ejemplo del enunciado', () => {
    const stats = computeStatistics({ Q, R });

    expect(stats.max).toBeCloseTo(27 * s, 12);
    expect(stats.min).toBeCloseTo(-s, 12);
    expect(stats.sum).toBeCloseTo(83 * s, 12);
    expect(stats.average).toBeCloseTo((83 * s) / 10, 12);
    expect(stats.count).toBe(10);
    expect(stats.isAnyDiagonal).toBe(false);
    expect(stats.matrices).toEqual({
      Q: { rows: 2, columns: 2, isDiagonal: false },
      R: { rows: 2, columns: 3, isDiagonal: false },
    });
  });

  test('detecta si alguna matriz es diagonal', () => {
    const stats = computeStatistics({ Q: [[1, 0], [0, 1]], R: [[2, 3], [0, 4]] });

    expect(stats.isAnyDiagonal).toBe(true);
    expect(stats.matrices.Q.isDiagonal).toBe(true);
    expect(stats.matrices.R.isDiagonal).toBe(false);
  });

  test('funciona con valores negativos', () => {
    const stats = computeStatistics({ A: [[-3, -1], [-2, -8]] });

    expect(stats).toMatchObject({ max: -1, min: -8, sum: -14, average: -3.5, count: 4 });
  });

  test('procesa matrices grandes sin desbordar la pila', () => {
    const size = 1000; // 1 000 000 de valores: Math.max(...valores) fallaría
    const big = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => (i === j ? i : 0)));

    const stats = computeStatistics({ big });

    expect(stats.max).toBe(size - 1);
    expect(stats.min).toBe(0);
    expect(stats.count).toBe(size * size);
    expect(stats.matrices.big.isDiagonal).toBe(true);
  });
});
