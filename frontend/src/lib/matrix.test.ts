import { describe, expect, it } from 'vitest';
import { formatNumber, matrixToText, parseMatrix, verifyFactorization } from './matrix';

describe('parseMatrix', () => {
  it.each([
    ['espacios', '1 2 3\n4 5 6'],
    ['comas y punto y coma', '1, 2; 3\n4,5,6'],
    ['líneas vacías y saltos de Windows', '\r\n1 2 3\r\n\r\n4 5 6\r\n'],
    ['JSON', '[[1, 2, 3], [4, 5, 6]]'],
  ])('acepta %s', (_name, text) => {
    expect(parseMatrix(text)).toEqual({ ok: true, matrix: [[1, 2, 3], [4, 5, 6]] });
  });

  it('acepta decimales, negativos y notación científica', () => {
    expect(parseMatrix('-1.5 2e-3\n0 .25')).toEqual({ ok: true, matrix: [[-1.5, 0.002], [0, 0.25]] });
  });

  it.each([
    ['vacía', '   ', /Escribe una matriz/],
    ['texto', '1 2\n3 x', /Fila 2, columna 2: "x" no es un número/],
    ['no rectangular', '1 2 3\n4 5', /rectangular: la fila 2 tiene 2 valores/],
    ['JSON inválido', '[[1, 2]', /JSON no es válido/],
    ['JSON con texto', '[[1, "2"]]', /arreglo de filas con números/],
    ['JSON sin columnas', '[[]]', /al menos una fila y una columna/],
    ['demasiado grande', Array.from({ length: 101 }, () => '1').join('\n'), /tamaño máximo es 100×100/],
  ])('rechaza: %s', (_name, text, message) => {
    const result = parseMatrix(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe('formatNumber', () => {
  it('usa decimales fijos y muestra como 0 los residuos de redondeo', () => {
    expect(formatNumber(4.123105625617661)).toBe('4.1231');
    expect(formatNumber(-0.242535625)).toBe('-0.2425');
    expect(formatNumber(-1e-17)).toBe('0.0000');
    expect(formatNumber(-0)).toBe('0.0000');
    expect(formatNumber(2.5, 2)).toBe('2.50');
  });
});

describe('matrixToText', () => {
  it('es el inverso de parseMatrix', () => {
    const matrix = [[1, -2.5], [3e-4, 4]];
    expect(parseMatrix(matrixToText(matrix))).toEqual({ ok: true, matrix });
  });
});

describe('verifyFactorization', () => {
  it('confirma la factorización del enunciado', () => {
    const s = 1 / Math.sqrt(17);
    const check = verifyFactorization(
      [[1, 2, 3], [4, 5, 6]],
      [[s, 4 * s], [4 * s, -s]],
      [[17 * s, 22 * s, 27 * s], [0, 3 * s, 6 * s]],
    );
    expect(check.reconstructionError).toBeLessThan(1e-12);
    expect(check.orthogonalityError).toBeLessThan(1e-12);
  });

  it('detecta un resultado incorrecto', () => {
    const check = verifyFactorization([[1, 2], [3, 4]], [[1, 0], [0, 1]], [[1, 2], [3, 5]]);
    expect(check.reconstructionError).toBe(1);
  });
});
