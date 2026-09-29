'use strict';

const { validateQRResult } = require('../src/validation/qrResult');

describe('validateQRResult', () => {
  test('acepta el resultado de una factorización QR', () => {
    expect(validateQRResult({ Q: [[1, 0], [0, 1]], R: [[1, 2, 3], [0, 4, 5]] })).toEqual([]);
  });

  test.each([
    ['cuerpo nulo', null, /objeto JSON/],
    ['cuerpo que es un arreglo', [[1]], /objeto JSON/],
    ['falta Q', { R: [[1]] }, /^Q debe ser un arreglo/],
    ['R vacía', { Q: [[1]], R: [] }, /^R debe ser un arreglo/],
    ['fila vacía', { Q: [[]], R: [[1]] }, /fila 1/],
    ['no rectangular', { Q: [[1, 0], [0]], R: [[1], [2]] }, /rectangular/],
    ['texto en la matriz', { Q: [[1]], R: [['2']] }, /R\[0\]\[0\] debe ser un número finito/],
    ['null en la matriz', { Q: [[null]], R: [[1]] }, /Q\[0\]\[0\]/],
    ['Q no cuadrada', { Q: [[1, 0, 0], [0, 1, 0]], R: [[1], [2]] }, /Q debe ser cuadrada/],
    ['filas incompatibles', { Q: [[1, 0], [0, 1]], R: [[1, 2, 3]] }, /R debe tener 2 filas/],
  ])('rechaza: %s', (_name, body, expected) => {
    const errors = validateQRResult(body);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' | ')).toMatch(expected);
  });

  test('informa los errores de Q y de R a la vez', () => {
    expect(validateQRResult({ Q: 'x', R: 5 })).toHaveLength(2);
  });
});
