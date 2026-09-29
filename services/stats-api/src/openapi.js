'use strict';

const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');

/**
 * Especificación OpenAPI generada a partir de los comentarios @openapi de las rutas.
 * @module openapi
 */
const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Stats API',
      version: '1.0.0',
      description: 'Estadísticas sobre las matrices Q y R de una factorización QR (Node.js + Express).',
    },
    servers: [{ url: '/api', description: 'A través de Kong (requiere JWT)' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  // swagger-jsdoc usa glob, que requiere "/" como separador también en Windows.
  apis: [path.join(__dirname, 'routes', '*.js').split(path.sep).join('/')],
});

module.exports = { openapiSpec };
