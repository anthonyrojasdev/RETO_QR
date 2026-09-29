'use strict';

const { createApp } = require('./app');
const { loadConfig } = require('./config');

const config = loadConfig();
const app = createApp({ ...config, logger: console });

const server = app.listen(config.port, () => {
  console.info(JSON.stringify({ message: 'stats-api escuchando', port: config.port }));
});

// Apagado ordenado: deja de aceptar conexiones y termina las peticiones en curso.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.info(JSON.stringify({ message: 'apagando stats-api', signal }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
