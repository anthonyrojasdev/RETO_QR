import { describe, expect, it } from 'vitest';
import { formatRelative, resultToCsv } from './export';
import { randomMatrix } from './matrix';

describe('resultToCsv', () => {
  it('exporta A, Q y R con encabezado y precisión completa', () => {
    const csv = resultToCsv({ matrix: [[1, 2]], Q: [[1]], R: [[1, 2.123456789]] });
    expect(csv).toBe('A (1x2)\n1,2\n\nQ (1x1)\n1\n\nR (1x2)\n1,2.123456789\n');
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  it('usa la unidad más grande que corresponda', () => {
    expect(formatRelative('2026-09-29T11:59:30Z', now)).toBe('hace un momento');
    expect(formatRelative('2026-09-29T11:55:00Z', now)).toBe('hace 5 minutos');
    expect(formatRelative('2026-09-28T12:00:00Z', now)).toBe('ayer');
  });
});

describe('randomMatrix', () => {
  it('genera enteros dentro del rango con el tamaño pedido', () => {
    const values = [0, 0.5, 1, 0.25, 0.75, 0.999];
    let i = 0;
    const matrix = randomMatrix(2, 3, 4, () => values[i++]);
    expect(matrix).toEqual([[-4, 0, 4], [-2, 2, 4]]);
  });
});
