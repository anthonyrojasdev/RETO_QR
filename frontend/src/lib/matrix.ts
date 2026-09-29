import type { Matrix } from '../api/types';

/** Igual que MAX_MATRIX_DIMENSION de la QR API: se valida antes de enviar. */
export const MAX_DIMENSION = 100;

export type ParseResult = { ok: true; matrix: Matrix } | { ok: false; error: string };

/** Matrices de ejemplo para probar rápidamente distintos casos. */
export const EXAMPLES: { label: string; matrix: Matrix }[] = [
  { label: 'Enunciado (2×3)', matrix: [[1, 2, 3], [4, 5, 6]] },
  { label: 'Cuadrada (3×3)', matrix: [[12, -51, 4], [6, 167, -68], [-4, 24, -41]] },
  { label: 'Alta (4×2)', matrix: [[1, 2], [3, 4], [5, 6], [7, 8]] },
  { label: 'Diagonal (3×3)', matrix: [[2, 0, 0], [0, 3, 0], [0, 0, 5]] },
];

/**
 * Convierte texto en una matriz. Acepta una fila por línea con números separados
 * por espacios, comas o punto y coma (decimales con punto), o JSON: [[1,2],[3,4]].
 */
export function parseMatrix(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: 'Escribe una matriz: una fila por línea.' };
  }
  if (trimmed.startsWith('[')) {
    return parseJson(trimmed);
  }

  const matrix: Matrix = [];
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const row: number[] = [];
    for (const [j, token] of lines[i].split(/[\s,;]+/).filter(Boolean).entries()) {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        return { ok: false, error: `Fila ${i + 1}, columna ${j + 1}: "${token}" no es un número.` };
      }
      row.push(value);
    }
    matrix.push(row);
  }
  return validateShape(matrix);
}

function parseJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El JSON no es válido. Ejemplo: [[1, 2, 3], [4, 5, 6]]' };
  }
  const isMatrix = Array.isArray(value) && value.every(
    (row) => Array.isArray(row) && row.every((v) => typeof v === 'number' && Number.isFinite(v)),
  );
  if (!isMatrix) {
    return { ok: false, error: 'El JSON debe ser un arreglo de filas con números: [[1, 2], [3, 4]]' };
  }
  return validateShape(value as Matrix);
}

/** Comprueba que la matriz sea rectangular, no vacía y dentro del tamaño permitido. */
export function validateShape(matrix: Matrix): ParseResult {
  if (matrix.length === 0 || matrix[0].length === 0) {
    return { ok: false, error: 'La matriz debe tener al menos una fila y una columna.' };
  }
  const columns = matrix[0].length;
  const irregular = matrix.findIndex((row) => row.length !== columns);
  if (irregular !== -1) {
    return {
      ok: false,
      error: `La matriz debe ser rectangular: la fila ${irregular + 1} tiene ${matrix[irregular].length} valores y la fila 1 tiene ${columns}.`,
    };
  }
  if (matrix.length > MAX_DIMENSION || columns > MAX_DIMENSION) {
    return { ok: false, error: `El tamaño máximo es ${MAX_DIMENSION}×${MAX_DIMENSION}.` };
  }
  return { ok: true, matrix };
}

/** Convierte una matriz al formato del editor (una fila por línea). */
export function matrixToText(matrix: Matrix): string {
  return matrix.map((row) => row.join(' ')).join('\n');
}

/** Formatea un número con decimales fijos; los residuos de redondeo se muestran como 0. */
export function formatNumber(value: number, decimals = 4): string {
  if (Math.abs(value) < 0.5 * 10 ** -decimals) return (0).toFixed(decimals);
  return value.toFixed(decimals);
}

/** Formatea errores muy pequeños en notación científica (p. ej. 4.44e-16). */
export function formatError(value: number): string {
  return value === 0 ? '0' : value.toExponential(2);
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}

export function transpose(a: Matrix): Matrix {
  return a[0].map((_, j) => a.map((row) => row[j]));
}

/** Mayor diferencia absoluta entre dos matrices del mismo tamaño. */
export function maxAbsDifference(a: Matrix, b: Matrix): number {
  let max = 0;
  a.forEach((row, i) => row.forEach((value, j) => { max = Math.max(max, Math.abs(value - b[i][j])); }));
  return max;
}

export function identity(size: number): Matrix {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
}

/**
 * Verifica el resultado en el navegador: A ≈ Q·R y Qᵀ·Q ≈ I.
 * Los errores deberían estar cerca de la precisión de la máquina (~1e-15).
 */
export function verifyFactorization(a: Matrix, q: Matrix, r: Matrix) {
  return {
    reconstructionError: maxAbsDifference(multiply(q, r), a),
    orthogonalityError: maxAbsDifference(multiply(transpose(q), q), identity(q.length)),
  };
}

/**
 * Matriz aleatoria de enteros en [-range, range]. random se inyecta en las pruebas.
 */
export function randomMatrix(rows: number, columns: number, range = 9, random: () => number = Math.random): Matrix {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => Math.round((random() * 2 - 1) * range)));
}
