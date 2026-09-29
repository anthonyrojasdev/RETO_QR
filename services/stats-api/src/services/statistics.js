'use strict';

/**
 * Cálculo de estadísticas sobre un conjunto de matrices.
 * @module services/statistics
 */

/** @typedef {number[][]} Matrix Matriz representada fila a fila. */

/**
 * @typedef {Object} MatrixSummary
 * @property {number} rows Número de filas.
 * @property {number} columns Número de columnas.
 * @property {boolean} isDiagonal Si todos los elementos fuera de la diagonal principal son cero.
 */

/**
 * @typedef {Object} Statistics
 * @property {number} max Valor máximo entre todas las matrices.
 * @property {number} min Valor mínimo entre todas las matrices.
 * @property {number} average Promedio de todos los valores.
 * @property {number} sum Suma total de todos los valores.
 * @property {number} count Cantidad de valores analizados.
 * @property {boolean} isAnyDiagonal Si al menos una matriz es diagonal.
 * @property {Object<string, MatrixSummary>} matrices Resumen de cada matriz por nombre.
 */

/**
 * Tolerancia para considerar un valor como cero. La factorización QR usa
 * aritmética de punto flotante, así que un cero exacto puede llegar como 1e-17.
 */
const DEFAULT_TOLERANCE = 1e-10;

/**
 * Indica si una matriz es diagonal: todos los elementos fuera de la diagonal
 * principal (i ≠ j) son cero. Aplica también a matrices rectangulares.
 *
 * @param {Matrix} matrix Matriz rectangular no vacía.
 * @param {number} [tolerance] Valor absoluto máximo que se considera cero.
 * @returns {boolean}
 */
function isDiagonal(matrix, tolerance = DEFAULT_TOLERANCE) {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    for (let j = 0; j < row.length; j++) {
      if (i !== j && Math.abs(row[j]) > tolerance) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Calcula máximo, mínimo, promedio, suma total y la comprobación de matriz
 * diagonal sobre todas las matrices recibidas.
 *
 * Recorre cada valor una sola vez (O(n)) y no usa Math.max(...valores), que
 * puede desbordar la pila con matrices grandes.
 *
 * @param {Object<string, Matrix>} matrices Matrices válidas indexadas por nombre (p. ej. { Q, R }).
 * @param {{ tolerance?: number }} [options]
 * @returns {Statistics}
 */
function computeStatistics(matrices, { tolerance = DEFAULT_TOLERANCE } = {}) {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let count = 0;
  const summaries = {};

  for (const [name, matrix] of Object.entries(matrices)) {
    for (const row of matrix) {
      for (const value of row) {
        if (value > max) max = value;
        if (value < min) min = value;
        sum += value;
        count++;
      }
    }
    summaries[name] = {
      rows: matrix.length,
      columns: matrix[0].length,
      isDiagonal: isDiagonal(matrix, tolerance),
    };
  }

  return {
    max,
    min,
    average: sum / count,
    sum,
    count,
    isAnyDiagonal: Object.values(summaries).some((summary) => summary.isDiagonal),
    matrices: summaries,
  };
}

module.exports = { computeStatistics, isDiagonal, DEFAULT_TOLERANCE };
