'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { statisticsRouter } = require('./routes/statistics');
const { openapiSpec } = require('./openapi');
const { requestId, accessLog, notFound, errorHandler } = require('./middleware');

/**
 * Crea la aplicación Express. Se separa de server.js para poder probarla
 * en memoria con supertest, sin abrir un puerto.
 *
 * @param {import('./config').Config & { logger?: { info: (line: string) => void } }} options
 * @returns {import('express').Express}
 */
function createApp({ diagonalTolerance, bodyLimit, logger }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  if (logger) {
    app.use(accessLog(logger));
  }
  app.use(express.json({ limit: bodyLimit }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/docs.json', (_req, res) => res.json(openapiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.use(statisticsRouter({ tolerance: diagonalTolerance }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
