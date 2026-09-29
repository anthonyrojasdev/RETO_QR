'use strict';

/**
 * Formato común de errores, igual al de la QR API:
 * { "error": { "code", "message", "requestId", "details"? } }
 * @module errors
 */

/**
 * Error de la API con su estado HTTP y un código estable.
 */
class ApiError extends Error {
  /**
   * @param {number} status Estado HTTP.
   * @param {string} code Código del error (p. ej. INVALID_MATRICES).
   * @param {string} message Descripción legible.
   * @param {string[]} [details] Detalle de cada problema encontrado.
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Construye el cuerpo JSON de un error.
 *
 * @param {string} code
 * @param {string} message
 * @param {string} [requestId]
 * @param {string[]} [details]
 */
function errorBody(code, message, requestId, details) {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

module.exports = { ApiError, errorBody };
