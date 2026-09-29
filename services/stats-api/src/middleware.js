'use strict';

const { randomUUID } = require('node:crypto');
const { ApiError, errorBody } = require('./errors');

/**
 * Middlewares transversales de la API.
 * @module middleware
 */

/**
 * Reutiliza el X-Request-ID que llega de Kong o de la QR API (o genera uno)
 * y lo devuelve en la respuesta, para trazar una petición entre servicios.
 *
 * @type {import('express').RequestHandler}
 */
function requestId(req, res, next) {
  req.id = req.get('X-Request-ID') || randomUUID();
  res.set('X-Request-ID', req.id);
  next();
}

/**
 * Registra cada petición en una línea JSON al terminar la respuesta.
 *
 * @param {{ info: (line: string) => void }} logger
 * @returns {import('express').RequestHandler}
 */
function accessLog(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(JSON.stringify({
        time: new Date().toISOString(),
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      }));
    });
    next();
  };
}

/** Responde 404 con el formato común para rutas inexistentes. */
function notFound(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`));
}

/**
 * Convierte cualquier error en una respuesta JSON con el formato común.
 * Incluye los errores del parser de JSON de Express (400 y 413).
 *
 * Express reconoce los manejadores de error por tener cuatro parámetros.
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json(errorBody(err.code, err.message, req.id, err.details));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('INVALID_JSON', 'El cuerpo no es un JSON válido', req.id));
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'El cuerpo supera el tamaño permitido', req.id));
  }
  console.error(JSON.stringify({ requestId: req.id, error: err.message, stack: err.stack }));
  return res.status(500).json(errorBody('INTERNAL_ERROR', 'Error interno del servidor', req.id));
}

module.exports = { requestId, accessLog, notFound, errorHandler };
