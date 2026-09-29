'use strict';

/**
 * Validación del cuerpo de POST /statistics.
 * @module validation/qrResult
 */

/**
 * Valida que un valor sea una matriz rectangular, no vacía y de números finitos.
 *
 * @param {unknown} value Valor recibido.
 * @param {string} name Nombre de la matriz para los mensajes de error.
 * @returns {string[]} Errores encontrados (vacío si es válida).
 */
function validateMatrix(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    return [`${name} debe ser un arreglo de filas no vacío`];
  }
  if (!Array.isArray(value[0]) || value[0].length === 0) {
    return [`${name}: la fila 1 debe ser un arreglo de números no vacío`];
  }

  const columns = value[0].length;
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!Array.isArray(row) || row.length !== columns) {
      return [`${name} debe ser rectangular: la fila ${i + 1} no tiene ${columns} columnas`];
    }
    for (let j = 0; j < row.length; j++) {
      if (typeof row[j] !== 'number' || !Number.isFinite(row[j])) {
        return [`${name}[${i}][${j}] debe ser un número finito`];
      }
    }
  }
  return [];
}

/**
 * Valida que el cuerpo sea el resultado de una factorización QR:
 * Q (m×m, cuadrada por ser ortogonal) y R (m×n), con el mismo número de filas.
 *
 * @param {unknown} body Cuerpo de la petición.
 * @returns {string[]} Errores encontrados (vacío si es válido).
 */
function validateQRResult(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return ['El cuerpo debe ser un objeto JSON con las matrices Q y R'];
  }

  const errors = [...validateMatrix(body.Q, 'Q'), ...validateMatrix(body.R, 'R')];
  if (errors.length > 0) {
    return errors;
  }

  const { Q, R } = body;
  if (Q.length !== Q[0].length) {
    errors.push(`Q debe ser cuadrada por ser ortogonal (se recibió ${Q.length}×${Q[0].length})`);
  }
  if (R.length !== Q.length) {
    errors.push(`R debe tener ${Q.length} filas para que Q·R sea válido (tiene ${R.length})`);
  }
  return errors;
}

module.exports = { validateQRResult, validateMatrix };
