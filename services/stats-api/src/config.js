'use strict';

/**
 * Configuración leída de variables de entorno.
 * @module config
 */

/**
 * @typedef {Object} Config
 * @property {number} port Puerto HTTP (PORT, 3000).
 * @property {number} diagonalTolerance Valor absoluto máximo considerado cero (DIAGONAL_TOLERANCE, 1e-10).
 * @property {string} bodyLimit Tamaño máximo del cuerpo JSON (BODY_LIMIT, 1mb).
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Config}
 */
function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  const diagonalTolerance = Number(env.DIAGONAL_TOLERANCE ?? 1e-10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT debe ser un entero positivo');
  }
  if (!Number.isFinite(diagonalTolerance) || diagonalTolerance < 0) {
    throw new Error('DIAGONAL_TOLERANCE debe ser un número no negativo');
  }
  return { port, diagonalTolerance, bodyLimit: env.BODY_LIMIT ?? '1mb' };
}

module.exports = { loadConfig };
