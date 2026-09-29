'use strict';

const { Pool } = require('pg');
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createMemoryUserStore, createPostgresUserStore } = require('./users');

const log = (fields) => console.info(JSON.stringify(fields));

/**
 * Prepara el almacén de usuarios: PostgreSQL si hay DATABASE_URL (reintenta
 * mientras la base arranca), o memoria en desarrollo local.
 *
 * @param {import('./config').Config} config
 */
async function createUserStore(config) {
  if (!config.databaseUrl) {
    log({ message: 'sin DATABASE_URL: usuarios en memoria' });
    return { store: await createMemoryUserStore(config.users), close: async () => {} };
  }

  const pool = new Pool({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const store = createPostgresUserStore(pool);
  for (let attempt = 1; ; attempt++) {
    try {
      await store.migrate();
      break;
    } catch (err) {
      if (attempt >= 15) throw err;
      log({ message: 'esperando a PostgreSQL', attempt, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const created = await store.seed(config.users);
  log({ message: 'usuarios en PostgreSQL', created });
  return { store, close: () => pool.end() };
}

async function main() {
  const config = loadConfig();
  const { store, close } = await createUserStore(config);
  const app = createApp({
    jwtSecret: config.jwtSecret,
    tokenTtlSeconds: config.tokenTtlSeconds,
    userStore: store,
    logger: console,
  });

  const server = app.listen(config.port, () => log({ message: 'auth-api escuchando', port: config.port }));

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(async () => {
        await close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ message: 'no se pudo iniciar auth-api', error: err.message }));
  process.exit(1);
});
