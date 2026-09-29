'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const { authenticate, issueToken } = require('./auth');

/**
 * Aplicación Express de la Auth API.
 * @module app
 */

/**
 * @param {string} code
 * @param {string} message
 * @param {string} requestId
 */
function errorBody(code, message, requestId) {
  return { error: { code, message, requestId } };
}

/**
 * @param {{
 *   jwtSecret: string,
 *   tokenTtlSeconds: number,
 *   userStore: import('./users').UserStore,
 *   logger?: { info: (line: string) => void },
 * }} options
 * @returns {import('express').Express}
 */
function createApp({ jwtSecret, tokenTtlSeconds, userStore, logger }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    req.id = req.get('X-Request-ID') || randomUUID();
    res.set('X-Request-ID', req.id);
    if (logger) {
      res.on('finish', () => logger.info(JSON.stringify({
        time: new Date().toISOString(), requestId: req.id, method: req.method, path: req.originalUrl, status: res.statusCode,
      })));
    }
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  /**
   * POST /auth/login
   * Cuerpo: { "username": string, "password": string }
   * Respuesta: { accessToken, tokenType: "Bearer", expiresIn, user: { username, role } }
   */
  app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json(errorBody('INVALID_CREDENTIALS_FORMAT', 'Se requieren username y password', req.id));
    }

    let user;
    try {
      user = await authenticate(userStore, username, password);
    } catch (err) {
      console.error(JSON.stringify({ requestId: req.id, message: 'no se pudo consultar los usuarios', error: err.message }));
      return res.status(503).json(errorBody('AUTH_UNAVAILABLE', 'El servicio de autenticación no está disponible', req.id));
    }
    if (!user) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos', req.id));
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      accessToken: issueToken(user, { secret: jwtSecret, ttlSeconds: tokenTtlSeconds }),
      tokenType: 'Bearer',
      expiresIn: tokenTtlSeconds,
      user: { username: user.username, role: user.role },
    });
  });

  app.use((req, res) => res.status(404).json(errorBody('NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`, req.id)));

  // Errores del parser de JSON (cuerpo inválido o demasiado grande) y errores inesperados.
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json(errorBody('INVALID_JSON', 'El cuerpo no es un JSON válido', req.id));
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'El cuerpo supera el tamaño permitido', req.id));
    }
    console.error(JSON.stringify({ requestId: req.id, error: err.message }));
    return res.status(500).json(errorBody('INTERNAL_ERROR', 'Error interno del servidor', req.id));
  });

  return app;
}

module.exports = { createApp };
